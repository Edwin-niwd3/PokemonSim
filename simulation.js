import {Dex, BattleStreams, RandomPlayerAI, Teams} from '@pkmn/sim';

const streams = BattleStreams.getPlayerStreams(new BattleStreams.BattleStream());
const spec = {formatid: 'gen9customgame'};

const team2Json = [ 
  {
    "name": "",
    "species": "Articuno",
    "gender": "",
    "item": "Leftovers",
    "ability": "Pressure",
    "evs": {"hp": 252, "atk": 0, "def": 0, "spa": 252, "spd": 4, "spe": 0},
    "nature": "Modest",
    "ivs": {"hp": 31, "atk": 31, "def": 31, "spa": 30, "spd": 30, "spe": 31},
    "moves": ["Ice Beam", "Hurricane", "Substitute", "Roost"]
  },
  {
    "name": "",
    "species": "Ludicolo",
    "gender": "",
    "item": "Life Orb",
    "ability": "Swift Swim",
    "evs": {"hp": 4, "atk": 0, "def": 0, "spa": 252, "spd": 0, "spe": 252},
    "nature": "Modest",
    "moves": ["Surf", "Giga Drain", "Ice Beam", "Rain Dance"]
  },
  {
    "name": "",
    "species": "Volbeat",
    "gender": "M",
    "item": "Damp Rock",
    "ability": "Prankster",
    "evs": {"hp": 248, "atk": 0, "def": 252, "spa": 0, "spd": 8, "spe": 0},
    "nature": "Bold",
    "moves": ["Tail Glow", "Baton Pass", "Encore", "Rain Dance"]
  },
  {
    "name": "",
    "species": "Seismitoad",
    "gender": "",
    "item": "Life Orb",
    "ability": "Swift Swim",
    "evs": {"hp": 0, "atk": 0, "def": 0, "spa": 252, "spd": 4, "spe": 252},
    "nature": "Modest",
    "moves": ["Hydro Pump", "Earth Power", "Stealth Rock", "Rain Dance"]
  },
  {
    "name": "",
    "species": "Alomomola",
    "gender": "",
    "item": "Damp Rock",
    "ability": "Regenerator",
    "evs": {"hp": 252, "atk": 0, "def": 252, "spa": 0, "spd": 4, "spe": 0},
    "nature": "Bold",
    "moves": ["Wish", "Protect", "Toxic", "Rain Dance"]
  },
  {
    "name": "",
    "species": "Armaldo",
    "gender": "",
    "item": "Leftovers",
    "ability": "Swift Swim",
    "evs": {"hp": 128, "atk": 252, "def": 4, "spa": 0, "spd": 0, "spe": 124},
    "nature": "Adamant",
    "moves": ["X-Scissor", "Stone Edge", "Aqua Tail", "Rapid Spin"]
   }
]


const team1Json = [
  {
    "name": "",
    "species": "Articuno",
    "gender": "",
    "item": "Leftovers",
    "ability": "Pressure",
    "evs": {"hp": 252, "atk": 0, "def": 0, "spa": 252, "spd": 4, "spe": 0},
    "nature": "Modest",
    "ivs": {"hp": 31, "atk": 31, "def": 31, "spa": 30, "spd": 30, "spe": 31},
    "moves": ["Ice Beam", "Hurricane", "Substitute", "Roost"]
  },
  {
    "name": "",
    "species": "Ludicolo",
    "gender": "",
    "item": "Life Orb",
    "ability": "Swift Swim",
    "evs": {"hp": 4, "atk": 0, "def": 0, "spa": 252, "spd": 0, "spe": 252},
    "nature": "Modest",
    "moves": ["Surf", "Giga Drain", "Ice Beam", "Rain Dance"]
  },
  {
    "name": "",
    "species": "Volbeat",
    "gender": "M",
    "item": "Damp Rock",
    "ability": "Prankster",
    "evs": {"hp": 248, "atk": 0, "def": 252, "spa": 0, "spd": 8, "spe": 0},
    "nature": "Bold",
    "moves": ["Tail Glow", "Baton Pass", "Encore", "Rain Dance"]
  },
  {
    "name": "",
    "species": "Seismitoad",
    "gender": "",
    "item": "Life Orb",
    "ability": "Swift Swim",
    "evs": {"hp": 0, "atk": 0, "def": 0, "spa": 252, "spd": 4, "spe": 252},
    "nature": "Modest",
    "moves": ["Hydro Pump", "Earth Power", "Stealth Rock", "Rain Dance"]
  },
  {
    "name": "",
    "species": "Alomomola",
    "gender": "",
    "item": "Damp Rock",
    "ability": "Regenerator",
    "evs": {"hp": 252, "atk": 0, "def": 252, "spa": 0, "spd": 4, "spe": 0},
    "nature": "Bold",
    "moves": ["Wish", "Protect", "Toxic", "Rain Dance"]
  },
  {
    "name": "",
    "species": "Armaldo",
    "gender": "",
    "item": "Leftovers",
    "ability": "Swift Swim",
    "evs": {"hp": 128, "atk": 252, "def": 4, "spa": 0, "spd": 0, "spe": 124},
    "nature": "Adamant",
    "moves": ["X-Scissor", "Stone Edge", "Aqua Tail", "Rapid Spin"]
   }
]

const dex = Dex.forFormat(spec.formatid);

