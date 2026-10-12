# PokemonSim

Backend for the Pokemon win-rate calculator. It runs headless Pokemon Showdown battles between two user-built teams, with a scripted bot controlling each side, and reports how often each team wins. The frontend lives in the sibling folder `../pkmn-sim-frontend`.

Two parts live here:

| Folder | What it is | Status |
|---|---|---|
| `Node-Server/` | Express API that runs the battles using `@pkmn/sim`, plus the heuristic bots | Working, bots need improvement |
| `python-ai/` | Reinforcement-learning experiments built on `poke-env` and Stable Baselines 3 | Experimental, not connected to the server |

## Node-Server

### Requirements

- Node.js 22 or newer (tested on 22.14)
- npm

### Install and run

```bash
cd Node-Server
npm install
node simulation.js
```

The server listens on `http://localhost:3000`. There is no build step; the files are plain ES modules.

### Endpoints

`GET /`
Health check. Returns a plain-text message.

`POST /simulation/abtest`
Runs many battles between two teams and returns win rates. This is the endpoint the frontend uses.

Request body:

```json
{
  "team1Json": [ /* array of Pokemon, see Team format */ ],
  "team2Json": [ /* array of Pokemon */ ],
  "formatJson": "gen9ou",
  "numSimulations": 100
}
```

Response:

```json
{
  "message": "Ran 100 simulations.",
  "totalBattles": 100,
  "player1Wins": 54,
  "player2Wins": 46,
  "draws": 0,
  "averageDurationMs": "38.12",
  "winRates": { "player1": "54.0%", "player2": "46.0%", "draws": "0.0%" }
}
```

If either team fails Showdown's validator for the chosen format, the server responds with status 400 and `errorTeam1` / `errorTeam2` arrays of validation messages.

`POST /simulation/begin`
Runs a single battle and returns the full battle log plus a report of what each bot learned about its opponent. Takes the same body as `abtest` minus `numSimulations`. Useful for debugging bot behaviour.

### Team format

Teams are arrays of Pokemon objects in the same shape `@pkmn/sim` uses for `Teams.pack`:

```json
{
  "species": "Garchomp",
  "name": "",
  "item": "Rocky Helmet",
  "ability": "Rough Skin",
  "nature": "Impish",
  "evs": { "hp": 252, "atk": 0, "def": 164, "spa": 0, "spd": 0, "spe": 92 },
  "ivs": { "hp": 31, "atk": 31, "def": 31, "spa": 31, "spd": 31, "spe": 31 },
  "moves": ["Earthquake", "Dragon Tail", "Stealth Rock", "Fire Blast"]
}
```

`formatJson` is a Showdown format id such as `gen9ou` or `gen9vgc2024regh`. Teams are validated against that format before any battle runs.

### The bots

`singlesAI.js` and `doublesAI.js` each export a class extending `RandomPlayerAI` from `@pkmn/sim`. They work in two layers:

1. **State tracking.** Every chunk of the battle log is fed through `updateState`, which records the opponent's revealed Pokemon, moves, status conditions, and HP, and tracks the bot's own active Pokemon and fainted slots.
2. **Decision.** `chooseMove` picks a playstyle by turn and situation. The first few turns prefer scouting moves such as Protect or Substitute. If the opponent has revealed a super-effective move, the bot looks for a switch that resists it. Otherwise it scores each move on type effectiveness, STAB, status chance, priority, recoil, and recovery, then samples a move weighted by score.

Only `SinglesAI` is wired into the server today. `DoublesAI` is a copy of the singles bot with unfinished slot handling and is not used yet.

Known issues in the current bots, in rough priority order:

- Move scoring ignores base power, so there is no real damage estimate.
- Switch targets are computed from team-builder order, but Showdown reorders slots during a battle, so switches can go to the wrong Pokemon.
- The fallback to the base class's random choice passes the wrong argument type and crashes the battle.
- Moves with a status effect get a NaN score and are never chosen.
- Forced switches after a faint and team preview are left to random choice.

## python-ai

Early reinforcement-learning work toward replacing the scripted bots with a trained policy. Nothing here is used by the server yet.

| File | Purpose |
|---|---|
| `playground/vgc_env.py` | A `poke-env` player for doubles with a state encoder and action mask. The policy is still random. |
| `playground/test_env.py` | Runs one battle of `VGCEnv` against a random player on a local Showdown server. |
| `playground/toy_vgc_env.py` | A tiny stand-in Gym environment (not real Pokemon) used to test the training and export pipeline. |
| `playground/train_and_export.py` | Trains PPO on the toy environment and exports the policy to ONNX. Produces the files in `model/`. |
| `playground/train_ppo.py` | Training template that imports a `poke_gym_env` module that does not exist yet. |
| `singles_RL(OLD).py` | Abandoned Ray RLlib approach for singles. Kept for reference. |

The model files in `model/` were trained on the toy environment and cannot play real battles.

### Setup

Python 3.10 is required (newer versions do not work with the pinned `gym` and `poke-env` releases).

```powershell
cd python-ai
py -3.10 -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

Note that both `requirements.txt` files are saved as UTF-16. If pip rejects them, convert first:

```powershell
Get-Content requirements.txt | Set-Content -Encoding utf8 requirements.utf8.txt
pip install -r requirements.utf8.txt
```

### Local Showdown server

`poke-env` talks to a real Pokemon Showdown server over WebSocket. The scripts expect one on `localhost:8000` with authentication disabled. From a clone of the `pokemon-showdown` repository:

```bash
node pokemon-showdown start --no-security
```

## Roadmap

1. Share one decision core between the singles and doubles bots so fixes are made once.
2. Read the bot's own side from the request object the simulator sends instead of parsing the log.
3. Add a damage estimate and doubles-aware targeting, spread moves, and Protect timing.
4. Add a benchmark script that runs each bot against the random bot with sides swapped.
5. Route doubles formats to `DoublesAI` and expose VGC formats in the frontend.
6. Revisit reinforcement learning with the heuristic bot as the training opponent.
