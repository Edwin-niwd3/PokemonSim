import asyncio
import numpy as np
from poke_env import Player
from poke_env.teambuilder import Teambuilder
from poke_env.player import RandomPlayer, Player
from poke_env.ps_client import LocalhostServerConfiguration
from poke_env import AccountConfiguration, ShowdownServerConfiguration
from vgc_env import VGCEnv  # <-- your env class

# ------------------------------
# Define your team
# ------------------------------
class RandomTeamFromPool(Teambuilder):
    def __init__(self, team):
        self.packed_team = []
        parsed_team = self.parse_showdown_team(team)
        packed_team = self.join_team(parsed_team)
        self.packed_team.append(packed_team)

    def yield_team(self):
        return self.packed_team

team_1 = """
Rotom-Wash @ Leftovers
Ability: Levitate
EVs: 248 HP / 44 SpA / 216 Spe
Bold Nature
IVs: 0 Atk
- Volt Switch
- Hydro Pump
- Will-O-Wisp
- Pain Split

Garchomp @ Rocky Helmet
Ability: Rough Skin
EVs: 252 HP / 164 Def / 92 Spe
Impish Nature
- Earthquake
- Dragon Tail
- Stealth Rock
- Fire Blast

Iron Valiant @ Booster Energy
Ability: Quark Drive
EVs: 252 Atk / 4 SpD / 252 Spe
Jolly Nature
- Close Combat
- Knock Off
- Spirit Break
- Swords Dance

Corviknight @ Leftovers
Ability: Pressure
EVs: 252 HP / 168 Def / 88 SpD
Impish Nature
- Body Press
- Roost
- Defog
- U-turn

Heatran @ Leftovers
Ability: Flash Fire
EVs: 252 HP / 136 SpD / 120 Spe
Calm Nature
IVs: 0 Atk
- Magma Storm
- Earth Power
- Taunt
- Toxic

Amoongus @ Rocky Helmet
Ability: Regenerator
EVs: 252 HP / 172 Def / 84 SpD
Bold Nature
IVs: 0 Atk
- Giga Drain
- Sludge Bomb
- Spore
- Clear Smog
"""

team_2 = """
Glimmora @ Focus Sash
Ability: Toxic Debris
EVs: 252 SpA / 4 SpD / 252 Spe
Timid Nature
IVs: 0 Atk
- Stealth Rock
- Mortal Spin
- Power Gem
- Earth Power

Dragapult @ Choice Specs
Ability: Infiltrator
EVs: 252 SpA / 4 SpD / 252 Spe
Timid Nature
IVs: 0 Atk
- Shadow Ball
- Draco Meteor
- U-turn
- Flamethrower

Kingambit @ Black Glasses
Ability: Supreme Overlord
EVs: 252 HP / 252 Atk / 4 SpD
Adamant Nature
- Kowtow Cleave
- Sucker Punch
- Iron Head
- Swords Dance

Iron Moth @ Booster Energy
Ability: Quark Drive
EVs: 4 Def / 252 SpA / 252 Spe
Timid Nature
IVs: 0 Atk
- Fiery Dance
- Sludge Wave
- Energy Ball
- Dazzling Gleam

Dragonite @ Heavy-Duty Boots
Ability: Multiscale
EVs: 252 Atk / 4 SpD / 252 Spe
Adamant Nature
- Dragon Dance
- Extreme Speed
- Earthquake
- Ice Spinner

Great Tusk @ Choice Scarf
Ability: Protosynthesis
EVs: 252 Atk / 4 SpD / 252 Spe
Jolly Nature
- Headlong Rush
- Close Combat
- Knock Off
- Rapid Spin
"""

custom_builder1 = RandomTeamFromPool(team_1)
custom_builder2 = RandomTeamFromPool(team_2)

#print("custom_builder1 yielded:", list(custom_builder1.yield_team()))
#print("custom_builder2 yielded:", list(custom_builder2.yield_team()))

# ------------------------------
# Main async battle function
# ------------------------------
async def test_vgc_battle():

    # Server configuration
    server_config = LocalhostServerConfiguration

    # Opponent: random moves
    opponent = RandomPlayer(
        battle_format="gen9randomdoublesbattle",
        server_configuration=server_config,
    )

    # Your environment player
    env = VGCEnv(
        battle_format="gen9randomdoublesbattle",
        server_configuration=server_config,
        start_timer_on_battle_start=True,
    )

    print("Env created. Starting battle...")

    # Start a single battle
    await env.battle_against(opponent, n_battles=1)
    print("Battle finished ✅")
    print("Battle logs:")
    print(env.get_battles()[0].battle_log)  # prints full battle log


# ------------------------------
# Run async
# ------------------------------
if __name__ == "__main__":
    asyncio.run(test_vgc_battle())