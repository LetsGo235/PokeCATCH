window.GMRPG = window.GMRPG || {};
// js/systems/input.js
function createInput(){
  const keys = new Set();
  const justPressed = new Set();
  function normalizeKey(k){ if (k===" ") return "Space"; return k.length===1 ? k.toLowerCase() : k; }
  const pressed = (k)=>keys.has(k);
  const tapped = (k)=>{ if (justPressed.has(k)){ justPressed.delete(k); return true; } return false; };

  window.addEventListener("keydown",(e)=>{
    const k=normalizeKey(e.key);
    if (!keys.has(k)) justPressed.add(k);
    keys.add(k);
    if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key)) e.preventDefault();
  },{passive:false});
  window.addEventListener("keyup",(e)=>keys.delete(normalizeKey(e.key)));

  const clearJustPressed = ()=>justPressed.clear();
  return { pressed, tapped, clearJustPressed };
}

window.GMRPG.createInput = createInput;
