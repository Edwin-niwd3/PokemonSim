import {RandomPlayerAI} from '@pkmn/sim';
import {Dex as pokeDex} from '@pkmn/dex';
import {Generations} from '@pkmn/data';

const POKEDEX = new Generations(pokeDex).get(9);

const SINGLE = ['normal', 'any', 'adjacentFoe'];
const SPREAD = ['allAdjacentFoes', 'allAdjacent'];
const SPREAD_MOD = 0.75; //Spread moves do 75% damage to each target
const UTILITY_SCORE = 15; //Utility moves are given a score of 20
const KO_BONUS = 40;
const SWITCH_COST = 5;
const DEATH_PENALTY = 100;

export class DoublesAI_v4 extends RandomPlayerAI {
  constructor(stream, id, team) {
    super(stream);
    this.playerId = id;
    this.team = team;
    this.request = null;
    this.randomnessExponent = 10;
    this._speciesCache = new Map();
    this._moveCache = new Map();
    this.lastChoice = {};
    this.state = {
      turn: 0,
      slots: new Map(),
      roster: new Map(),
    };
  }
  receive(chunk) {
  this.updateState(chunk);
  super.receive(chunk);
}
  chooseMove(active, moves) {
    //Figure out which slot is active, and which is the partner
    const index = this.request.active.indexOf(active);
    const mySlot = `${this.playerId}${index === 0 ? 'a': 'b'}`;
    const partnerSlot = `${this.playerId}${index === 0 ? 'b': 'a'}`;

    //Figure out what pokemon I am, and the enemy
    const foeId = this.playerId === 'p1' ? 'p2' : 'p1';
    const myRecord = this.state.slots.get(mySlot);
    const me = myRecord ? { record: myRecord, species: this.getSpecies(myRecord.species) } : null;
    const partnerRecord = this.state.slots.get(partnerSlot);
    const partner = partnerRecord ? { record: partnerRecord, species: this.getSpecies(partnerRecord.species) } : null;

    //Foes[0] is the first enemy, foes[1] is the second enemy
    const foes = this.getFoes(foeId);
    
    if(!me?.species || foes.every(f => f === null)) {
      return moves[0].choice;
    }
    const incoming = this.estimateIncoming(me, foes);

    const candidates = [] // {choice, score}
    for (const entry of moves) { 
      const moveData = this.getMove(entry.move.move);
      if(!moveData) continue;
      const kind = entry.move.target;
      const slot = entry.move.slot;

      //protect type move
      if(moveData.id === 'protect' || moveData.id === 'detect') {
        //Utility move, add to candidates with a score of 20
        const threatened = incoming >= me.record.hp;
        let score = threatened ? 60 : UTILITY_SCORE;
        if (this.lastChoice?.[mySlot] === 'protect') score = 5;
        candidates.push({choice: entry.choice, score, id: moveData.id});
        continue;
      }
      //General Utility move
      if (moveData.basePower === 0 || !(SINGLE.includes(kind) || SPREAD.includes(kind))) {
        candidates.push({choice: entry.choice, score: UTILITY_SCORE, id: moveData.id});
        continue;
      }
      //Single target move
      if (SINGLE.includes(kind)) {
        let best = -Infinity, target = 0;
        foes.forEach((foe, i) => {
          if (!foe) return;
          const pct = this.estimatePercent(moveData, me, foe);
          const ko = pct >= foe.record.hp;
          const value = Math.min(pct, foe.record.hp) + (ko ? KO_BONUS: 0);
          if( value > best) { best = value; target = i + 1;}
        });
        if (target) candidates.push({choice: `move ${slot} ${target}`, score: best, id: moveData.id});
        continue;
      }
      //Spread target move
      if (SPREAD.includes(kind)) {
        let total = 0;
        for(const foe of foes){
            if(!foe) continue;
            const pct = this.estimatePercent(moveData, me, foe) * SPREAD_MOD;
            total += Math.min(pct, foe.record.hp) + (pct >= foe.record.hp? KO_BONUS : 0);
          }
          if(kind === "allAdjacent" && partner?.species) {
            total -= this.estimatePercent(moveData, me, partner) * SPREAD_MOD;
          }
          candidates.push({choice: `move ${slot}`, score: total, id:moveData.id})
      }
    }
    //Determin if we should swap instead
    if (!active.trapped && incoming >= me.record.hp && this.lastChoice?.[mySlot] !== 'switch') {
      let bestSlot = 0, bestScore = -Infinity;
      this.request.side.pokemon.forEach((p, j) => {
        const slot = j + 1;
        if (p.active || p.condition.endsWith('fnt') || this.pendingSwitches.has(slot)) return;
        const s = this.scoreSwitchIn(p, foes);
        if (s !== null && s > bestScore) {bestScore = s; bestSlot = slot; }
      });
      if( bestSlot) candidates.push({choice: `switch ${bestSlot}`, score: bestScore - SWITCH_COST, id: 'switch', slot: bestSlot });
    }
    if (!candidates.length) return moves[0].choice;
    let scores = candidates.map(c=> c.score);
    const pick = this.pickMoveByFitness(scores);
    const chosen = pick === false ? candidates[0]: candidates[pick];
    this.lastChoice[mySlot] = chosen.id;
    if (chosen.id === 'switch') this.pendingSwitches.add(chosen.slot);
    return chosen.choice;
  }

