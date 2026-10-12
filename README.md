# PokemonSim

Backend for the Pokemon win-rate calculator. It runs headless Pokemon Showdown battles between two user-built teams, with a scripted bot controlling each side, and reports how often each team wins. The frontend lives in the sibling folder `../pkmn-sim-frontend`.

Two parts live here:

| Folder | What it is | Status |
|---|---|---|
| `Node-Server/` | Express API that runs the battles using `@pkmn/sim`, plus the heuristic singles and doubles bots and a benchmark harness | Working. Singles bot wins ~87% vs random, doubles bot ~89% vs random |
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

### Files

| File | Purpose |
|---|---|
| `simulation.js` | Express server and the two endpoints below |
| `singlesAI.js` | `SinglesAI`, the heuristic bot for 6v6 singles. Used by the server. |
| `doublesAI.js` | `DoublesAI_v2`, the current heuristic bot for doubles / VGC. Not wired into the server yet. |
| `doublesAI_v1.js` | `DoublesAI_v1`, the previous doubles bot without the Protect logic. Kept so the bench can compare versions. |
| `Testing.js` | Benchmark harness that pits any two bots against each other on random-battle teams |
| `playground/doublesAI.js` | The original doubles bot, a copy of the singles bot with half-finished slot handling. Dead code, kept for reference. |

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

Both endpoints always use `SinglesAI` for both sides, regardless of format. Doubles formats will validate and run, but the singles bot does not understand two active slots, so results in those formats are not meaningful yet.

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

### The singles bot (`SinglesAI`)

Extends `RandomPlayerAI` from `@pkmn/sim` and overrides `chooseMove` and `chooseSwitch`. It works in two layers:

1. **State tracking.** Every chunk of the battle log passes through `updateState`, which records the opponent's revealed Pokemon, moves, status conditions, and HP, and tracks the bot's own active Pokemon and fainted slots.
2. **Decision.** `chooseMove` first checks whether the opponent has revealed a super-effective move against the active Pokemon and, if so, looks for a switch that resists it (`survivalPlaystyle`). Otherwise it scores every usable move on a rough damage estimate (base power times attack/defense stat ratio times type effectiveness times STAB), plus bonuses for STAB, status chance, priority when the opponent is low, recovery when the bot is low, and a penalty for recoil. The final move is sampled from the scores raised to the tenth power, so the best move wins most of the time but not always. A scouting phase for the first three turns exists but is switched off.

`chooseSwitch` handles forced switches after a faint. Each bench Pokemon is scored by its best estimated hit on the opponent minus the opponent's best known hit on it, and the highest net score comes in.

### The doubles bot (`DoublesAI_v2`)

Rebuilt from scratch for two active Pokemon per side rather than adapted from the singles bot. Same two layers, different internals:

