window.GMRPG = window.GMRPG || {};
// js/util/math.js
const clamp = (n,a,b)=>Math.max(a,Math.min(b,n));
const easeOutCubic = (t)=>1-Math.pow(1-t,3);

window.GMRPG.clamp = clamp;
window.GMRPG.easeOutCubic = easeOutCubic;
