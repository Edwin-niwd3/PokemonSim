import {BattleStreams, Teams, TeamValidator} from '@pkmn/sim';
import { SinglesAI } from './singlesAI.js';
import { DoublesAI } from './doublesAI.js';
import {RandomPlayerAI, Dex} from '@pkmn/sim';
import {Dex as pokeDex} from '@pkmn/dex';
import {Generations} from "@pkmn/data";
import express from 'express';
import cors from 'cors'


const app = express();
const PORT = 3000;

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
    console.log(team1Json, team2Json, formatJson)

    if (!team1Json || !team2Json) {
      return res.status(400).json({ error: 'Both teams are required.' });
    }

    if(!formatJson) {
      return res._construct(400).json({error: 'Format not selected'})
    }


    const streams = BattleStreams.getPlayerStreams(new BattleStreams.BattleStream());
    const spec = { formatid: formatJson };

    const cleanedTeam1 = cleanTeam(team1Json);
    const cleanedTeam2 = cleanTeam(team2Json);

    const validator = TeamValidator.get(spec.formatid);

    const team1Errors = validator.validateTeam(team1Json);
    const team2Errors = validator.validateTeam(team2Json);
    

    if(team1Errors || team2Errors) {
      console.log("Error in validating teams");
      return res.status(400).json({errorTeam1: team1Errors, errorTeam2: team2Errors})
    }

    const p1spec = { name: 'Bot 1', team: Teams.pack(team1Json) };
    const p2spec = { name: 'Bot 2', team: Teams.pack(team2Json) };

    const p1 = new SinglesAI(streams.p1, 'p1', team1Json);
    const p2 = new SinglesAI(streams.p2, 'p2', team2Json);

    void p1.start();
    void p2.start();

    await streams.omniscient.write(`>start ${JSON.stringify(spec)}
>player p1 ${JSON.stringify(p1spec)}
>player p2 ${JSON.stringify(p2spec)}`);

    const battleLog = [];
    for await (const chunk of streams.omniscient) {
      console.log(chunk);
      battleLog.push(chunk);
      p1.updateState(chunk);
      p2.updateState(chunk);
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

function cleanTeam(team) {
  return team.map(pokemon => ({
    ...pokemon,
    moves: (pokemon.moves || [])
      .filter(m => typeof m === 'string' && m.trim() !== '')
      .map(m => m.toLowerCase().trim()),
  }));
}

function generateBattleReport(player1, player2, player1Name = 'Player 1', player2Name = 'Player 2') {
  const buildReport = (player, playerName) => {
    let report = `\n--- ${playerName}'s Intel on Opponent ---\n`;
    const opponent = player.state.opponent;

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

  let results = { player1Wins: 0, player2Wins: 0, draws: 0 };
  let durations = [];

    const spec = { formatid: formatJson };

    const validator = TeamValidator.get(spec.formatid);
    const team1Errors = validator.validateTeam(team1Json);
    const team2Errors = validator.validateTeam(team2Json);

    if (team1Errors || team2Errors) {
      console.log(`Validation error in simulation`);
      return res.status(400).json({errorTeam1: team1Errors, errorTeam2: team2Errors});
    }

  for (let i = 0; i < numSimulations; i++) {
    const start = process.hrtime();

    const streams = BattleStreams.getPlayerStreams(new BattleStreams.BattleStream());


    const p1spec = { name: 'Bot 1', team: Teams.pack(team1Json) };
    const p2spec = { name: 'Bot 2', team: Teams.pack(team2Json) };

    const p1 = new SinglesAI(streams.p1, 'p1', team1Json);
    const p2 = new SinglesAI(streams.p2, 'p2', team2Json);

    void p1.start();
    void p2.start();

    await streams.omniscient.write(`>start ${JSON.stringify(spec)}
>player p1 ${JSON.stringify(p1spec)}
>player p2 ${JSON.stringify(p2spec)}`);

    let winner = null;

    for await (const chunk of streams.omniscient) {
      if (chunk.includes('|win|')) {
        if (chunk.includes('Bot 1')) winner = 'p1';
        else if (chunk.includes('Bot 2')) winner = 'p2';
      }
    }

    const end = process.hrtime(start);
    const durationMs = end[0] * 1000 + end[1] / 1_000_000;
    durations.push(durationMs);

    if (winner === 'p1') results.player1Wins++;
    else if (winner === 'p2') results.player2Wins++;
    else results.draws++;
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
  });
});

