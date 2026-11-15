import {RandomPlayerAI} from '@pkmn/sim';
import {Dex as pokeDex} from '@pkmn/dex';
import {Generations} from '@pkmn/data';

const POKEDEX = new Generations(pokeDex).get(9);

export class DoublesAI_v1 extends RandomPlayerAI {
  constructor(stream, id, team) {
    super(stream);
    this.playerId = id;
    this.team = team;
    this.request = null;
    this.randomnessExponent = 10;
    this._speciesCache = new Map();
    this._moveCache = new Map();
    this.state = {
      turn: 0,
      slots: new Map(),
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
    const partnerRecord = this.state.slots.get(mySlot);
    const partner = partnerRecord ? { record: partnerRecord, species: this.getSpecies(partnerRecord.species) } : null;

    //Foes[0] is the first enemy, foes[1] is the second enemy
    const foes = ['a', 'b'].map(letter => {
      const record = this.state.slots.get(`${foeId}${letter}`);
      if(!record || record.hp <= 0) return null;
      return {record, species: this.getSpecies(record.species) };
    });

    if(!me?.species || foes.every(f => f === null)) {
      return moves[0].choice;
    }

    const SINGLE = ['normal', 'any', 'adjacentFoe'];
    const SPREAD = ['allAdjacentFoes', 'allAdjacent'];
    const SPREAD_MOD = 0.75; //Spread moves do 75% damage to each target
    const UTILITY_SCORE = 15; //Utility moves are given a score of 20
    const KO_BONUS = 40;

    const candidates = [] // {choice, score}
    for (const entry of moves) { 
      const moveData = this.getMove(entry.move.move);
      if(!moveData) continue;
      const kind = entry.move.target;
      const slot = entry.move.slot;
      if(moveData.basePower === 0 || !(SINGLE.includes(kind) || SPREAD.includes(kind))) {
        //Utility move, add to candidates with a score of 20
        candidates.push({choice: entry.choice, score: UTILITY_SCORE});
        continue;
      }
      if (SINGLE.includes(kind)) {
        let best = -Infinity, target = 0;
        foes.forEach((foe, i) => {
          if (!foe) return;
          const pct = this.estimatePercent(moveData, me, foe);
          const ko = pct >= foe.record.hp;
          const value = Math.min(pct, foe.record.hp) + (ko ? KO_BONUS: 0);
          if( value > best) { best = value; target = i + 1;}
        });
        if (target) candidates.push({choice: `move ${slot} ${target}`, score: best});
        continue;
      }
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
      }
    }
    if (!candidates.length) return moves[0].choice;
    const scores = candidates.map(c=> c.score);
    const pick = this.pickMoveByFitness(scores);
    return pick === false ? candidates[0].choice : candidates[pick].choice;
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
    super.receiveRequest(request);
  }
//Handlers-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  handleSwitch(parts) {
    const ident = this.parseIdent(parts[2]);
    if (!ident) return;
    const details = parts[3].split(',').map( s=> s.trim());
    const species = details[0];
    const level = Number((details.find(d => /^L\d+$/.test(d)) ?? 'L100').slice(1));
    this.state.slots.set(ident.slot, {
      species,
      hp: 100,
      status: null,
      moves: new Set(),
      level: level,
    });
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
    const condition = parts[3];
    let hp;
    if(condition.startsWith('0 fnt')) {
      hp = 0;
    } else {
      const [current, rest] = condition.split('/');
      const max = rest.split(' ')[0];
      hp = (Number(current)/Number(max)) * 100;
    }
    const slotState = this.state.slots.get(ident.slot);
    if (slotState) {
      slotState.hp = hp;
    }
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

  //Tools-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  parseIdent(ident) {
    const name = ident.split(':')[0];
    if(name.length !==3) return null;
    return {slot: name, player: name.slice(0,2) };
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

}