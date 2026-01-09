window.GMRPG = window.GMRPG || {};
// js/data/moves.js
const MOVE_DB = {
  Neutral: [
    { id:"Tackle", type:"Neutral", power:10, acc:0.98, pp:25 },
    { id:"Guard", type:"Neutral", power:0,  acc:1.0,  pp:20, buff:{def:2} },
  ],
  Fire: [
    { id:"Fireball",   type:"Fire", power:14, acc:0.92, pp:15 },
    { id:"Ember Bite", type:"Fire", power:12, acc:0.96, pp:18 },
    { id:"Flare Up",   type:"Fire", power:0,  acc:1.0,  pp:12, buff:{atk:3} },
  ],
  Water: [
    { id:"Waterspout", type:"Water", power:14, acc:0.92, pp:15 },
    { id:"Bubble Jet", type:"Water", power:12, acc:0.97, pp:18 },
    { id:"Flow Guard", type:"Water", power:0,  acc:1.0,  pp:12, buff:{def:3} },
  ],
  Leaf: [
    { id:"Vine Lash",   type:"Leaf", power:13, acc:0.95, pp:16 },
    { id:"Seed Shot",   type:"Leaf", power:11, acc:0.99, pp:20 },
    { id:"Photosurge",  type:"Leaf", power:0,  acc:1.0,  pp:12, buff:{atk:2, def:1} },
  ],
  Stone: [
    { id:"Rock Slam",   type:"Stone", power:14, acc:0.90, pp:14 },
    { id:"Pebble Burst",type:"Stone", power:12, acc:0.96, pp:18 },
    { id:"Stone Skin",  type:"Stone", power:0,  acc:1.0,  pp:10, buff:{def:4} },
  ],
  Air: [
    { id:"Gale Slice",  type:"Air", power:13, acc:0.95, pp:16 },
    { id:"Quick Jab",   type:"Air", power:10, acc:0.99, pp:22, priority:1 },
    { id:"Updraft",     type:"Air", power:0,  acc:1.0,  pp:12, buff:{spd:3} },
  ],
  Night: [
    { id:"Shadow Claw", type:"Night", power:13, acc:0.95, pp:16 },
    { id:"Dusk Bolt",   type:"Night", power:12, acc:0.96, pp:18 },
    { id:"Focus Dark",  type:"Night", power:0,  acc:1.0,  pp:12, buff:{atk:2} },
  ],
};

const makeMoveInstance = (m)=>({ ...m, curPP:m.pp });

function randomMovesForType(type, randi){
  const pool = (MOVE_DB[type]||[]).slice();
  const moves = [ makeMoveInstance(MOVE_DB.Neutral[0]) ];
  for (let k=0;k<2;k++){
    if (!pool.length) break;
    const idx=randi(0,pool.length-1);
    moves.push(makeMoveInstance(pool.splice(idx,1)[0]));
  }
  if (moves.length<2) moves.push(makeMoveInstance(MOVE_DB.Neutral[1]));
  return moves.slice(0,4);
}

window.GMRPG.MOVE_DB = MOVE_DB;
window.GMRPG.makeMoveInstance = makeMoveInstance;
window.GMRPG.randomMovesForType = randomMovesForType;
