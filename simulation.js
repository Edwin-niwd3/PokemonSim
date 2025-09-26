import {Dex, BattleStreams, RandomPlayerAI, Teams} from '@pkmn/sim';
import {Dex as pokeDex} from '@pkmn/dex';
import {Generations} from "@pkmn/data";

const streams = BattleStreams.getPlayerStreams(new BattleStreams.BattleStream());
const spec = {formatid: 'gen9customgame'};
const gens = new Generations(pokeDex)
const generation = gens.get(spec.formatid).num

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
  constructor(playerStream, playerId, teamJson) {
    super(playerStream);
    this.playerId = playerId;
    // store a deep copy of the provided team JSON so each AI has its own immutable copy
    this.teamJson = teamJson ? JSON.parse(JSON.stringify(teamJson)) : [];
    // also keep the packed team string the simulator uses (if needed elsewhere)
    this.team = this.teamJson;
    this.protectedFlag = false; // Flag to track if Protect was used last turn
    this.fainted = []
    this.legend = new Map();
    this.state = {
      player: {
        //TODO: Keep track of if we have a substitute or not
        active: null,
        status: null,
        activeIndex: 1,
      },
      opponent: {
        pokemon: [],
        active: null,
        moves: new Map(),
      },
      turn: 0,
    };

    //Setup legend
    let key = 1
    for (const mon of this.teamJson) {
      this.legend.set(mon.species, key);
      this.fainted.push(false)
      key++;
    }

  }
    //TOOLS-----------------------------------------------------------------------------
    chooseMove(request) {
    /** TODO:
     * Implement status moves like Toxic to wear down bulky opponents
     * Consider using Priority moves when low on health/going for an aggressive kill
     */

    const moves = request.moves;
    //Play slower, survive longer, gather more intel
    if (this.state.turn <= 3) {
      return this.scoutingPlaystyle(moves);
    }
    //If the opponent has a super effective move against us, that we know about, try switching to a pkmn with type advantage.
    const activeOpponent = this.state.opponent.active;
    const opponentMoves = this.state.opponent.moves.get(activeOpponent);
    const activePokemon = this.state.player.active;

    //If we know the opponent moves, check them all to make sure they can't hit us with a super effective
    if (opponentMoves) {
      this.survivalPlaystyle(opponentMoves, activePokemon);
  }
    //Agressive strategy: Choose the move with the highest base power
    return this.aggresivePlaystyle(moves, activePokemon);
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
        this.handleSwitch(line);
      }

      //Detect moves used by the opponent
      if (line.includes('|move|')){
        this.handleMove(line);
      }

      if (line.includes('fnt')) {
       this.handleFaint(line); 
      }
    }
  }

  handleSwitch(line) {
    //Someone has switched pokemon, check if its the opponent
        const parts = line.split('|');
        const switchedPlayer = parts[2].startsWith('p1a') || parts[1].startsWith('p1b') ? 'p1' : 'p2';
        if (switchedPlayer !== this.playerId) {
          //clean string to only have pokemon name
          const START_OF_NAME = 5; // Length of 'p2a: ' or 'p1a: '
          let pokemonName = parts[2].slice(START_OF_NAME);
          // Update the opponent's active Pokémon
          // store unique list of seen opponent pokemon in an array
          if (!this.state.opponent.pokemon.includes(pokemonName)) {
            this.state.opponent.pokemon.push(pokemonName);
          }
          this.state.opponent.active = pokemonName;
        }
        else {
          //clean string to only have pokemon name
          const START_OF_NAME = 5; // Length of 'p2a: ' or 'p1a: '
          let pokemonName = parts[2].slice(START_OF_NAME);
          this.state.player.active = pokemonName;
        }
  }

  handleMove(line) {
    const parts = line.split('|');
    //someone used a move, check if its the opponent
    const movingPlayer = parts[2].startsWith('p1a') || parts[2].startsWith('p1b') ? 'p1' : 'p2';
    if(movingPlayer !== this.playerId) {
      const moveName = parts[3];
      this.recordMove(this.state.opponent.active, moveName);
    }
  }

  handleFaint(line) {
    const parts = line.split('|');
    //someone fainted, check if it is out pokemon
    if (!parts[2].includes(this.playerId))
    {
      return;
    }
    //Otherwise, figure out what pokemon fainted
    const START_OF_NAME = 5
    const faintingPokemon = parts[2].slice(START_OF_NAME);
    const key = this.legend.get(faintingPokemon);
    this.fainted[key] = true
  }

  //Playstyles-----------------------------------------------------------------------------
  survivalPlaystyle(opponentMoves, activePokemon) {
    for (const moveName of opponentMoves) {
        const moveTypes = gens.get(generation).moves.get(moveName).type;
        const pokemonTypes = gens.get(generation).species.get(activePokemon)?.types;
        let max_effectiveness = 0;
        if( pokemonTypes){
          max_effectiveness = gens.get(generation).types.totalEffectiveness(moveTypes, pokemonTypes);
        }
        
        if (pokemonTypes && max_effectiveness > 1) {
          //Look through each pokemon on our team and see who takes the least amount of dmg
          let slot = 1;
          let swap = slot;
          for (const mon of this.teamJson) {
            const type = gens.get(generation).species.get(mon.species)?.types;
            if (!type){
              console.log(`We skipped ${mon.species} because we couldn't get its type`)
              continue;
            } 

            let effectiveness = gens.get(generation).types.totalEffectiveness(moveTypes, type);
            if (effectiveness < max_effectiveness) {
              swap = slot;
              max_effectiveness = effectiveness;
            }
            slot++;
          }
          if (this.state.player.activeIndex !== swap && this.fainted[swap] !== true) {
            this.state.player.activeIndex = swap
            console.log("Swapping!")
            return `switch ${swap}`
          }
        }
    }
  }

  scoutingPlaystyle(moves) {
    //Prioritize survival moves if available
      const survivalMoves = ['protect', 'substitute', 'roost', 'wish'];
      for (let i = 0; i < moves.length; i++) {
        const move = moves[i];
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

  aggresivePlaystyle(moves) {
    let bestMoveIndex = -1;
    let maxPower = -1;
    const STAB_BONUS = 1.5; // 50% bonus for STAB moves
    const EFFECTIVNESS = 2; // 100% bonus for super effective moves

    for (let i = 0; i < moves.length; i++) {
      const move = moves[i];
      if (move.disabled) continue;
      const moveData = dex.moves.get(move.id);
      const opponentData = dex.species.get(this.state.opponent.active);
      const playerData = dex.species.get(this.state.player.active);
      let power = moveData.basePower;

      // Calculate modified power considering STAB and type effectiveness
      let modifiedPower = 1;

      modifiedPower *= gens.get(generation).types.totalEffectiveness(moveData.type, opponentData.types);
      
      if(modifiedPower >= 2) {
        //we have a super effective move, try to guess a switch in and go for a status move, if we have one
        
      }

      if (playerData.types.includes(moveData.type)) {
        modifiedPower *= STAB_BONUS;
      }
      power *= modifiedPower;
      if (power > maxPower) {
        maxPower = modifiedPower;
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

const start = process.hrtime();

const p1spec = {name: 'Bot 1', team: Teams.pack(team1Json)};
const p2spec = {name: 'Bot 2', team: Teams.pack(team2Json)};

const p1 = new OffensiveAI(streams.p1, 'p1', team1Json);
const p2 = new OffensiveAI(streams.p2, 'p2', team2Json);

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
    const opponentPokemon = player.state.opponent.pokemon;
    if (opponentPokemon.length === 0) {
      console.log("No Pokémon were identified.");
      return;
    }
    console.log(`Status of Pokemon: `);
    for (const mon of player.teamJson) {
      let key = player.legend.get(mon.species)
      console.log(`${mon.species}: ${player.fainted[key]}`)
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
  const end = process.hrtime(start);
  console.log(`Execution time: ${end[0]}s ${end[1]/1000000}ms`)
  console.log("\n-------------------------------------\n");

})();