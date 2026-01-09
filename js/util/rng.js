window.GMRPG = window.GMRPG || {};
// js/util/rng.js
function mulberry32(seed){
  return function(){
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeRng(seed){
  const rand = mulberry32(seed >>> 0);
  const randi = (min,max)=>Math.floor(rand()*(max-min+1))+min;
  const chance = (p)=>rand()<p;
  const clamp = (n,a,b)=>Math.max(a,Math.min(b,n));
  return { rand, randi, chance, clamp, seed: seed>>>0 };
}

window.GMRPG.mulberry32 = mulberry32;
window.GMRPG.makeRng = makeRng;
