// js/main.js (classic)
window.addEventListener("load", ()=>{
  const canvas = document.getElementById("game");
  if (!canvas){ console.error("Canvas #game not found"); return; }
  window.GMRPG.createGame(canvas);
});
