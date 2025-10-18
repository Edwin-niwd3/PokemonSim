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
    const { team1Json, team2Json } = req.body;
    console.log(team1Json, team2Json)

    if (!team1Json || !team2Json) {
      return res.status(400).json({ error: 'Both teams are required.' });
    }

    const streams = BattleStreams.getPlayerStreams(new BattleStreams.BattleStream());
    const spec = { formatid: 'gen9' };

    const cleanedTeam1 = cleanTeam(team1Json);
    const cleanedTeam2 = cleanTeam(team2Json);

    const validator = TeamValidator.get('gen9vgc2024regg');

    const team1Errors = validator.validateTeam(team1Json);
    const team2Errors = validator.validateTeam(team2Json);
    

    if(team1Errors || team2Errors) {
      return res.status(400).json({error: team1Errors + team2Errors})
    }

    const p1spec = { name: 'Bot 1', team: Teams.pack(team1Json) };
    const p2spec = { name: 'Bot 2', team: Teams.pack(team2Json) };

    const p1 = new SinglesAI(streams.p1, 'p1', team1Json);
    const p2 = new SinglesAI(streams.p2, 'p2', team2Json);

    void p1.start();
    void p2.start();

    // ✅ Begin the battle
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