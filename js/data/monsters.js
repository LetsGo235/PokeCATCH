// js/data/monsters.js (classic)
window.GMRPG = window.GMRPG || {};

const MON_DB = [
  // === STARTER LINE ===
  { id:"Sproutle",  type:"Leaf",  hp:22, atk:8,  def:7,  spd:7,  catch:0.55, evo:{ level:10, into:"Floraby" } },
  { id:"Floraby",   type:"Leaf",  hp:30, atk:12, def:10, spd:9,  catch:0.0,  evo:null },

  { id:"Embercub",  type:"Fire",  hp:20, atk:9,  def:6,  spd:8,  catch:0.50, evo:{ level:10, into:"Emberlion" } },
  { id:"Emberlion", type:"Fire",  hp:29, atk:13, def:9,  spd:10, catch:0.0,  evo:null },

  { id:"Glimpfin",  type:"Water", hp:21, atk:8,  def:8,  spd:6,  catch:0.52, evo:{ level:10, into:"Glimpshark" } },
  { id:"Glimpshark",type:"Water", hp:30, atk:12, def:11, spd:8,  catch:0.0,  evo:null },

  // === ROUTE MONS ===
  { id:"Pebblit",   type:"Stone", hp:25, atk:7,  def:10, spd:5,  catch:0.48, evo:{ level:12, into:"Bouldra" } },
  { id:"Bouldra",   type:"Stone", hp:36, atk:11, def:15, spd:7,  catch:0.0,  evo:null },

  { id:"Buzzlet",   type:"Air",   hp:18, atk:10, def:5,  spd:10, catch:0.42, evo:{ level:12, into:"Voltwing" } },
  { id:"Voltwing",  type:"Air",   hp:27, atk:14, def:8,  spd:14, catch:0.0,  evo:null },

  { id:"Shadepup",  type:"Night", hp:19, atk:9,  def:6,  spd:9,  catch:0.45, evo:{ level:12, into:"Shadewolf" } },
  { id:"Shadewolf", type:"Night", hp:28, atk:14, def:9,  spd:12, catch:0.0,  evo:null },

  // === NEW BASE FORMS (6) ===
  { id:"Mosskit",  type:"Leaf",  hp:21, atk:8,  def:7,  spd:6,  catch:0.55, evo:{ level:11, into:"Mosslord" } },
  { id:"Cindlet",  type:"Fire",  hp:20, atk:9,  def:6,  spd:7,  catch:0.52, evo:{ level:12, into:"Cinderox" } },
  { id:"Drizzel",  type:"Water", hp:22, atk:8,  def:8,  spd:6,  catch:0.54, evo:{ level:12, into:"Drizzlord" } },
  { id:"Gloomimp", type:"Night", hp:19, atk:9,  def:6,  spd:8,  catch:0.48, evo:{ level:13, into:"Gloomfiend" } },
  { id:"Zephyx",   type:"Air",   hp:18, atk:10, def:5,  spd:10, catch:0.46, evo:{ level:14, into:"Zephyreon" } },
  { id:"Metallin", type:"Stone", hp:25, atk:7,  def:11, spd:4,  catch:0.44, evo:{ level:14, into:"Metallord" } },

  // === NEW EVOLUTIONS (6) ===
  { id:"Mosslord",   type:"Leaf",  hp:34, atk:13, def:11, spd:8,  catch:0.0, evo:null },
  { id:"Cinderox",   type:"Fire",  hp:31, atk:14, def:9,  spd:10, catch:0.0, evo:null },
  { id:"Drizzlord",  type:"Water", hp:33, atk:12, def:12, spd:8,  catch:0.0, evo:null },
  { id:"Gloomfiend", type:"Night", hp:30, atk:14, def:9,  spd:11, catch:0.0, evo:null },
  { id:"Zephyreon",  type:"Air",   hp:28, atk:15, def:8,  spd:15, catch:0.0, evo:null },
  { id:"Metallord",  type:"Stone", hp:38, atk:12, def:16, spd:6,  catch:0.0, evo:null },
];

const MON_DESC = {
  Sproutle:"A curious sprout that loves sunny clearings.",
  Floraby:"Bloomed and confident—its vines strike with precision.",
  Embercub:"A hot-headed cub that leaves warm pawprints behind.",
  Emberlion:"A blazing hunter with a roaring flame-heart.",
  Glimpfin:"A playful fin that splashes through puddles and streams.",
  Glimpshark:"Fast and fierce—its waterspout hits like a wave.",
  Pebblit:"A tiny stone critter that’s tougher than it looks.",
  Bouldra:"A living boulder—unyielding defense and heavy hits.",
  Buzzlet:"A speedy buzz that zips through the air with sparks.",
  Voltwing:"Lightning-fast wings that cut the air like blades.",
  Shadepup:"A sly pup that prowls in the dusk and shadows.",
  Shadewolf:"A night stalker that strikes before you can blink.",
  Mosskit:"A mossy kitten that hides in undergrowth.",
  Mosslord:"An ancient guardian wrapped in vine armor.",
  Cindlet:"A coal-bright critter that crackles with heat.",
  Cinderox:"A furnace beast that burns hotter under pressure.",
  Drizzel:"A rain sprite that follows the smell of oceans.",
  Drizzlord:"A tide-keeper that summons heavy surf.",
  Gloomimp:"A mischief imp that loves moonless paths.",
  Gloomfiend:"A fiend that thrives in deep forests.",
  Zephyx:"A wind fox that darts between rooftops.",
  Zephyreon:"A gale hunter—too fast to track.",
  Metallin:"A metal mole that digs under stone streets.",
  Metallord:"A plated titan with crushing defense.",
};

const monById = new Map(MON_DB.map(m=>[m.id,m]));

function expToNext(level){ return Math.floor(18 + level*level*2.6); }

function makeMon(idOrDb, level, randi){
  const db = typeof idOrDb==="string" ? monById.get(idOrDb) : idOrDb;
  const L = level;
  const maxHP = db.hp + Math.floor(L*3.0);
  return {
    id: db.id, type: db.type, level: L,
    maxHP, hp:maxHP,
    atk: db.atk + Math.floor(L*1.2),
    def: db.def + Math.floor(L*1.0),
    spd: db.spd + Math.floor(L*1.1),
    catch: db.catch,
    exp: 0,
    expNext: expToNext(L),
    moves: window.GMRPG.randomMovesForType(db.type, randi),
    seen: true,
    nickname: null
  };
}

const restorePP = (mon)=>{ for (const mv of mon.moves) mv.curPP = mv.pp; };

// expose
window.GMRPG.MON_DB = MON_DB;
window.GMRPG.MON_DESC = MON_DESC;
window.GMRPG.monById = monById;
window.GMRPG.makeMon = makeMon;
window.GMRPG.expToNext = expToNext;
window.GMRPG.restorePP = restorePP;
