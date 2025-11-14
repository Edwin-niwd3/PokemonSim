# toy_vgc_env.py
# Minimal toy VGC Doubles Gym environment (discrete, deterministic) for testing RL + ONNX export.
# Not a real Pokemon simulator — replace internals later with poke-env integration.

import gym
import numpy as np
from gym import spaces

class ToyVGCEnv(gym.Env):
    """
    Toy doubles environment:
      - Two active mons per side
      - Each active mon has 2 "moves" (low/high damage) and 2 bench mons to switch to.
      - Agent chooses a combined action that encodes both active mons' decisions.
      - Observations: numeric vector describing HP % of 4 mons (our 2, opp 2), moves base power, weather (one-hot), turn.
    Action encoding:
      - per-mon choices A = 4 (0,1 => moves ; 2,3 => switch to bench slot 0/1)
      - combined action = a0 * A + a1  (where a0 is action for slot 0, a1 for slot 1)
    """
    def __init__(self, max_turns=100):
        super().__init__()
        # per-mon choices
        self.A = 4
        self.action_space = spaces.Discrete(self.A * self.A)  # combined actions for both active mons

        # observation dims:
        # our two active mons: hp, status(0/1), move1_power, move2_power  => 4 features per mon
        # opp two active mons: hp, status(0/1) => 2 features per mon
        # weather: 1 float (0/1)
        # turn normalized: 1
        self.obs_dim = 2 * 4 + 2 * 2 + 1 + 1
        self.observation_space = spaces.Box(low=-np.inf, high=np.inf, shape=(self.obs_dim,), dtype=np.float32)

        self.max_turns = max_turns
        self.reset()

    def reset(self):
        # Setup a simple "team" structure: hp fractions and move powers
        # Our team: two actives + two bench; Opponent: two actives (no bench for simplicity)
        self.turn = 0
        # Represent HP fractions
        self.our_hp = np.array([1.0, 1.0, 1.0, 1.0], dtype=np.float32)  # two active, two bench
        self.opp_hp = np.array([1.0, 1.0], dtype=np.float32)
        # Moves: for each active we have two moves with a base power
        # shape (2 active, 2 moves)
        self.our_moves_power = np.array([[40.0, 90.0], [35.0, 100.0]], dtype=np.float32)
        # statuses: 0 or 1 (no status / status)
        self.our_status = np.array([0, 0], dtype=np.int32)
        self.opp_status = np.array([0, 0], dtype=np.int32)

        # weather: 0 or 1 (bool)
        self.weather = 0

        self.done = False
        return self._get_obs()

    def _get_obs(self):
        # Build observation vector consistent shape
        our_vec = []
        for i in range(2):
            our_vec += [
                float(self.our_hp[i]),             # hp fraction
                float(self.our_status[i]),         # status 0/1
                float(self.our_moves_power[i, 0]) / 200.0,  # normalized move power
                float(self.our_moves_power[i, 1]) / 200.0,
            ]
        opp_vec = []
        for i in range(2):
            opp_vec += [float(self.opp_hp[i]), float(self.opp_status[i])]

        obs = np.array(our_vec + opp_vec + [float(self.weather), float(self.turn / self.max_turns)], dtype=np.float32)
        return obs

    def get_action_mask(self):
        # Simple mask: disallow switching to a bench mon that is dead (hp=0)
        mask_per_mon = np.ones(self.A, dtype=bool)
        # switch slots (encoded at indices 2 and 3)
        # bench slots: our_hp[2], our_hp[3]
        if self.our_hp[2] <= 0.0:
            mask_per_mon[2] = False
        if self.our_hp[3] <= 0.0:
            mask_per_mon[3] = False
        # combined mask is outer product
        combined = np.zeros(self.A * self.A, dtype=bool)
        for a0 in range(self.A):
            for a1 in range(self.A):
                combined[a0 * self.A + a1] = mask_per_mon[a0] and mask_per_mon[a1]
        return combined

    def map_action_to_commands(self, action):
        # decode combined action into per-slot actions
        a0 = action // self.A
        a1 = action % self.A
        # For toy env, actions 0/1 = move 0/1; actions 2/3 = switch to bench 0/1 correspondingly
        def decode(a):
            if a in (0,1):
                return {"type": "move", "move_idx": a}
            else:
                bench_idx = 2 + (a - 2)  # 2 or 3
                return {"type": "switch", "bench_idx": bench_idx}
        return decode(a0), decode(a1)

    def step(self, action):
        assert self.action_space.contains(action)
        if self.done:
            return self.reset(), 0.0, True, {}

        mask = self.get_action_mask()
        if not mask[action]:
            # illegal -> small penalty and skip
            reward = -0.1
            self.done = False
            self.turn += 1
            return self._get_obs(), reward, False, {"illegal": True}

        cmd0, cmd1 = self.map_action_to_commands(action)

        # Resolve both actions deterministically:
        # - move: subtract hp from chosen target(s)
        # - switch: swap hp of active and bench
        # For simplicity, moves always target opponent active slot 0 (toy)
        reward = 0.0

        # resolve slot 0
        if cmd0["type"] == "move":
            power = self.our_moves_power[0, cmd0["move_idx"]]
            dmg = power / 200.0  # normalized damage
            self.opp_hp[0] = max(0.0, self.opp_hp[0] - dmg)
            if self.opp_hp[0] == 0.0:
                reward += 0.5
        else:  # switch
            bench = cmd0["bench_idx"]
            # swap hp between active 0 and bench
            self.our_hp[bench], self.our_hp[0] = self.our_hp[0], self.our_hp[bench]
            reward += 0.0

        # resolve slot 1 similarly (targets opp slot 1)
        if cmd1["type"] == "move":
            power = self.our_moves_power[1, cmd1["move_idx"]]
            dmg = power / 200.0
            self.opp_hp[1] = max(0.0, self.opp_hp[1] - dmg)
            if self.opp_hp[1] == 0.0:
                reward += 0.5
        else:
            bench = cmd1["bench_idx"]
            self.our_hp[bench], self.our_hp[1] = self.our_hp[1], self.our_hp[bench]

        # Opponent turn (simple scripted policy): both opp use low-damage move to damage our active mons
        # Opp move damage fixed small
        self.our_hp[0] = max(0.0, self.our_hp[0] - 0.05)
        self.our_hp[1] = max(0.0, self.our_hp[1] - 0.05)
        if self.our_hp[0] == 0.0:
            reward -= 0.5
        if self.our_hp[1] == 0.0:
            reward -= 0.5

        # small reward for remaining HP advantage each step
        reward += (self.our_hp[0] + self.our_hp[1]) - (self.opp_hp[0] + self.opp_hp[1])

        self.turn += 1
        # Terminal when one side all faint or turn limit reached
        our_fainted = (self.our_hp[0] <= 0.0 and self.our_hp[1] <= 0.0)
        opp_fainted = (self.opp_hp[0] <= 0.0 and self.opp_hp[1] <= 0.0)
        if our_fainted or opp_fainted or self.turn >= self.max_turns:
            self.done = True
            # big final reward
            if opp_fainted and not our_fainted:
                reward += 5.0
            elif our_fainted and not opp_fainted:
                reward -= 5.0

        return self._get_obs(), float(reward), bool(self.done), {}

if __name__ == "__main__":
    # quick sanity
    env = ToyVGCEnv()
    obs = env.reset()
    print("Obs shape:", obs.shape)
    for _ in range(5):
        a = env.action_space.sample()
        o, r, d, info = env.step(a)
        print("r", r, "done", d)
        if d:
            break
