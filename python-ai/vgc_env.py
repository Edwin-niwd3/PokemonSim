from poke_env.player.player import Player
from poke_env.battle import AbstractBattle, Weather, Field, Observation, Status, move_category as MoveCategory
import numpy as np
import gym

# Lightweight wrapper so we can return a protocol message while still
# providing the `.message` attribute poke-env expects on Choice objects.
class _ProtocolChoice:
    def __init__(self, message: str):
        self.message = message

    def __repr__(self):
        return f"_ProtocolChoice({self.message!r})"


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
ACTION_SPACE_SIZE = (N_MOVES * 2) + N_POKEMON  # 8 moves + 6 switches = 14 choices

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
    
    def _encode_single_move(self, move):
        """Encode a poke-env Move object into a small numeric vector. If the move is None, return zeros."""
        if move is None:
            return np.zeros(6, dtype=np.float32)
        basePower = float(move.base_power or 0.0)/200.0
        accuracy = float(move.accuracy or 100.0)/100.0
        #check if move is physical or special
        cat_phy = 1.0 if move.category == MoveCategory.PHYSICAL else 0.0
        cat_spc = 1.0 if move.category == MoveCategory.SPECIAL else 0.0
        #check the priority of the move, normalize by 8
        priority = float(getattr(move, 'priority', 0))/8.0
        
        pp_fraction = float((move.current_pp if hasattr(move, "current_pp") else getattr(move, "pp", None) or 0))/max(1.0, float(getattr(move, "max_pp", getattr(move,"pp",4))))

        #check if the move is a spread move
        is_spread = 1.0 if getattr(move, "is_spread", False) else 0.0

        return np.array([basePower, accuracy, cat_phy, cat_spc, priority, pp_fraction, is_spread], dtype=np.float32)
    
    def _encode_pokemon_basic(self, pokemon):
        """Encode basic per-Pokemon features: hp_frac, status_id, 6 stat boosts, is_fainted"""

        if pokemon is None:
            return np.zeros(9, dtype=np.float32)

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
    
    #Just pick a move randomly for now
    def act(self, obs, legal_mask):
        # Get indices of allowed actions
        legal_actions = np.where(legal_mask)[0]
        
        # Randomly pick one
        action_idx = np.random.choice(legal_actions)
        
        return action_idx

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
            1.0 if getattr(battle, "weather", None) == Weather.SUNNYDAY else 0.0,
            1.0 if getattr(battle, "weather", None) == Weather.RAINDANCE else 0.0,
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
            active_slot = 0 if action < N_MOVES else 1
            target = 1 if action < N_MOVES else 2

            available_moves = battle.available_moves
            #If our move is in the available moves
            if move_id < len(available_moves):
                
                move = available_moves[move_id]
                
                return self.create_order(move, battle, active_slot ,target=target)
        #What if we want to switch
        switch_index = action - (N_MOVES * 2)
        available_switches = battle.available_switches
        if 0 <= switch_index < len(available_switches):
            #If our index we want to switch to is valid, send out the command
            return self.create_order(available_switches[switch_index], battle)
        
    def create_order(self, move_or_switch, battle, active_slot: int = 0, target: int = None):
        """
        Build and return a poke-env "order" for either:
        - a move (move_or_switch is a Move object from battle.available_moves), or
        - a switch candidate (move_or_switch is one of battle.available_switches entries).

        We need 'battle' so we can use the active pokemon objects and the available_switches list.
        active_slot: 0 or 1 (which of our active pokemon is acting)
        target: optional (1 or 2) for doubles target selection (if needed)
        """

        # --- MOVE case ---
        # move objects typically have attributes like 'id' or 'name' or 'pp' so use that to detect a move.
        if hasattr(move_or_switch, "id") or hasattr(move_or_switch, "name"):
            # get the active Pokemon object (poke-env ActivePokemon)
            # battle.active_pokemon may be a single Pokemon or a list-like of Pokemon.
            ap = getattr(battle, 'active_pokemon', None)
            if ap is None:
                user_pokemon = None
            elif hasattr(ap, '__getitem__'):
                # list-like (tuple/list)
                try:
                    user_pokemon = ap[active_slot]
                except Exception:
                    # fallback to first element if available
                    try:
                        user_pokemon = ap[0]
                    except Exception:
                        user_pokemon = ap
            else:
                # single Pokemon object
                user_pokemon = ap

            # poke-env active pokemon usually exposes a method to create a move order or to use a move:
            # Preferred pattern (if available): use the active Pokemon's helper
            # Example: return user_pokemon.use_move(move_or_switch, target=target)
            # If your version uses a differently named method, adapt accordingly.

            try:
                # Most poke-env versions accept the "use_move" helper on the active pokemon
                return user_pokemon.use_move(move_or_switch, target=target)
            except AttributeError:
                # fallback: some versions use "create_order" on the battle or return a protocol string
                # Protocol fallback (string): "move <move_index+1> <target>"
                # If move_or_switch came from battle.available_moves, it may not carry its index.
                # Use move name string if the object supports it:
                move_name = getattr(move_or_switch, "name", None) or getattr(move_or_switch, "id", None)
                if move_name:
                    if target is not None:
                        return _ProtocolChoice(f"move {move_name} {target}")
                    return _ProtocolChoice(f"move {move_name}")
                raise

        # --- SWITCH case ---
        # move_or_switch is expected to be one entry from battle.available_switches (a Pokemon-like object)
        # Find its index in the available_switches list
        try:
            # If the object itself is one of the available_switches, we can find its index:
            switch_index = None
            if move_or_switch in battle.available_switches:
                switch_index = battle.available_switches.index(move_or_switch)
            else:
                # If move_or_switch is not object but e.g. species name or slot number, handle that:
                # If it's an integer, interpret as index:
                if isinstance(move_or_switch, int):
                    switch_index = move_or_switch
                elif isinstance(move_or_switch, str):
                    # find by species/name in available_switches
                    for i, s in enumerate(battle.available_switches):
                        if getattr(s, "species", None) == move_or_switch or getattr(s, "name", None) == move_or_switch:
                            switch_index = i
                            break

            if switch_index is None:
                # As a safe fallback, try switching to the first available slot:
                if len(battle.available_switches) == 0:
                    # nothing to switch to
                    return None
                switch_index = 0

            # Many poke-env implementations provide a helper like `switch_in` on the Pokemon object
            try:
                # preferred: call the specific switch helper on the chosen switch object
                switch_obj = battle.available_switches[switch_index]
                return switch_obj.switch_in()
            except AttributeError:
                # fallback: call a battle-level request or return a protocol string
                # protocol string: "switch <slot_num>" where slot_num is 1-based index into party
                # Here we attempt to pull a party slot number from the switch object if available:
                slot_num = getattr(battle.available_switches[switch_index], "party_index", None)
                if slot_num is None:
                    # fallback to 1-based index
                    slot_num = switch_index + 1
                return _ProtocolChoice(f"switch {slot_num}")
        except Exception as e:
            # If anything unexpected happens, log and return None
            print("create_order: failed to produce order:", e)
            return None