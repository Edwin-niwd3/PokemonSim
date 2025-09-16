import battlePkg from "pokemon-showdown/dist/sim/battle.js";
import dexPkg from "pokemon-showdown/dist/sim/dex.js";
import teampkg from "pokemon-showdown/dist/sim/teams.js";

const { Battle } = battlePkg;
const { Dex } = dexPkg;
const { Teams } = teampkg;

const battle = new Battle(Dex.forFormat("gen9vgc2025"));

const team1Json = [
  {
    "name": "Bob",
    "species": "Squirtle",
    "gender": "",
    "item": "",
    "ability": "Rain Dish",
    "evs": {"hp": 252, "atk": 0, "def": 0, "spa": 252, "spd": 4, "spe": 0},
    "nature": "Modest",
    "ivs": {"hp": 31, "atk": 31, "def": 31, "spa": 30, "spd": 30, "spe": 31},
    "moves": ["Splash"]
  },
{
    "name": "Dog",
    "species": "Ludicolo",
    "gender": "",
    "item": "",
    "ability": "Rain Dish",
    "evs": {"hp": 252, "atk": 0, "def": 0, "spa": 252, "spd": 4, "spe": 0},
    "nature": "Modest",
    "ivs": {"hp": 31, "atk": 31, "def": 31, "spa": 30, "spd": 30, "spe": 31},
    "moves": ["Splash"]
  },
]

const team2Json = [ 
  {
    "name": "Fob",
    "species": "Pikachu",
    "gender": "",
    "item": "Lightorb",
    "ability": "Static",
    "evs": {"hp": 252, "atk": 0, "def": 0, "spa": 252, "spd": 4, "spe": 0},
    "nature": "Modest",
    "ivs": {"hp": 31, "atk": 31, "def": 31, "spa": 30, "spd": 30, "spe": 31},
    "moves": ["Thunderbolt"]
  },{
    "name": "Fog",
    "species": "Raichu",
    "gender": "",
    "item": "Lightorb",
    "ability": "Static",
    "evs": {"hp": 252, "atk": 0, "def": 0, "spa": 252, "spd": 4, "spe": 0},
    "nature": "Modest",
    "ivs": {"hp": 31, "atk": 31, "def": 31, "spa": 30, "spd": 30, "spe": 31},
    "moves": ["Thunderbolt"]
  },
]

const team1 = Teams.pack(team1Json);
const team2 = Teams.pack(team2Json);

battle.join("p1", "Player 1", 1, team1);
battle.join("p2", "Player 2", 1, team2);

battle.choose("p1", "team 12");
battle.choose("p2", "team 12");

battle.choose("p1", "move 1");
battle.choose("p2", "move 1");

battle.choose("p1", "move 1");
battle.choose("p2", "move 1");

battle.choose("p1", "move 1");
battle.choose("p2", "move 1");

battle.choose("p1", "move 1");
battle.choose("p2", "move 1");

battle.choose("p1", "move 1");
battle.choose("p2", "move 1");


console.log(battle.log.join("\n"));