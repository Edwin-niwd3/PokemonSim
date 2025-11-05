import asyncio
from poke_env import Player
from poke_env.teambuilder import Teambuilder
from poke_env.player import RandomPlayer, Player
from poke_env.ps_client import LocalhostServerConfiguration
from poke_env import AccountConfiguration, ShowdownServerConfiguration
from vgc_env import VGCEnv  # <-- your env class

# ------------------------------
# Define your team
# ------------------------------
class MyTeam(Teambuilder):
    def __init__(self):
        super().__init__()

    def yield_team(self):
        self.add_pokemon(
            "Gholdengo",
            ability="goodasgold",
            item="leftovers",
            moves=["makeitrain", "shadowball", "nastyplot", "protect"]
        )
        self.add_pokemon(
            "Flutter Mane",
            ability="protosynthesis",
            item="focussash",
            moves=["shadowball","moonblast","protect","icywind"]
        )
        self.add_pokemon(
            "Arcanine",
            ability="intimidate",
            item="sitrusberry",
            moves=["flareblitz","extremespeed","snarl","protect"]
        )
        self.add_pokemon(
            "Amoonguss",
            ability="regenerator",
            item="rockyhelmet",
            moves=["spore","ragepowder","pollenpuff","protect"]
        )

        yield self.pack_team()


# ------------------------------
# Main async battle function
# ------------------------------
async def test_vgc_battle():
    # Create packed team
    vgc_team = MyTeam()

    # Server configuration
    server_config = LocalhostServerConfiguration

    # Opponent: random moves
    opponent = RandomPlayer(
        battle_format="gen8randombattle",
        server_configuration=server_config,

    )

    # Your environment player
    env = VGCEnv(
        battle_format="gen8randombattle",
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