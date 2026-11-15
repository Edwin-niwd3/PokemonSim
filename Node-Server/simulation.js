import {BattleStreams, Teams, TeamValidator} from '@pkmn/sim';
import { SinglesAI } from './singlesAI.js';
import { DoublesAI_v4 as DoublesAI } from './doubles_versions/doublesAI_v4.js';
import {Dex} from '@pkmn/sim';
import express from 'express';
import cors from 'cors'


const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({extended: true}));
app.use(express.json());
app.use(cors());

app.get('/', (req, res) => {
  res.status(200).send('Simulation API is running!')
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`)
})

app.post('/simulation/begin', async (req, res) => {
  const start = process.hrtime();
  console.log('We started a battle')

  try {
    const { team1Json, team2Json, formatJson } = req.body;

    if (!team1Json || !team2Json) {
      return res.status(400).json({ error: 'Both teams are required.' });
    }

    if(!formatJson) {
      return res.status(400).json({error: 'Format not selected'})
    }


    const streams = BattleStreams.getPlayerStreams(new BattleStreams.BattleStream());
    const spec = { formatid: formatJson };

    const validator = TeamValidator.get(spec.formatid);

    const team1Errors = validator.validateTeam(team1Json);
    const team2Errors = validator.validateTeam(team2Json);
    

    if(team1Errors || team2Errors) {
      console.log("Error in validating teams");
      return res.status(400).json({errorTeam1: team1Errors, errorTeam2: team2Errors})
    }

    const p1spec = { name: 'Bot 1', team: Teams.pack(team1Json) };
    const p2spec = { name: 'Bot 2', team: Teams.pack(team2Json) };

    const type = Dex.formats.get(spec.formatid).gameType;
    let p1;
    let p2;
    if (type === "doubles")
    {
     p1 = new DoublesAI(streams.p1, 'p1', team1Json);
     p2 = new DoublesAI(streams.p2, 'p2', team2Json);
    }
    else {
       p1 = new SinglesAI(streams.p1, 'p1', team1Json);
       p2 = new SinglesAI(streams.p2, 'p2', team2Json);
    }

    void p1.start().catch(err => {
      console.error(`Error in p1.start(): ${err}`);
      streams.omniscient.writeEnd();
    });
    void p2.start().catch(err => {
      console.error(`Error in p2.start(): ${err}`);
      streams.omniscient.writeEnd();
    });

    await streams.omniscient.write(`>start ${JSON.stringify(spec)}
>player p1 ${JSON.stringify(p1spec)}
>player p2 ${JSON.stringify(p2spec)}`);

    const battleLog = [];
    for await (const chunk of streams.omniscient) {
      battleLog.push(chunk);
    }

    const end = process.hrtime(start);
    const execTime = `${end[0]}s ${(end[1] / 1_000_000).toFixed(2)}ms`;

    const report = generateBattleReport(p1, p2);

    console.log(`Battle finished in ${execTime}`);
    res.status(200).json({
      message: 'Simulation completed successfully.',
      executionTime: execTime,
      battleLog,
      report,
    });

  } catch (error) {
    console.error('Error starting simulation:', error);
    res.status(500).json({ error: error.message });
  }
});


class BattleStatsCollector {
  constructor() {
    this.totals ={
      p1: {},
      p2: {},
    }
    this.beginBattle();
  }

  beginBattle() {
    this.scratch ={
      turn: 0,
      entered: new Map(),
      slots: new Map(),
      fainted: new Set(),
      delta: {
        p1: {},
        p2: {},
      }
    }
  }

  getRecord(branch, side, species) {
    if (branch[side][species] === undefined) {
      branch[side][species] = {faints: 0, appearances: 0, aliveTurns: 0, moves: {}};
    }
    return branch[side][species];
  }

  parseIdent(ident) {
    const name = ident.split(':')[0];
    if(name.length !==3) return null;
    return {slot: name, player: name.slice(0,2) };
  }

  ingest(line) {
    const parts = line.split('|');
    switch(parts[1]) {
      case 'turn':  this.scratch.turn = Number(parts[2]); break;
      case 'drag':
      case 'replace':
      case 'switch': this.handleSwitch(parts); break;
      case 'move': this.handleMove(parts); break;
      case 'faint': this.handleFaint(parts); break;
      case 'win':
      case 'tie': this.handleEnd(parts); break;
      default:
        break;
    }
  }

  handleSwitch(parts) {
    const ident = this.parseIdent(parts[2]);
    if (!ident) return;
    const details = parts[3].split(',').map( s=> s.trim());
    const species = details[0];
    this.scratch.slots.set(ident.slot, species)
    const key = `${ident.player}|${species}`;
    if(!this.scratch.entered.has(key)) {
      this.scratch.entered.set(key, this.scratch.turn);
      const record = this.getRecord(this.scratch.delta, ident.player, species);
      record.appearances+= 1;
    }
  }

  handleMove(parts) {
    const ident = this.parseIdent(parts[2]);
    if (!ident) return;
    const move = parts[3].split(',')[0].trim();
    const species = this.scratch.slots.get(ident.slot);
    if (!species) return;
    const record = this.getRecord(this.scratch.delta, ident.player, species);
    if (!record.moves[move]) {
      record.moves[move] = 0;
    }
    record.moves[move] += 1;
  }

  handleFaint(parts) {
    const ident = this.parseIdent(parts[2]);
    if (!ident) return;
    const species = this.scratch.slots.get(ident.slot);
    if (!species) return;
    const record = this.getRecord(this.scratch.delta, ident.player, species);
    record.faints += 1;
    const key = `${ident.player}|${species}`
    record.aliveTurns += (this.scratch.turn - this.scratch.entered.get(key));
    this.scratch.fainted.add(key);
  }

  handleEnd(parts) {
    for (const [key, turn] of this.scratch.entered.entries()) {
      if (this.scratch.fainted.has(key)) continue;
      const [player, species] = key.split('|');
      const record = this.getRecord(this.scratch.delta, player, species);
      record.aliveTurns += (this.scratch.turn - turn);
    }
  }

  handleCommit() {
    for (const side of ['p1', 'p2']) {
      for (const [species, record] of Object.entries(this.scratch.delta[side])) {
        const totalRecord = this.getRecord(this.totals, side, species);
        totalRecord.appearances += record.appearances;
        totalRecord.faints += record.faints;
        totalRecord.aliveTurns += record.aliveTurns;
        for (const [move, count] of Object.entries(record.moves)) {
          if (!totalRecord.moves[move]) {
            totalRecord.moves[move] = 0;
          }
          totalRecord.moves[move] += count;
        }
      }
    }
  }

  toJSON() {
    const totals = this.totals;
    const report = {
      p1: {},
      p2: {},
    }
    for (const side of ['p1', 'p2']) {
      for (const [species, record] of Object.entries(totals[side])) {
        report[side][species] = {
          appearances: record.appearances,
          faints: record.faints,
          averageLifespan: record.appearances >  0 ? Number((record.aliveTurns / record.appearances).toFixed(2)) : 0,
          mostUsedMove: Object.entries(record.moves).reduce((max, [move, count]) => {
            if (count > max.count) {
              return { move, count };
            }
            return max;
          }, { move: null, count: 0 }).move,
          moves: record.moves
        };
      }
    }
    return report;
  }
}

function generateBattleReport(player1, player2, player1Name = 'Player 1', player2Name = 'Player 2') {
  const buildReport = (player, playerName) => {
    let report = `\n--- ${playerName}'s Intel on Opponent ---\n`;

    if (player.state.roster) {
      const foeId = player.playerId === 'p1' ? 'p2' : 'p1';
      const foes = [...player.state.roster].filter(([key])=> key.startsWith(`${foeId}|`));
      if (!foes.length) return report + 'No Pokémon were identified\n'
      for (const [, rec] of foes) {
        const status = rec.status ?? 'none';
        const moves = rec.moves.size ? [...rec.moves].join (', ') : 'no moves seen';
        report += ` - ${rec.species}: ${Math.round(rec.hp)} %hp, status ${status}, [${moves}]\n`;
      }
      return report;
    }

    const opponent = player.state.opponent;
    if (!opponent) return report + 'There is no opponent\n';

    if (!opponent.pokemon || opponent.pokemon.length === 0) {
      report += "No Pokémon were identified.\n";
    } else {
      report += `Identified Pokémon: ${opponent.pokemon.join(', ')}\n`;
    }

    report += 'Known Status Effects on Pokémon:\n';
    if (opponent.statusEffects && opponent.statusEffects.size > 0) {
      for (const [pokemon, status] of opponent.statusEffects.entries()) {
        report += ` - ${pokemon}: ${status}\n`;
      }
    } else {
      report += '  None\n';
    }

    report += 'Known Moves:\n';
    if (opponent.moves && opponent.moves.size > 0) {
      for (const [pokemon, moves] of opponent.moves.entries()) {
        const moveList = Array.from(moves).join(', ');
        report += `  - ${pokemon}: [${moveList}]\n`;
      }
    } else {
      report += '  No moves were recorded.\n';
    }

    return report;
  };

  // Combine both players' reports into a single string
  return buildReport(player1, player1Name) + '\n' + buildReport(player2, player2Name);
}

