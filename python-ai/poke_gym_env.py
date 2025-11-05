# poke_gym_env.py
# A Gym env skeleton that wraps poke-env battles for RL training.
# You must adapt the TODOs below to your specific team format and state/action encoding.
import gym
import numpy as np
from gym import spaces
from poke_env.player import Player  # high-level Player base class
from poke_env.status import Status  # Pokémon status enums
from poke_env.player import RandomPlayer  # example baseline opponent
from poke_env.battle import AbstractBattle  # battle objects
from typing import Tuple, Dict, Any

class PokeGymEnv(gym.Env):
    """
    Gym wrapper around a poke-env battle.
    This is a synchronous env: reset() starts a new battle; step(action_index) issues
    one decision for the controlled side and returns the observation, reward, done, info.

    IMPORTANT:
      - You must implement `encode_state(battle: AbstractBattle)` to return a fixed-length np.float32 vector.
      - You must implement an action mapping (action index -> move/switch) and provide valid-action masks.
      - poke-env can run via Showdown (recommended). Use poke-env docs for connecting players.
        See: https://poke-env.readthedocs.io (examples & Gym wrapper).
    """

    metadata = {"render.modes": ["human"]}

    def __init__(
        self,
        team_path: str = None,
        max_turns: int = 200,
        opponent: Player = None,
        state_dim: int = 256,
        action_dim: int = 128,
    ):
        super().__init__()

        # Dimensions used by your policy (tune these)
        self.state_dim = state_dim
        self.action_dim = action_dim

        # Gym spaces
        self.observation_space = spaces.Box(low=-np.inf, high=np.inf, shape=(self.state_dim,), dtype=np.float32)
        # We use a discrete flattened action space (move+target combos + switches).
        self.action_space = spaces.Discrete(self.action_dim)

        # poke-env player placeholders
        self.team_path = team_path
        self.max_turns = max_turns

        # Example opponent: RandomPlayer (you will probably use other scripted opponents and self-play)
        self.opponent = opponent or RandomPlayer()

        # internal battle state
        self.battle = None
        self.current_mask = np.ones(self.action_dim, dtype=bool)

        # any extra bookkeeping
        self.turn = 0

    # -------------------------
    # Methods to implement/override for your specific use-case
    # -------------------------
    def _start_new_battle(self):
        """
        TODO: Implement a method to create a new poke-env battle instance and connect it.
        Options:
          - Use poke-env Player objects and make them play (poke-env examples show how).
          - Or run a local Showdown server and have the 'Player' connect and play one battle
            per reset/blocking call.
        See poke-env docs for reinforcement learning with the Gym wrapper. :contentReference[oaicite:3]{index=3}
        """
        raise NotImplementedError("Connect this wrapper to your poke-env battle / Showdown server")

    def encode_state(self, battle: AbstractBattle) -> np.ndarray:
        """
        TODO: Turn the current battle object into a fixed-length vector of length self.state_dim.
        Typical features:
          - active Pokémon HP fraction, stat boosts, statuses
          - partner Pokémon HP/boosts/status
          - visible opponent active Pokémon (HP fraction, boosts, status)
          - field conditions (weather, terrain, Tailwind, Trick Room, screens)
          - available moves' base power / category / targets / PP
          - turn number
        IMPORTANT: encoding must be identical during training and inference (Node side).
        """
        assert isinstance(battle, AbstractBattle)
        active1 = battle.active_pokemon
        active2 = battle.partner_active_pokemon
        opp1 = battle.opponent_active_pokemon
        opp2 = battle.opponent_partner_active_pokemon

        active_hp = active1.current_hp_fraction if active1 else 0.0
        active2_hp = active2.current_hp_fraction if active2 else 0.0
        opp1_hp = opp1.current_hp_fraction if opp1 else 0.0
        opp2_hp = opp2.current_hp_fraction if opp2 else 0.0

        status_map = {
            None: 0.0,
            Status.SLEEP: 1.0,
            Status.PARALYZE: 2.0,
            Status.POISON: 3.0,
            Status.BURN: 4.0,
            Status.FROZEN: 5.0,
            Status.CONFUSION: 6.0,
        }
 

        moves_power = -np.ones(4)
        for i, move in enumerate(battle.available_moves):
            moves_power[i] = (move.base_power/100)
        final_vector = np.concatenate(
            [
                moves_power,
                np.array([battle.active_pokemon.current_hp_fraction]),
                np.array([battle.active_pokemon.status]),
                np.array([battle.turn_number]),
                np.array([battle.field_conditions]),
            ]
        )
        return final_vector.astype(np.float32)

        raise NotImplementedError("You must implement encode_state(battle)")
    
    def encode_pokemon(self, pokemon) -> list:
        if pokemon is None:
            return [0,0] + [0]*8
        
        status_map = {
            None: 0,
            Status.SLEEP: 1,
            Status.PARALYZE: 2,
            Status.POISON: 3,
            Status.BURN: 4,
            Status.FROZEN: 5,
            Status.CONFUSION: 6,
        }

    def get_action_mask(self, battle: AbstractBattle) -> np.ndarray:
        """
        TODO: Return a boolean mask of length self.action_dim with True for legal actions.
        This mask must align to your action-index -> (move/switch/target) mapping.
        Prefer returning it with dtype=bool.
        """
        # Default: allow everything (NOT safe for real training)
        return np.ones(self.action_dim, dtype=bool)

    def map_action_to_command(self, action_index: int) -> Dict[str, Any]:
        """
        TODO: Convert chosen action index into the command your battle engine understands,
        e.g., {"type":"move","slot":0,"move":"Thunderbolt","target":"opp1"} or
              {"type":"switch","swap_in_slot":2}
        This mapping must be stored (and immutable) and the same mapping used during training + inference.
        """
        raise NotImplementedError("Implement action mapping")

    # -------------------------
    # Gym API
    # -------------------------
    def reset(self, *, seed=None, options=None):
        # Start a new battle and return the initial observation
        self.turn = 0
        self.battle = self._start_new_battle()  # Implemented by you / your infra
        # Wait until the battle object is in a state where we can extract observation (synchronous)
        obs = self.encode_state(self.battle)
        self.current_mask = self.get_action_mask(self.battle)
        return obs, {}

    def step(self, action: int) -> Tuple[np.ndarray, float, bool, bool, Dict]:
        """
        Single decision step for the controlled player. For doubles VGC, one 'step' can correspond
        to a single decision for the side controlled by the agent (the environment must handle the
        opponent action(s) synchronously).
        """
        self.turn += 1

        # translate action index -> command the battle engine accepts
        cmd = self.map_action_to_command(action)

        # TODO: apply the action to the battle. This depends on how you integrate poke-env with Gym.
        # Example pseudo:
        #   self.battle.apply_action(cmd)
        #   self.battle.play_until_next_decision()  # run any simultaneous actions and progress
        # The battle object will update internally.
        raise NotImplementedError("Implement battle action application and progression")

        # After the battle advances, compute new observation
        obs = self.encode_state(self.battle)
        mask = self.get_action_mask(self.battle)
        done = self.battle.finished or (self.turn >= self.max_turns)
        reward = self._compute_reward()
        info = {"action_mask": mask}

        self.current_mask = mask
        return obs, float(reward), bool(done), False, info

    def _compute_reward(self) -> float:
        """
        Reward shaping:
          - +1 for winning, -1 for losing (sparse)
          - small rewards for knockouts or HP advantage (shaped)
        Keep shaped rewards small compared to episode win/loss signal.
        """
        # TODO: use actual battle state to compute reward.
        return 0.0

    def render(self, mode="human"):
        # Optional: print battle summary / replay
        print("Turn:", self.turn)
