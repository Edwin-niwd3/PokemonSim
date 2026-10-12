import {BattleStreams, Teams} from '@pkmn/sim';
import { SinglesAI } from './singlesAI.js';
import {RandomPlayerAI} from '@pkmn/sim';
import {TeamGenerators} from '@pkmn/randoms';
import {mkdirSync, writeFileSync} from 'node:fs';
import {DoublesAI_v2} from './doublesAI.js';
import {DoublesAI_v1} from './doublesAI_v1.js';

//Testing.js: 10/10/2026, 100 games, random battle teams, SinglesAI as p1, 64%. Compare against this.
// ┌─────────────────────────────────────────┬───────────┐
// │           Single AI Change              │ Win rate  │
// ├─────────────────────────────────────────┼───────────┤
// │ State fix, bot can finally see          │ 66 to 68  │
// ├─────────────────────────────────────────┼───────────┤
// │ Base power in the score                 │ 70 to 76  │
// ├─────────────────────────────────────────┼───────────┤
// │ Lottery exponent 10                     │ 82 to 84  │
// ├─────────────────────────────────────────┼───────────┤
// │ Scouting off, STAB weight, stat ratio   │ no change │
// ├─────────────────────────────────────────┼───────────┤
// │ Matchup-based replacement after a faint │ 87        │
// └─────────────────────────────────────────┴───────────┘

//Doubles: 10/11/2026, 300 games, gen9randomdoublesbattle, DoublesAI vs RandomPlayerAI. Compare against this.
//Random vs random baseline: 153 to 147 (51%), so no side bias.
// ┌─────────────────────────────────────────┬───────────┬───────────┐
// │           Doubles AI Change             │ vs random │ vs prev   │
// ├─────────────────────────────────────────┼───────────┼───────────┤
// │ Rebuilt from scratch: slot-keyed state, │           │           │
// │ per-foe damage targeting, spread x0.75, │ 86 to 90  │     -     │
// │ utility score 20, lottery exponent 10   │           │           │
// ├─────────────────────────────────────────┼───────────┼───────────┤
// │ Percent-based damage, cap at remaining  │           │           │
// │ HP, KO bonus 40, utility 15  (= v1)     │    89     │     -     │
// ├─────────────────────────────────────────┼───────────┼───────────┤
// │ Protect when incoming >= remaining HP,  │           │           │
// │ penalty for consecutive Protect  (= v2) │     -     │ 57 to 62  │
// └─────────────────────────────────────────┴───────────┴───────────┘

export async function runBench(makeP1, makeP2, amount = 50, formatid = 'gen9randombattle')
{
  Teams.setGeneratorFactory(TeamGenerators);
  let results = {player1Wins: 0, player2Wins: 0, draws: 0, crashes: 0};
  for(let i = 0; i < amount; i++) {

    const streams = BattleStreams.getPlayerStreams(new BattleStreams.BattleStream());

    const team1 = (Teams.generate(formatid));
    const team2 = (Teams.generate(formatid));
  
    const p1spec = {name: 'Bot 1', team: Teams.pack(team1)};
    const p2spec = {name: 'Bot 2', team: Teams.pack(team2)};
  
    const p1 = makeP1(streams.p1, 'p1', team1);
    const p2 = makeP2(streams.p2, 'p2', team2);

    void p1.start().catch(err => {
      console.error(`Error in p1.start(): ${err}`);
      results.crashes++;
      streams.omniscient.writeEnd();
    });
    void p2.start().catch(err => {
      console.error(`Error in p2.start(): ${err}`);
      results.crashes++;
      streams.omniscient.writeEnd();
    });

    let crashed = false;
    const timer =setTimeout(() => {
      console.error(`Simulation ${i + 1} timed out.`);
      crashed = true;
      results.crashes++;
      streams.omniscient.writeEnd();
    }, 30000); // 30 seconds timeout

    

    await streams.omniscient.write(`>start ${JSON.stringify({formatid})}
>player p1 ${JSON.stringify(p1spec)}
>player p2 ${JSON.stringify(p2spec)}`);
  
    let winner = null;
    const log = [];
    for await (const chunk of streams.omniscient) {
      log.push(chunk);
      if (chunk.includes('|win|')) {
        if (chunk.includes('Bot 1')) winner = 'p1';
        else if (chunk.includes('Bot 2')) winner = 'p2';
      }
      if (chunk.includes('|tie|')) {
        winner = 'draw';
      }
    }
    clearTimeout(timer);
  
    if (winner == 'p1') {
      results.player1Wins++;
    mkdirSync('losses', {recursive: true});
    writeFileSync(`losses/loss_${i + 1}.txt`, log.join('\n'));
    }
    else if (winner == 'p2') {results.player2Wins++;}
    else if (winner == 'draw') {results.draws++;}
  }
  return results;
}

export function makeSingles(stream, id, team) {
  return new SinglesAI(stream, id, team);
}

export function makeRandom(stream, id, team) {
  return new RandomPlayerAI(stream);
}

export function makeDoubles(stream, id, team) {
  return new DoublesAI(stream, id, team);
}

export function makeDoubles_v1(stream, id, team) {
  return new DoublesAI_v1(stream, id, team);
}

export function makeDoubles_v2(stream, id, team) {
  return new DoublesAI_v2(stream, id, team);
}