//----------------------------------TESTING----------------------------------

app.post('/simulation/abtest', async (req, res) => {
  const { team1Json, team2Json, formatJson, numSimulations = 50 } = req.body;

  if (!team1Json || !team2Json) {
    return res.status(400).json({ error: 'Both teams are required.' });
  }

  if (!formatJson) {
    return res.status(400).json({ error: 'Format not selected.' });
  }

  if (!Number.isInteger(numSimulations) || numSimulations <= 0 || numSimulations > 500) {
    return res.status(400).json({ error: 'Number of simulations must be an integer between 1 and 500.' });
  }

  let results = { 
    player1Wins: 0, 
    player2Wins: 0,
    draws: 0,
    crashes: 0
  };
  let durations = [];

  const collector = new BattleStatsCollector();

  const spec = { formatid: formatJson };

  const validator = TeamValidator.get(spec.formatid);
  const team1Errors = validator.validateTeam(team1Json);
  const team2Errors = validator.validateTeam(team2Json);

  if (team1Errors || team2Errors) {
    console.log(`Validation error in simulation`);
    return res.status(400).json({errorTeam1: team1Errors, errorTeam2: team2Errors});
  }

  for (let i = 0; i < numSimulations; i++) {
    collector.beginBattle();
    const start = process.hrtime();

    const streams = BattleStreams.getPlayerStreams(new BattleStreams.BattleStream());


    const p1spec = { name: 'Bot 1', team: Teams.pack(team1Json) };
    const p2spec = { name: 'Bot 2', team: Teams.pack(team2Json) };

    const type = Dex.formats.get(spec.formatid).gameType;
    let p1;
    let p2;
    if (type === "doubles")
    {
     p1 = new DoublesAI(streams.p1, 'p1', team1Json);
     p2 = new DoublesAI(streams.p2, 'p2', team2Json);
    }
    else {
       p1 = new SinglesAI(streams.p1, 'p1', team1Json);
       p2 = new SinglesAI(streams.p2, 'p2', team2Json);
    }
    
    let crashed = false;

    void p1.start().catch(err => {
      console.error(`Error in p1.start(): ${err}`);
      crashed = true;

      streams.omniscient.writeEnd();
    });
    void p2.start().catch(err => {
      console.error(`Error in p2.start(): ${err}`);
      crashed = true;
      streams.omniscient.writeEnd();
    });



    const timer = setTimeout(() => {
      console.error(`Simulation ${i+1} timed out.`);
      crashed = true;
      streams.omniscient.writeEnd();
    }, 30000);


    await streams.omniscient.write(`>start ${JSON.stringify(spec)}
>player p1 ${JSON.stringify(p1spec)}
>player p2 ${JSON.stringify(p2spec)}`);

    let winner = null;

    for await (const chunk of streams.omniscient) {
      const lines = chunk.split('\n');
      for (const line of lines) {
        collector.ingest(line);
      }
      if (chunk.includes('|win')) {
        if (chunk.includes('Bot 1')) {
          winner = 'p1';
        }
        else if (chunk.includes('Bot 2')) {
          winner = 'p2';
        }
      }
    }
      
    clearTimeout(timer);

    const end = process.hrtime(start);
    const durationMs = end[0] * 1000 + end[1] / 1_000_000;
    durations.push(durationMs);

    if (crashed) {results.crashes++ ; continue;}
    if (winner === 'p1') {
      results.player1Wins++;
    }
    else if (winner === 'p2') {
      results.player2Wins++;
    }
    else {
      results.draws++;
    }

    collector.handleCommit();
  }

  const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;


  res.status(200).json({
    message: `Ran ${numSimulations} simulations.`,
    totalBattles: numSimulations,
    ...results,
    averageDurationMs: avgDuration.toFixed(2),
    winRates: {
      player1: ((results.player1Wins / numSimulations) * 100).toFixed(1) + '%',
      player2: ((results.player2Wins / numSimulations) * 100).toFixed(1) + '%',
      draws: ((results.draws / numSimulations) * 100).toFixed(1) + '%',
    },
    monStats: collector.toJSON(),
  });
});