class OffensiveAI extends RandomPlayerAI {
  constructor(playerStream, playerId) {
    super(playerStream);
    this.playerId = playerId;
    this.protectedFlag = false; // Flag to track if Protect was used last turn
    this.state = {
      opponent: {
        pokemon: new Set(),
        active: null,
        moves: new Map(),
      },
      turn: 0,
    };
  }

  recordMove(pokemon, move) {
    if (!this.state.opponent.moves.has(pokemon)) {
      this.state.opponent.moves.set(pokemon, new Set());
    }

    const knownMoves = this.state.opponent.moves.get(pokemon);
    knownMoves.add(move);

  }

  updateState(chunk) {
    const lines = chunk.split('\n');
    for (const line of lines) {
      //Manage what turn it is
      if(line.includes('|turn|')){
        this.state.turn = parseInt(line.split('|')[2]);
      }

      //Detect switches
      if (line.includes('|switch|')) {
        //Someone has switched pokemon, check if its the opponent
        const parts = line.split('|');
        const switchedPlayer = parts[2].startsWith('p1a') || parts[1].startsWith('p1b') ? 'p1' : 'p2';
        if (switchedPlayer !== this.playerId) {
          //clean string to only have pokemon name
          const START_OF_NAME = 5; // Length of 'p2a: ' or 'p1a: '
          let pokemonName = parts[2].slice(START_OF_NAME);
          // Update the opponent's active Pokémon
          this.state.opponent.pokemon.add(pokemonName);
          this.state.opponent.active = pokemonName;
        }
      }

      //Detect moves used by the opponent
      if (line.includes('|move|')){
        const parts = line.split('|');
        //someone used a move, check if its the opponent
        const movingPlayer = parts[2].startsWith('p1a') || parts[2].startsWith('p1b') ? 'p1' : 'p2';
        if(movingPlayer !== this.playerId) {
          const moveName = parts[3];
          this.recordMove(this.state.opponent.active, moveName);
        }
      }
    }
  }

  chooseMove(request) {
    /** TODO:
     * Implement a more robust attack strategy, consider type advantages and stab
     * Add in switching when facing an opponent that has a type advantage move against us
     * Implement status moves like Toxic to wear down bulky opponents
     * Consider using Priority moves when low on health/going for an aggressive kill
     */


    const moves = request.moves;
    //Play slower, survive longer, gather more intel
    if (this.state.turn <= 3) {
      console.log(`Turn ${this.state.turn}: Prioritizing survival moves.`);
      //Prioritize survival moves if available
      const survivalMoves = ['protect', 'substitute', 'roost', 'wish'];
      for (let i = 0; i < moves.length; i++) {
        const move = moves[i];
        console.log(`Evaluating move: ${move.id}, disabled: ${move.disabled}`);
        if (move.disabled) continue;
        if (survivalMoves.includes(move.id)) {
          // If Protect was used last turn, avoid using it again immediately
          if (move.id === 'protect' || (move.id === 'wish' || move.id === 'substitute' && this.protectedFlag)) {
            continue;
          }
          //If we use protect this turn, set the flag to true, otherwise reset it
          this.protectedFlag = move.id === 'protect';
          return `move ${i + 1}`;
        }
      }
    }


    //Agressive strategy: Choose the move with the highest base power
    let bestMoveIndex = -1;
    let maxPower = -1;

    for (let i = 0; i < moves.length; i++) {
      const move = moves[i];
      if (move.disabled) continue;

      const moveData = dex.moves.get(move.id);
      if (moveData.basePower > maxPower) {
        maxPower = moveData.basePower;
        bestMoveIndex = i + 1;
      }
    }

    if (bestMoveIndex !== -1) {
      return `move ${bestMoveIndex}`;
    } else {
      // Fallback to a random move if no offensive move is found
      return super.chooseMove(request);
    }
  }
}

const p1spec = {name: 'Bot 1', team: Teams.pack(team1Json)};
const p2spec = {name: 'Bot 2', team: Teams.pack(team2Json)};

const p1 = new OffensiveAI(streams.p1, 'p1');
const p2 = new OffensiveAI(streams.p2, 'p2');

void p1.start();
void p2.start();

void streams.omniscient.write(`>start ${JSON.stringify(spec)}
>player p1 ${JSON.stringify(p1spec)}
>player p2 ${JSON.stringify(p2spec)}`);

void (async () => {
  for await (const chunk of streams.omniscient) {
    console.log(chunk); // You can uncomment this for detailed battle logs
    p1.updateState(chunk);
    p2.updateState(chunk);
  }

  // --- Intel Report Generation ---
  console.log("\n\n--- BATTLE FINISHED: INTEL REPORT ---");

  function generateReport(player, playerName) {
    console.log(`\n--- ${playerName}'s Intel on Opponent ---`);
    const opponentPokemon = Array.from(player.state.opponent.pokemon);
    if (opponentPokemon.length === 0) {
      console.log("No Pokémon were identified.");
      return;
    }

    console.log(`Identified Pokémon: ${opponentPokemon.join(', ')}`);
    console.log("Known Moves:");
    if (player.state.opponent.moves.size === 0) {
      console.log("  No moves were recorded.");
      return;
    }
    for (const [pokemon, moves] of player.state.opponent.moves.entries()) {
      const moveList = Array.from(moves).join(', ');
      console.log(`  - ${pokemon}: [${moveList}]`);
    }
  }

  generateReport(p1, p1spec.name);
  generateReport(p2, p2spec.name);
  console.log("\n-------------------------------------\n");

})();