import asyncio
from poke_env import Player
from poke_env.teambuilder import Teambuilder
from poke_env.player import RandomPlayer
from poke_env.ps_client import LocalhostServerConfiguration
from vgc_env import VGCEnv  # <-- your env class

async def test_environment():
    # A simple random bot to trigger battles
    opponent = RandomPlayer(battle_format="gen9vgc2024regf")
    
    # Your environment player
    env = VGCEnv(battle_format="gen9vgc2024regf", server_configuration = LocalhostServerConfiguration)

    # Test: start a battle
    await env.battle_against(opponent, n_battles=1)

    # Get battle reference
    battle = env.current_battle

    print("Battle started ✅")

    # Test encode_state
    obs = env.encode_state(battle)
    print("Observation vector length:", len(obs))
    print(obs[:20], "...")  # print first 20 features

    # Test action mask
    mask = env.get_action_mask(battle)
    print("Action mask:", mask)
    print("Legal actions count:", mask.sum())

asyncio.run(test_environment())
