# train_and_export.py
# Train PPO on the ToyVGCEnv and export the learned policy to ONNX.

import os
import torch
import numpy as np
from stable_baselines3 import PPO
from stable_baselines3.common.vec_env import DummyVecEnv
from toy_vgc_env import ToyVGCEnv

MODEL_DIR = "model"
os.makedirs(MODEL_DIR, exist_ok=True)
MODEL_PATH = os.path.join(MODEL_DIR, "ppo_toy_vgc")
ONNX_PATH = os.path.join(MODEL_DIR, "ppo_toy_vgc.onnx")

def make_env():
    return ToyVGCEnv()

def train(total_timesteps=int(1e5)):
    # vectorize env (single worker here)
    env = DummyVecEnv([make_env])

    model = PPO("MlpPolicy", env,
                verbose=1,
                batch_size=64,
                n_steps=2048,
                ent_coef=0.01,
                learning_rate=2.5e-4)

    model.learn(total_timesteps=total_timesteps)
    model.save(MODEL_PATH)
    print("Saved model to", MODEL_PATH)

    export_onnx(model, ONNX_PATH, env)

def export_onnx(model, onnx_path, vec_env):
    # Export a small wrapper to map obs -> logits (policy)
    # Find obs_dim
    obs_shape = vec_env.observation_space.shape if hasattr(vec_env, "observation_space") else vec_env.envs[0].observation_space.shape
    obs_dim = obs_shape[0]
    action_dim = model.action_space.n

    policy = model.policy
    policy.to("cpu")
    policy.eval()

    # Build wrapper
    class PolicyWrapper(torch.nn.Module):
        def __init__(self, policy):
            super().__init__()
            self.policy = policy

        def forward(self, obs):
            # obs: torch tensor [batch, obs_dim]
            # SB3 has utility policy._get_latent(obs) -> (latent_pi, latent_vf)
            # and action_net to map latent->logits
            # We'll attempt to use these; if names differ, this may need adjustments.
            with torch.no_grad():
                # convert to torch float
                if not torch.is_tensor(obs):
                    obs = torch.tensor(obs, dtype=torch.float32)
                latent_pi, __ = self.policy.mlp_extractor(obs)  # latent_pi
                logits = self.policy.action_net(latent_pi)
                return logits

    # dummy input
    dummy = torch.randn(1, obs_dim, dtype=torch.float32)

    wrapper = PolicyWrapper(policy)
    wrapper.eval()

    torch.onnx.export(
        wrapper,
        dummy,
        onnx_path,
        input_names=["state"],
        output_names=["logits"],
        dynamic_axes={"state": {0: "batch"}, "logits": {0: "batch"}},
        opset_version=13
    )
    print("Exported ONNX to", onnx_path)

if __name__ == "__main__":
    train(total_timesteps=20000)  # smaller so it finishes quickly
