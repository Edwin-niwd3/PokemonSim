# train_ppo.py
import os
import torch
import numpy as np

from stable_baselines3 import PPO
from stable_baselines3.common.callbacks import CheckpointCallback, EvalCallback
import gym

# Import your env (register or instantiate directly)
from poke_gym_env import PokeGymEnv  # the skeleton above

MODEL_DIR = "model"
os.makedirs(MODEL_DIR, exist_ok=True)
MODEL_PATH = os.path.join(MODEL_DIR, "ppo_poke_policy")
ONNX_PATH = os.path.join(MODEL_DIR, "ppo_poke_policy.onnx")

def make_env():
    # instantiate your environment (fill the params)
    env = PokeGymEnv(
        team_path="teams/my_team.json",
        max_turns=200,
        state_dim=256,
        action_dim=128,
        opponent=None,  # or a RandomPlayer / scripted player
    )
    return env

def train(total_timesteps=int(1e6)):
    env = make_env()
    # you can also wrap env in a VecEnv for parallel training (recommended later)
    model = PPO("MlpPolicy", env, verbose=1, batch_size=64, n_steps=2048, ent_coef=0.01, learning_rate=2.5e-4)

    # Checkpoint callback
    ckpt_cb = CheckpointCallback(save_freq=100_000, save_path=MODEL_DIR, name_prefix="ppo_poke")
    model.learn(total_timesteps=total_timesteps, callback=ckpt_cb)

    model.save(MODEL_PATH)
    print("Saved SB3 model to", MODEL_PATH)

    # Export underlying PyTorch policy to ONNX
    export_policy_to_onnx(model, ONNX_PATH, env.observation_space.shape, env.action_space.n)
    print("Exported ONNX to", ONNX_PATH)

def export_policy_to_onnx(model: PPO, onnx_path: str, obs_shape, action_dim: int):
    """
    Exports SB3 PyTorch policy (actor) to ONNX.
    We will export the policy's forward pass that maps observations -> logits (raw action values).
    """
    # Get policy network (PyTorch Module)
    # For SB3 PPO with MlpPolicy, model.policy.predict_values(...) etc. but the policy module is model.policy
    policy = model.policy
    policy.to("cpu")
    policy.eval()

    # Build a minimal wrapper to expose a simple forward(obs) -> logits
    class PolicyWrapper(torch.nn.Module):
        def __init__(self, policy):
            super().__init__()
            self.policy = policy

        def forward(self, obs):
            # obs is a Tensor with shape [batch, obs_dim]
            # The policy.features_extractor + mlp_extractor produce the latent -> action distribution
            # For categorical actions (Discrete), SB3 uses a Linear layer to produce action logits.
            # We replicate the forward used by SB3 to get un-normalized logits.
            # Use policy._get_action_dist_from_latent for internals (but it's not exported-friendly).
            # We'll call policy.policy_net/actor_net if available.

            # WARNING: internal names may vary by SB3 version. This wrapper assumes MlpPolicy layout.
            # For robust use, inspect model.policy.mlp_extractor and model.policy.action_net.
            latent_pi = self.policy._get_latent(obs)[0]  # returns (latent_pi, latent_vf)
            logits = self.policy.action_net(latent_pi)
            return logits

    # Create a dummy input matching observation shape
    obs_dim = obs_shape[0]
    dummy = torch.randn(1, obs_dim, dtype=torch.float32)

    wrapper = PolicyWrapper(policy)

    # Export with dynamic batch
    torch.onnx.export(
        wrapper,
        dummy,
        onnx_path,
        input_names=["state"],
        output_names=["logits"],
        dynamic_axes={"state": {0: "batch"}, "logits": {0: "batch"}},
        opset_version=13,
    )

if __name__ == "__main__":
    train(total_timesteps=int(2e5))  # smaller default so you can test quickly