1. **State tracking.** State is keyed by battle slot (`p1a`, `p1b`, `p2a`, `p2b`) instead of by Pokemon name. Each slot record holds species, level, HP percent, status, and revealed moves. Switches, drags, and replacements overwrite the slot, so the bot never confuses which Pokemon is where.
2. **Decision.** `chooseMove` is called once per active slot. For each move it computes an estimated damage percent against each living foe using the real Gen 9 damage formula with assumed neutral 31 IV / 21 EV stats at the Pokemon's level, a 0.925 average roll, STAB, and type effectiveness. Then:
   - **Single-target moves** pick the foe where the capped damage (never more than the foe's remaining HP) plus a 40-point KO bonus is highest, and emit `move <slot> <target>`.
   - **Spread moves** sum the capped damage over both foes at 0.75x, and subtract the damage dealt to the partner if the move also hits allies (Earthquake, Surf).
   - **Protect / Detect** score 60 if the foes' best known moves would together deal at least the bot's remaining HP, 15 otherwise, and 5 if the bot used Protect last turn.
   - **Other status moves** get a flat utility score of 15.

   The move is then sampled with the same tenth-power lottery as the singles bot.

Switching, forced replacements after a faint, and team preview are still left to the base class's random choice.

`DoublesAI_v1` is identical minus the Protect logic. The old `playground/doublesAI.js` is the earlier attempt described in the previous README and is not used anywhere.

### Benchmark harness (`Testing.js`)

`runBench(makeP1, makeP2, amount, formatid)` generates a fresh random-battle team for each side every game, runs `amount` games, and returns `{player1Wins, player2Wins, draws, crashes}`. Each game has a 30 second timeout and bot crashes are counted rather than aborting the run. Factory helpers `makeSingles`, `makeRandom`, `makeDoubles_v1`, and `makeDoubles_v2` are exported for convenience.

There is no CLI wrapper yet. Run a bench from the `Node-Server` folder with a one-liner:

```bash
node --input-type=module -e "import {runBench, makeDoubles_v2, makeRandom} from './Testing.js'; console.log(await runBench(makeDoubles_v2, makeRandom, 300, 'gen9randomdoublesbattle'))"
```

Use `gen9randombattle` for the singles bot. The full log of every game the p1 bot wins is written to `Node-Server/losses/loss_<n>.txt` (the folder is gitignored). Despite the name, these are currently the p1 *wins*; swap the bots if you want to read the games the bot lost.

Results so far, kept up to date in the comment block at the top of `Testing.js`:

| Bot | Opponent | Format | Games | Win rate |
|---|---|---|---|---|
| `SinglesAI` | random | gen9randombattle | 100 | 87% |
| `DoublesAI_v1` | random | gen9randomdoublesbattle | 300 | 89% |
| `DoublesAI_v2` | `DoublesAI_v1` | gen9randomdoublesbattle | 300 | 57 to 62% |
| random | random | gen9randomdoublesbattle | 300 | 51% (no side bias) |

The singles number came from a sequence of changes, each measured against the previous: fixing state tracking so the bot could actually see the battle (64 to 68%), adding base power to the score (76%), raising the lottery exponent to 10 (84%), and matchup-based replacement after a faint (87%).

### Known issues

- `simulation.js` imports `DoublesAI` from `doublesAI.js` and `SinglesVsRandom` from `Testing.js`, but neither export exists any more (the classes are now `DoublesAI_v2` and `runBench`). Node refuses to load the module, so **the server currently does not start** until those two import lines are fixed. `makeDoubles` in `Testing.js` has the same problem.
- The server never routes doubles formats to the doubles bot.
- Damage estimates ignore items, abilities, weather, terrain, stat boosts, and the Tera type.
- The singles bot's damage estimate is a stat-ratio heuristic, not the real formula the doubles bot uses.
- The doubles bot has no switching logic at all, and neither bot handles team preview.
- In `abtest`, a bot crash mid-battle hangs the request. The bench harness has a timeout; the server does not.

## python-ai

Early reinforcement-learning work toward replacing the scripted bots with a trained policy. Nothing here is used by the server yet, and the plan is to revisit it once the heuristic bots are strong enough to serve as a training opponent.

| File | Purpose |
|---|---|
| `playground/vgc_env.py` | A `poke-env` player for doubles with a state encoder and action mask. The policy is still random. |
| `playground/test_env.py` | Runs one battle of `VGCEnv` against a random player on a local Showdown server. |
| `playground/toy_vgc_env.py` | A tiny stand-in Gym environment (not real Pokemon) used to test the training and export pipeline. |
| `playground/train_and_export.py` | Trains PPO on the toy environment and exports the policy to ONNX. Produces the files in `model/`. |
| `playground/train_ppo.py` | Training template that imports a `poke_gym_env` module that does not exist yet. |
| `singles_RL(OLD).py` | Abandoned Ray RLlib approach for singles. Kept for reference. |
| `sanityTest.py`, `tes_env2.py`, `simple_env.py` | Scratch files. `simple_env.py` is empty. |

The model files in `model/` were trained on the toy environment and cannot play real battles.

### Setup

Python 3.10 is required (newer versions do not work with the pinned `gym` and `poke-env` releases).

```powershell
cd python-ai
py -3.10 -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

`python-ai/requirements.txt` is UTF-8. `playground/requirements.txt` is still saved as UTF-16; if pip rejects it, convert first:

```powershell
Get-Content playground\requirements.txt | Set-Content -Encoding utf8 requirements.utf8.txt
pip install -r requirements.utf8.txt
```

### Local Showdown server

`poke-env` talks to a real Pokemon Showdown server over WebSocket. The scripts expect one on `localhost:8000` with authentication disabled. From a clone of the `pokemon-showdown` repository:

```bash
node pokemon-showdown start --no-security
```

## Roadmap

1. Fix the stale imports in `simulation.js` so the server starts again.
2. Route doubles formats (`gen9vgc*`, `gen9doubles*`) to `DoublesAI_v2` and expose them in the frontend format list.
3. Give the doubles bot switching and replacement logic, then team preview for both bots.
4. Fold items, abilities, boosts, and weather into the damage estimate, and move the singles bot onto the real damage formula.
5. Add a small CLI around `runBench` so benches don't need a one-liner.
6. Revisit reinforcement learning with the heuristic bots as the training opponent.