  chooseSwitch(active, switches)
    {
      const foeId = this.playerId === 'p1' ? 'p2' : 'p1';
      const foes = this.getFoes(foeId)
      if (foes.every(f => f === null)) return switches[0].slot;
      let bestSlot = switches[0].slot;
      let bestScore = -Infinity;
      for (const {slot, pokemon} of switches) {
        const score = this.scoreSwitchIn(pokemon, foes);
        if (score === null) continue;
        if (score > bestScore) { bestScore = score; bestSlot = slot;}
      }
      return bestSlot;
    }

  updateState(chunk) {
    for(const line of chunk.split('\n')) {
      const parts = line.split('|');
      switch(parts[1]) {
        case 'turn':  this.state.turn = Number(parts[2]); break;
        case 'drag': 
        case 'replace': 
        case 'switch': this.handleSwitch(parts); break;
        case 'move': this.handleMove(parts); break;
        case 'faint': this.handleFaint(parts); break;
        case '-damage':
        case '-heal':
        case '-sethp': this.handleHpChange(parts); break;
        case '-status': this.handleStatusChange(parts); break;
        case '-curestatus': this.handleStatusChange(parts, true); break;
      }
    }
  }
  receiveRequest(request) {
    this.request = request;
    this.pendingSwitches = new Set();
    super.receiveRequest(request);
  }
//Handlers-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  handleSwitch(parts) {
    const ident = this.parseIdent(parts[2]);
    if (!ident) return;
    const details = parts[3].split(',').map( s=> s.trim());
    const species = details[0];
    const level = Number((details.find(d => /^L\d+$/.test(d)) ?? 'L100').slice(1));
    const key = `${ident.player}|${species}`;
    let record = this.state.roster.get(key);
    if(!record) {
      record = {species,level, hp: 100, status: null, moves: new Set()};
      this.state.roster.set(key, record)
    }
    const {hp, status} = this.parseCondition(parts[4]);
    record.hp = hp;
    record.status = status;
    this.state.slots.set(ident.slot, record);
  }
  handleMove(parts) {
    const ident = this.parseIdent(parts[2]);
    if (!ident) return;
    const move = parts[3].split(',')[0];
    const slotState = this.state.slots.get(ident.slot);
    if (slotState) {
      slotState.moves.add(move);
    }
  }

  handleHpChange(parts) {
    const ident = this.parseIdent(parts[2]);
    if (!ident) return;
    const slotState = this.state.slots.get(ident.slot);
    if (!slotState) return;
    const {hp,status} = this.parseCondition(parts[3]);
    slotState.hp = hp;
    slotState.status = status;
  }

  handleStatusChange(parts, cure = false) {
    if(cure){
      const ident = this.parseIdent(parts[2]);
      if (!ident) return;
      const slotState = this.state.slots.get(ident.slot);
      if (slotState) {
        slotState.status = null;
      }
    }
    else {
      const ident = this.parseIdent(parts[2]);
      if (!ident) return;
      const status = parts[3];
      const slotState = this.state.slots.get(ident.slot);
      if (slotState) { 
        slotState.status = status;
      }
    }
  }

  handleFaint(parts) {
    // Handle faint logic for doubles battles
    // This is a placeholder for actual faint handling logic
    const ident = this.parseIdent(parts[2]);
    if (!ident) return;
    const slotState = this.state.slots.get(ident.slot);
    if (slotState) { 
      slotState.hp = 0;
    }
  }

  scoreSwitchIn(pokemon, foes) {
      const details = pokemon.details.split(',').map(s=> s.trim());
      const level = Number((details.find(d=> /^L\d+$/.test(d)) ?? 'L100').slice(1));
      const candidate = {
        record: {species: details[0], level, moves: new Set(pokemon.moves)},
        species: this.getSpecies(details[0]),
      };
      if (!candidate.species) return null;
      const hp = this.parseCondition(pokemon.condition).hp;
      const defense = this.estimateIncoming(candidate, foes);
      let offensiveScore = 0;
      for(const move of pokemon.moves) {
        const moveData = this.getMove(move);
        if (!moveData) continue;
        for (const foe of foes) {
          if (!foe) continue;
          const pct = Math.min(this.estimatePercent(moveData, candidate, foe), foe.record.hp);
          if (pct > offensiveScore) offensiveScore = pct;
        }
      }

      const dies = defense >= hp;
      return offensiveScore - defense - (dies ? DEATH_PENALTY: 0);
  }

  //Tools-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  parseIdent(ident) {
    const name = ident.split(':')[0];
    if(name.length !==3) return null;
    return {slot: name, player: name.slice(0,2) };
  }

  parseCondition(condition) {
    if (!condition || condition.startsWith('0 fnt')) return {hp: 0, status: null};
    const [current, rest] = condition.split('/');
    const [max, status] = rest.split(' ');
    return {hp: (Number(current) / Number(max)) * 100, status: status ?? null};
  }

  getSpecies(name) {
    if (!name) return null;
    if (this._speciesCache.has(name)) return this._speciesCache.get(name);
    const species = POKEDEX.species.get(name);
    this._speciesCache.set(name, species);
    return species;
  }

  getMove(name) {
    if (!name) return null;
    if (this._moveCache.has(name)) return this._moveCache.get(name);
    const move = POKEDEX.moves.get(name);
    this._moveCache.set(name, move);
    return move;
  }
  estimateDamage(moveData, attackerData, DefenderData)
  {
    return moveData.basePower * (moveData.category === 'Physical' ? (attackerData.baseStats.atk / DefenderData.baseStats.def) : (attackerData.baseStats.spa / DefenderData.baseStats.spd)) * POKEDEX.types.totalEffectiveness(moveData.type, DefenderData.types) * (attackerData.types.includes(moveData.type) ? 1.5 : 1);
  }
  pickMoveByFitness(moveArr) {
    let total = 0;
    const weighted = {};
    for (const move in moveArr) {
      if ({}.hasOwnProperty.call(moveArr, move)) {
        weighted[move] = moveArr[move] >= 0
          ? Math.pow(moveArr[move], this.randomnessExponent)
          : 0;
        total += weighted[move];
      }
    }
    const myVal = Math.random() * total;
    let accum = 0;
    for (const move in weighted) {
      if ({}.hasOwnProperty.call(weighted, move)) {
        accum += weighted[move];
        if (accum > myVal) return move;
      }
    }
    // something went wrong
    return false;
  }

  statAt(base, level, isHp = false)
  {
    const core = Math.floor((2 * base + 31 + 21) * level/100);
    return isHp ? core + level + 10 : core + 5;
  }

  estimatePercent(moveData, attacker, defender) {
    if(!moveData.basePower) return 0;
    const physical = moveData.category === 'Physical';
    const atk = this.statAt(physical ? attacker.species.baseStats.atk : attacker.species.baseStats.spa, attacker.record.level);
    const def = this.statAt(physical ? defender.species.baseStats.def : defender.species.baseStats.spd, defender.record.level);
    const hp = this.statAt(defender.species.baseStats.hp, defender.record.level, true);

    let damage = Math.floor(Math.floor(2 * attacker.record.level / 5 + 2) * moveData.basePower * atk / def / 50) + 2;
    damage *= .925; //Damage Roll
    damage *= attacker.species.types.includes(moveData.type) ? 1.5 : 1; // Stab
    damage *= POKEDEX.types.totalEffectiveness(moveData.type, defender.species.types);
    return damage/hp* 100;
  }
  
  estimateIncoming(me, foes) {
    let max = new Array(2).fill(0);
    let total = 0;
    foes.forEach((foe, i) => {
      if (!foe) return;
      for (const move of foe.record.moves) {
        const moveData = this.getMove(move);
        if(!moveData || moveData.basePower === 0) continue;
        const percent = this.estimatePercent(moveData, foe, me);
        if(percent > max[i]) max[i] = percent;
      }
    });
    total = max[0] + max[1];
    return total;
  }

  getFoes(foeId)  {
    const foes = ['a', 'b'].map(letter => {
      const record = this.state.slots.get(`${foeId}${letter}`);
      if (!record || record.hp <= 0) return null;
      return {record, species: this.getSpecies(record.species)};
    })
    return foes;
  }

  ////Foes[0] is the first enemy, foes[1] is the second enemy
    // const foes = ['a', 'b'].map(letter => {
    //   const record = this.state.slots.get(`${foeId}${letter}`);
    //   if(!record || record.hp <= 0) return null;
    //   return {record, species: this.getSpecies(record.species) };
    // });
}