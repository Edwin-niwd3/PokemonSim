from poke_env.player.player import Player
from poke_env.battle import AbstractBattle, Weather, Field, Observation, Status
import numpy as np
import gym

#Map out the different status effects to integers
STATUS_MAP = {
    Status.SLP: 1,
    Status.PAR: 2,
    Status.BRN: 3,
    Status.PSN: 4,
    Status.FRZ: 5,
    Status.TOX: 6,
    None: 0,
}

# We will support Doubles VGC
N_MOVES = 4
N_POKEMON = 6

# Action space:
# 0-3 = moves targeting opponent 1
# 4-7 = moves targeting opponent 2
# 8 = switch slot 1
# ...
# 13 = switch slot 6
ACTION_SPACE_SIZE = (N_MOVES * 2) + N_POKEMON  # 8 moves + 6 switches = 14

class VGCEnv(Player):
    def __init__(self, battle_format = "gen9vgc2024regf", *args, **kwargs):
        super().__init__(battle_format=battle_format, *args, **kwargs)

        self.last_observation = None

        self.action_space = gym.spaces.Discrete(ACTION_SPACE_SIZE)

        # Example observation size (we refine later)
        self.observation_space = gym.spaces.Box(
            low=-1, high=1, shape=(50,), dtype=np.float32
        )

    # RL needs this
    def embed_battle(self, battle: AbstractBattle) -> np.ndarray:
        return self.encode_state(battle)
    
    def _encode_single_move(move):
        """Encode a poke-env Move object into a small numeric vector. If the move is None, return zeros."""
        if move is None:
            return np.zeros(6, dtype=np.float32)
        basePower = float(move.base_power or 0.0)/200.0
        accuracy = float(move.accuracy or 100.0)/100.0
        #check if move is physical or special
        cat_phy = 1.0 if getattr(move, 'category', "").lower().startswith('physical') else 0.0
        cat_spc = 1.0 if getattr(move, 'category', "").lower().startswith('special') else 0.0
        #check the priority of the move, normalize by 8
        priority = float(getattr(move, 'priority', 0))/8.0
        
        pp_fraction = float((move.current_pp if hasattr(move, "current_pp") else getattr(move, "pp", None) or 0))/max(1.0, float(getattr(move, "max_pp", getattr(move,"pp",4))))

        #check if the move is a spread move
        is_spread = 1.0 if getattr(move, "is_spread", False) else 0.0

        return np.array([basePower, accuracy, cat_phy, cat_spc, priority, pp_fraction, is_spread], dtype=np.float32)
    
    def _encode_pokemon_basic(pokemon):
        """Encode basic per-Pokemon features: hp_frac, status_id, 6 stat boosts, is_fainted"""

        hp = float(pokemon.current_hp_fraction or 0.0)
        status = STATUS_MAP.get(pokemon.status, 0)
        boosts = []
        bmap = ["atk", "def", "spa", "spd", "spe", "accuracy"]
        for key in ["atk", "def", "spa", "spd", "spe", "accuracy"]:
            v = getattr(pokemon, "boost", None)
            if hasattr(pokemon, "boosts") and isinstance(pokemon.boosts, dict):
                val = float(pokemon.boosts.get(key,0))
            else:
                val = float(getattr(pokemon, f"boost_{key}", 0))

            boosts.append(val/6.0)  # Normalize boost to [-1,1]
        is_able = 1.0 if getattr(pokemon, "status") is None and (getattr(pokemon, "current_hp_fraction", 0.0) > 0.0) else 0.0
        return np.concatenate([[hp, float(status)], np.array(boosts, dtype=np.float32), [is_able]]).astype(np.float32)

        

    # Where RL picks action
    async def choose_move(self, battle: AbstractBattle):
        obs = self.encode_state(battle)
        legal_mask = self.get_action_mask(battle)
        action = self.act(obs, legal_mask)  # We'll fill act() next
        return self.map_action_to_command(action, battle)

    # Stub — filled in below
    def encode_state(self, battle: AbstractBattle):
        """
        VGC doubles encoder.
        -Expects battle.active_pokemon to be a list-like len = 2, and opponent_active_pokemon similarly.
        """
        assert isinstance(battle, AbstractBattle)

        features = []
        # Encode our active Pokemon (2)
        for i in range(2):
            try:
                p = battle.active_pokemon[i]
            except Exception:
                p = None
            features.append(self._encode_pokemon_basic(p))
            moves_list = []
            if hasattr(battle, "available_moves") and battle.available_moves is not None:
                if p is not None and getattr(p, "moves", None):
                    moves_list = list(p.moves.values())[:4]
            if not moves_list and p is not None and getattr(p, "moves", None):
                moves_list = list(p.moves.values())[:4]
            for j in range(4):
                m = moves_list[j] if j < len(moves_list) else None
                features.append(self._encode_single_move(m))
        # Encode benched Pokemon (2)
        bench_hp_feats = []
        my_party = []
        if hasattr(battle, "team") and getattr(battle, "team") is not None:
            try:
                my_party = battle.team
            except Exception:
                my_party = []
        bench_slots = []
        if hasattr(battle, "available_switches"):
            bench_slots = list(battle.available_switches)
        #pad bench to 4
        for i in range(4):
            if i < len(bench_slots):
                bp = bench_slots[i]
                hp = float(getattr(bp, "current_hp_fraction", 0.0))
                able = 1.0 if (hp > 0.0) else 0.0
                bench_hp_feats.append(np.array([hp, able], dtype=np.float32))
            else:
                bench_hp_feats.append(np.array([0.0, 0.0], dtype=np.float32))
        for f in bench_hp_feats:
            features.append(f)

        # Encode opponent active Pokemon (2)
        for i in range(2):
            try:
                q = battle.opponent_active_pokemon[i]
            except Exception:
                q = None
            #encode only basic info, we don't know opponent stuff
            features.append(self._encode_pokemon_basic(q))

            #only encode visible information when available
            moves_list = []
            if q is not None and getattr(q, "moves", None):
                moves_list = list(q.moves.values())[:4]
            for j in range(4):
                m = moves_list[j] if j < len(moves_list) else None
                features.append(self._encode_single_move(m))
        #Encode field effects, like weather and terrain
        weather_vec = np.array([
            1.0 if getattr(battle, "weather", None) == Weather.SUNNY_DAY else 0.0,
            1.0 if getattr(battle, "weather", None) == Weather.RAIN else 0.0,
            1.0 if getattr(battle, "weather", None) == Weather.SANDSTORM else 0.0,
            1.0 if getattr(battle, "weather", None) == Weather.HAIL else 0.0,
        ], dtype=np.float32)

        terrain_vec = np.array([
            1.0 if getattr(battle, "terrain", None) == Field.ELECTRIC_TERRAIN else 0.0,
            1.0 if getattr(battle, "terrain", None) == Field.GRASSY_TERRAIN else 0.0,
            1.0 if getattr(battle, "terrain", None) == Field.MISTY_TERRAIN else 0.0,
            1.0 if getattr(battle, "terrain", None) == Field.PSYCHIC_TERRAIN else 0.0,
        ], dtype=np.float32)

        tailwind = 1.0 if getattr(battle, "tailwind", False) else 0.0
        trick_room = 1.0 if getattr(battle, "trick_room", False) else 0.0
        screens = 1.0 if getattr(battle, "screens", False) else 0.0

        #turns
        turn = float(getattr(battle, "turn", 0))/100.0 

        #concatenate everything
        flat = np.concatenate([np.ravel(x) for x in features] + [weather_vec, terrain_vec, np.array([tailwind, trick_room, screens, turn], dtype=np.float32)])

        #pad to fixed size
        target_len = 120
        if flat.size > target_len:
            flat = flat[:target_len]
        elif flat.size < target_len:
            flat = np.concatenate([flat, np.zeros(target_len - flat.size, dtype=np.float32)])
        return flat.astype(np.float32)


    def get_action_mask(self, battle: AbstractBattle):
        mask = np.zeros(ACTION_SPACE_SIZE, dtype = np.float32)

        for i, move in enumerate(battle.available_moves):
            #check what moves are legal
            #Pokemon 1
            mask[i] = 1.0
            #Pokemon 2
            mask[i+N_MOVES] = 1.0

        for i, mon in enumerate(battle.available_switches):
            #Check what switches are legal
            mask[N_MOVES*2 + i] = 1.0
        
        return mask

    def map_action_to_command(self, action, battle: AbstractBattle):
        if action < N_MOVES * 2:
            move_id = action % N_MOVES
            target = 1 if action < N_MOVES else 2

            available_moves = battle.available_moves
            #If our move is in the available moves
            if move_id < len(available_moves):
                
                move = available_moves[move_id]
                
                return self.create_order(move, 
                target=target)
        #What if we want to switch
        switch_index = action - (N_MOVES * 2)
        available_switches = battle.available_switches
        if 0 <= switch_index < len(available_switches):
            #If our index we want to switch to is valid, send out the command
            return self.create_order(available_switches[switch_index])