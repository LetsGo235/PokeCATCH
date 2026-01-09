// js/game.js (classic, no modules)
window.GMRPG = window.GMRPG || {};
(function(){
  const {
    createInput, createAudio,
    makeRng,
    clamp, easeOutCubic,
    MOVE_DB, makeMoveInstance,
    MON_DB, MON_DESC, monById, makeMon, expToNext, restorePP,
    typeMult, typeColor,
    createWorld, genInteriors, genRouteFiveTowns, insideTown,
    TILE, Tile, Dir, dirVec, tileAt, biomeAt, walkable, Biome
  } = window.GMRPG;

function createGame(canvas){
  // ============================================================
  // Canvas setup (virtual resolution)
  // ============================================================
  const ctx = canvas.getContext("2d");
  const VW = 320, VH = 180;
  const v = document.createElement("canvas"); v.width = VW; v.height = VH;
  const g = v.getContext("2d");
  g.imageSmoothingEnabled = false; ctx.imageSmoothingEnabled = false;

  function fitCanvas(){
    const w=window.innerWidth, h=window.innerHeight;
    const scale=Math.max(1, Math.floor(Math.min(w/VW, h/VH)));
    canvas.width = VW*scale; canvas.height = VH*scale;
    ctx.imageSmoothingEnabled = false;
  }
  window.addEventListener("resize", fitCanvas); fitCanvas();

  // ============================================================
  // Systems
  // ============================================================
  const input = createInput();
const Audio = createAudio();

// ============================================================
// Settings + Virtual (Mobile) Controls
// ============================================================
const isTouchDevice = ("ontouchstart" in window) || (navigator.maxTouchPoints>0);
const settings = {
  showMobileControls: (()=> {
    const v = localStorage.getItem("gmrpg_showMobileControls");
    if (v===null) return isTouchDevice;
    return v==="1";
  })()
};
function setShowMobileControls(v){
  settings.showMobileControls = !!v;
  localStorage.setItem("gmrpg_showMobileControls", settings.showMobileControls ? "1":"0");
}

const vKeys = Object.create(null);
const vTapped = Object.create(null);
const _pressed = input.pressed.bind(input);
const _tapped  = input.tapped.bind(input);
input.pressed = (k)=> _pressed(k) || !!vKeys[k];
input.tapped  = (k)=> {
  if (vTapped[k]){ delete vTapped[k]; return true; }
  return _tapped(k);
};
function vPress(k){ if (!vKeys[k]) vTapped[k]=true; vKeys[k]=true; }
function vRelease(k){ vKeys[k]=false; }

const touches = new Map(); // id -> {vx,vy}
function toVirtual(clientX, clientY){
  const r = canvas.getBoundingClientRect();
  const nx = (clientX - r.left) / Math.max(1, r.width);
  const ny = (clientY - r.top)  / Math.max(1, r.height);
  return { vx: nx * VW, vy: ny * VH };
}
const uiTapQueue = [];
function registerTouch(e){
  canvas.setPointerCapture(e.pointerId);
  const p = toVirtual(e.clientX, e.clientY);
  touches.set(e.pointerId, p);
  uiTapQueue.push({ vx:p.vx, vy:p.vy, time: performance.now() });
}
function moveTouch(e){
  if (!touches.has(e.pointerId)) return;
  touches.set(e.pointerId, toVirtual(e.clientX, e.clientY));
}
function clearPtr(e){ touches.delete(e.pointerId); }

canvas.addEventListener("pointerdown", registerTouch);
canvas.addEventListener("pointermove", moveTouch);
canvas.addEventListener("pointerup", clearPtr);
canvas.addEventListener("pointercancel", clearPtr);

  const seed = (Date.now() ^ (Math.random()*1e9)) >>> 0;
  const rng = makeRng(seed);

  // Unlock audio on interaction
  let audioUnlocked=false;
  function unlockAudio(){
    if (audioUnlocked) return;
    audioUnlocked=true;
    Audio.ensure();
    Audio.BGM.startTrack("town");
  }
  window.addEventListener("pointerdown", unlockAudio, {once:true});
  window.addEventListener("keydown", unlockAudio, {once:true});

  // ============================================================
  // World
  // ============================================================
  const World = createWorld({ mapW:170, mapH:110 });
  genInteriors(World);
  const routeMeta = genRouteFiveTowns(World, rng);
function doorKey(x,y){ return `${x},${y}`; }

  function doorMeaning(worldId,x,y){
    if (worldId==="route"){
      return routeMeta.doorLookup.get(doorKey(x,y)) || null;
    }
    if (worldId==="center"){
      const doorX=Math.floor(World.center.w/2);
      if (x===doorX && y===World.center.h-2) return { to:"route" };
    }
    if (worldId==="mart"){
      const doorX=Math.floor(World.mart.w/2);
      if (x===doorX && y===World.mart.h-2) return { to:"route" };
    }
    return null;
  }

  function npcAt(worldId,x,y){
    const list = npcListForWorld(worldId);
    return list.find(n=>n.x===x && n.y===y);
  }

  // ============================================================
  // Player
  // ============================================================
  const spawnTownA = routeMeta.towns.find(t=>t.id==="A");
  const player = {
    worldId:"route",
    x: spawnTownA.x + 12,
    y: spawnTownA.y + 14,
    px:0, py:0,
    dir:Dir.Down,
    moving:false, moveT:0,
    moveFrom:{x:0,y:0}, moveTo:{x:0,y:0},
    lastMoveSprint:false,
    hold:{ dir:null, timer:0 },

    party:[],
    box:[],
    bag:{ "Potion":3, "Super Potion":1, "Monster Ball":6, "Adrenaline Potion":1, "Escape Rope":1 },
    money:220,
    badges:new Set(),
    dojoStreak:0,
    dexCaught:new Set(),
    dexSeen:new Set(),
    returnDoor:{x:0,y:0},
    lastTownId:"A"
  };
  player.px = player.x*TILE; player.py = player.y*TILE;
  // ============================================================
  // ============================================================
// UI Editor (simple, in-game)
// Toggle: F2. Saves layout to localStorage.
// ============================================================
const UILAYOUT_DEFAULT = {
  title_play: {x:16,y:64,w:148,h:34},
  title_toggle:{x:16,y:106,w:210,h:30},
  mobile_ctrl:{x:VW-62,y:8,w:54,h:26},
  mobile_pad: {x:14,y:VH-90,w:92,h:92},
  mobile_a:   {x:VW-64,y:VH-68,w:52,h:52},
  mobile_b:   {x:VW-124,y:VH-44,w:46,h:46},
  mobile_spr: {x:VW-176,y:VH-58,w:46,h:30},
};
let uiEdit = { on:false, key:null, dragging:false, dx:0, dy:0 };
function loadLayout(){
  try{
    const raw=localStorage.getItem("gmrpg_uiLayout");
    if (!raw) return JSON.parse(JSON.stringify(UILAYOUT_DEFAULT));
    const o=JSON.parse(raw);
    return Object.assign(JSON.parse(JSON.stringify(UILAYOUT_DEFAULT)), o);
  }catch{
    return JSON.parse(JSON.stringify(UILAYOUT_DEFAULT));
  }
}
function saveLayout(){ try{ localStorage.setItem("gmrpg_uiLayout", JSON.stringify(UILayout)); }catch{} }
function resetLayout(){ UILayout = JSON.parse(JSON.stringify(UILAYOUT_DEFAULT)); saveLayout(); }
let UILayout = loadLayout();
function uiRect(key){ return UILayout[key] || UILAYOUT_DEFAULT[key]; }
function setRect(key, r){ UILayout[key]=r; saveLayout(); }
function toggleUIEditor(){ uiEdit.on=!uiEdit.on; if(uiEdit.on){ uiEdit.key=null; uiEdit.dragging=false; } }

// ============================================================
// Title Screen
// ============================================================
const title = { t:0, carousel:0, bg:[], btnPlay:null, btnToggle:null, btnInGameToggle:null };
function initTitleBG(){
  title.bg.length=0;
  for(let i=0;i<42;i++){
    title.bg.push({x:rng.rand()*VW,y:rng.rand()*VH,r:1+rng.rand()*2.2,vx:-8+rng.rand()*16,vy:-8+rng.rand()*16,a:0.12+rng.rand()*0.22});
  }
}
initTitleBG();
function hitRect(px,py,rc){ return rc && px>=rc.x && py>=rc.y && px<=rc.x+rc.w && py<=rc.y+rc.h; }
function getTitleRects(){ return { play: uiRect("title_play"), toggle: uiRect("title_toggle") }; }

// Starter selection (double-click friendly)
  // ============================================================
  const STARTERS = ["Sproutle","Embercub","Glimpfin"];
  const starterUI = { cursor:0 };

  function setStarter(monId){
    const mon = makeMon(monId, 5, rng.randi);
    const nm = (window.prompt(`Name your ${monId} (leave blank for default):`)||"").trim();
    mon.nickname = nm.length ? nm.slice(0,14) : null;
    player.party = [mon];
    player.dexCaught.add(mon.id);
    player.dexSeen.add(mon.id);
    Audio.cry(mon);
    say(`You chose ${mon.nickname||mon.id}!`);
    say("Now begin your journey.");
    scene = Scene.Overworld;
  }


  const partyHasAlive = ()=>player.party.some(m=>m.hp>0);
  const leadMon = ()=>player.party[0];
  const healPartyFull = ()=>{ for (const m of player.party){ m.hp=m.maxHP; restorePP(m); } };

  // ============================================================
  // UI message queue
  // ============================================================
  const Scene = { Title:0, Starter:1, Overworld:2, Battle:3, Menu:4, Evo:5, Box:6, Shop:7 };
  let scene = Scene.Title;

  const ui = {
    msgQueue:[], activeMsg:null, msgReveal:0,
    choices:null, choiceIndex:0,
    fx:{ shakeT:0, shakeMag:0 }
  };
  const deferred=[]; const defer=(fn)=>deferred.push(fn);
  const flushDeferred=()=>{ while (deferred.length) deferred.shift()(); };

  function say(text, choices=null, onPick=null, fx=null){ ui.msgQueue.push({text,choices,onPick,fx}); }
  function startNextMessage(){
    ui.activeMsg = ui.msgQueue.shift() || null;
    ui.msgReveal=0;
    ui.choices=ui.activeMsg?ui.activeMsg.choices:null;
    ui.choiceIndex=0;
    ui.fx.shakeT=0; ui.fx.shakeMag=0;
    const fx=ui.activeMsg?.fx;
    if (fx?.shake){ ui.fx.shakeT=fx.shake.t; ui.fx.shakeMag=fx.shake.mag; }
    if (fx?.onStart) fx.onStart();
  }
  function advanceMessage(){
    if (!ui.activeMsg) return;
    if (ui.msgReveal < ui.activeMsg.text.length){ ui.msgReveal = ui.activeMsg.text.length; return; }
    if (ui.choices && ui.choices.length){
      const pick = ui.choices[ui.choiceIndex];
      const cb = ui.activeMsg.onPick;
      const fx = ui.activeMsg.fx;
      ui.activeMsg=null;
      if (fx?.afterClose) fx.afterClose();
      if (cb) cb(pick, ui.choiceIndex);
      return;
    }
    const fx=ui.activeMsg.fx;
    ui.activeMsg=null;
    if (fx?.afterClose) fx.afterClose();
  }

  // ============================================================
  // NPCs / Trainers (same as your original baseline)
  // ============================================================
  const NPCType = { Shop:"shop", Heal:"heal", Trainer:"trainer", Box:"box", Quest:"quest" };

  const SHOP_STOCK = [
    { name:"Potion", price:60 },
    { name:"Super Potion", price:120 },
    { name:"Monster Ball", price:50 },
    { name:"Adrenaline Potion", price:90 },
    { name:"Escape Rope", price:90 },
  ];

  // Trainers placed ON the main route corridor
  const trainers = [
    { type:NPCType.Trainer, name:"Scout Mina",
      x: (routeMeta && routeMeta.towns && routeMeta.towns[0]) ? (routeMeta.towns[0].x + routeMeta.towns[0].w + 8) : (player.x+18),
      y: (routeMeta && routeMeta.towns && routeMeta.towns[0]) ? (routeMeta.towns[0].y + Math.floor(routeMeta.towns[0].h/2)) : player.y,
      dir:Dir.Left, defeated:false, sight:7,
      party:[makeMon("Sproutle",6,rng.randi), makeMon("Pebblit",7,rng.randi)], autoChallenge:true
    },
    { type:NPCType.Trainer, name:"Ace Theo",
      x: (routeMeta && routeMeta.towns && routeMeta.towns[1]) ? (routeMeta.towns[1].x - 10) : (player.x+28),
      y: (routeMeta && routeMeta.towns && routeMeta.towns[1]) ? (routeMeta.towns[1].y + Math.floor(routeMeta.towns[1].h/2)) : player.y,
      dir:Dir.Right, defeated:false, sight:7,
      party:[makeMon("Buzzlet",9,rng.randi), makeMon("Shadepup",10,rng.randi)], autoChallenge:true
    }
  ];

  const centerNPCs = [
    { id:"nurse", type:NPCType.Heal, name:"Nurse", x:5, y:3, dir:Dir.Down },
    { id:"box", type:NPCType.Box, name:"Box Terminal", x:World.center.w-6, y:8, dir:Dir.Left },
  ];
  const martNPCs = [
    { id:"clerk", type:NPCType.Shop, name:"Mart Clerk", x:5, y:3, dir:Dir.Down },
    { id:"box", type:NPCType.Box, name:"Box Terminal", x:World.mart.w-6, y:8, dir:Dir.Left },
  ];
  const townNPCs = [
    { id:"courierA", type:NPCType.Quest, name:"Courier", townId:"A", x:spawnTownA.x+6, y:spawnTownA.y+16, dir:Dir.Right },
    { id:"courierB", type:NPCType.Quest, name:"Courier", townId:"B", x:routeMeta.towns.find(t=>t.id==="B").x+6, y:routeMeta.towns.find(t=>t.id==="B").y+16, dir:Dir.Left },
  ];

  function npcListForWorld(worldId){
    if (worldId==="center") return centerNPCs;
    if (worldId==="mart") return martNPCs;
    if (worldId==="route") return trainers.concat(townNPCs);
    return [];
  }

  // ============================================================
  // Battle (kept compact; still fully playable)
  // ============================================================
  const battle = {
    active:false, wild:true, enemyTrainer:null,
    playerMon:null, enemyMon:null,
    menu:"root", cursor:0, canRun:true,
    anim:{ playerAtk:0, enemyAtk:0, playerHit:0, enemyHit:0, playerDodge:0, enemyDodge:0 },
    exitRequested:false, exitTo:null,
    evoQueue:[], effects:[]
  };

  function pushEffect(e){ battle.effects.push({ ...e, t:0 }); }
  function updateEffects(dt){ for (const e of battle.effects) e.t+=dt; battle.effects=battle.effects.filter(e=>e.t<e.dur); }

  function calcDamage(att, def, move){
    const mult=typeMult(move.type, def.type);
    const stab=(move.type!=="Neutral" && move.type===att.type) ? 1.15 : 1.0;
    let dmg=Math.floor((move.power + att.atk*0.62) - (def.def*0.36));
    dmg=clamp(dmg,1,999);
    dmg=Math.floor(dmg*stab*mult*(0.90+rng.rand()*0.20));
    dmg=Math.max(1,dmg);
    return { dmg, mult };
  }
  function requestExitBattle(toScene){ battle.exitRequested=true; battle.exitTo=toScene; }

  function logMoveOnce(mon, move){
    say(`${mon.id} used ${move.id}!`, null, null, {
      shake:{ t:0.12, mag:2.2 },
      afterClose:()=>Audio.cry(mon)
    });
  }

  
  function preEvoFor(evoId){
    for (const m of MON_DB){
      if (m.evo && m.evo.into===evoId) return m;
    }
    return null;
  }

  function biomeTypes(b){
    if (b===Biome.Forest) return ["Night","Leaf"];
    if (b===Biome.Beach)  return ["Water"];
    if (b===Biome.City)   return ["Air","Fire","Stone","Neutral"];
    return ["Leaf","Neutral","Stone"];
  }

  function pickWildMonsterForBiome(biome, level){
    const types = biomeTypes(biome);
    const pool = MON_DB.filter(db=>{
      if (!types.includes(db.type)) return false;

      // evolutions: only if level meets pre-evo evo requirement
      if (db.catch===0){
        const pre = preEvoFor(db.id);
        if (!pre || !pre.evo) return false;
        return level >= pre.evo.level;
      }
      return true;
    });

    const basePool = pool.filter(db=>db.catch>0);
    const evoPool  = pool.filter(db=>db.catch===0);

    const roll = rng.rand();
    if (evoPool.length && roll < 0.12){
      return evoPool[rng.randi(0, evoPool.length-1)];
    }
    const src = basePool.length ? basePool : pool;
    return src[rng.randi(0, src.length-1)] || MON_DB[0];
  }

function beginWildEncounter(){
    scene=Scene.Battle;
    battle.active=true; battle.wild=true; battle.enemyTrainer=null; battle.canRun=true;
    battle.exitRequested=false; battle.exitTo=null; battle.effects.length=0;
    battle.playerMon=player.party.find(m=>m.hp>0)||player.party[0];
    const level=rng.randi(Math.max(3,battle.playerMon.level-2), battle.playerMon.level+3);
    const biome = biomeAt(World,"route", player.x, player.y);
    const base = pickWildMonsterForBiome(biome, level);
    battle.enemyMon = makeMon(base.id, level, rng.randi);
    player.dexSeen.add(battle.enemyMon.id);
    battle.menu="root"; battle.cursor=0;
    Audio.encounter();
    Audio.BGM.setMode("battle");
    say(`A wild ${battle.enemyMon.id} appeared!`, null, null, { onStart:()=>Audio.cry(battle.enemyMon) });
  }
  function beginTrainerBattle(tr){
    scene=Scene.Battle;
    battle.active=true; battle.wild=false; battle.enemyTrainer=tr; battle.canRun=false;
    battle.exitRequested=false; battle.exitTo=null; battle.effects.length=0;
    battle.playerMon=player.party.find(m=>m.hp>0)||player.party[0];
    battle.enemyMon=tr.party.find(m=>m.hp>0);
    player.dexSeen.add(battle.enemyMon.id);
    battle.menu="root"; battle.cursor=0;
    Audio.encounter();
    Audio.BGM.setMode("battle");
    say(`${tr.name} challenges you!`);
    say(`${tr.name} sent out ${battle.enemyMon.id}!`, null, null, { onStart:()=>Audio.cry(battle.enemyMon) });
  }

  function awardExp(winner, loser, isTrainer){
    const base=isTrainer?16:12;
    const gain=Math.floor(base + loser.level*4 + (loser.maxHP*0.15));
    winner.exp += gain;
    say(`${winner.id} gained ${gain} EXP.`);
    while (winner.exp >= winner.expNext){
      winner.exp -= winner.expNext;
      winner.level += 1;
      winner.expNext = expToNext(winner.level);
      winner.maxHP += 3 + Math.floor(winner.level*0.15);
      winner.atk += 1 + (winner.level%3===0 ? 1 : 0);
      winner.def += 1 + (winner.level%4===0 ? 1 : 0);
      winner.spd += 1 + (winner.level%5===0 ? 1 : 0);
      winner.hp = winner.maxHP;
      say(`${winner.id} grew to Lv${winner.level}!`, null, null, { onStart:Audio.blip });

      if (winner.level===7 || winner.level===11){
        const pool=(MOVE_DB[winner.type]||[]).filter(m=>!winner.moves.some(mm=>mm.id===m.id));
        if (pool.length){
          const m=pool[rng.randi(0,pool.length-1)];
          const inst=makeMoveInstance(m);
          if (winner.moves.length>=4) winner.moves[0]=inst; else winner.moves.push(inst);
          say(`${winner.id} learned ${m.id}!`, null, null, { onStart:Audio.ui });
        }
      }
      const baseDb=monById.get(winner.id);
      if (baseDb?.evo && winner.level >= baseDb.evo.level){
        battle.evoQueue.push({ mon:winner, into:baseDb.evo.into });
      }
    }
  }

  // Evolution scene (kept)
  const evo = { active:false, t:0, phase:0, fromId:"", toId:"", monRef:null };
  function startEvolutionScene(monRef,toId){
    evo.active=true; evo.t=0; evo.phase=0; evo.fromId=monRef.id; evo.toId=toId; evo.monRef=monRef;
    scene=Scene.Evo;
    Audio.evoJingle();
  }
  function finishEvolution(){
    const m=evo.monRef; const from=evo.fromId; const to=evo.toId;
    const toDb=monById.get(to);
    m.id=toDb.id; m.type=toDb.type;
    const L=m.level;
    m.maxHP=toDb.hp+Math.floor(L*3.0);
    m.atk=toDb.atk+Math.floor(L*1.2);
    m.def=toDb.def+Math.floor(L*1.0);
    m.spd=toDb.spd+Math.floor(L*1.1);
    m.hp=m.maxHP;

    const pool=(MOVE_DB[m.type]||[]).filter(mm=>!m.moves.some(x=>x.id===mm.id));
    if (pool.length){
      const learned=pool[rng.randi(0,pool.length-1)];
      const inst=makeMoveInstance(learned);
      if (m.moves.length>=4) m.moves[0]=inst; else m.moves.push(inst);
      say(`${from} evolved into ${to}!`, null, null, { onStart:Audio.ui });
      say(`${to} learned ${learned.id}!`, null, null, { onStart:Audio.blip });
    } else {
      say(`${from} evolved into ${to}!`, null, null, { onStart:Audio.ui });
    }
    player.dexSeen.add(to); player.dexCaught.add(to);
    evo.active=false;
    scene=Scene.Overworld;
  }

  function endBattle(victory){
    battle.active=false;
    if (!battle.wild && battle.enemyTrainer){
      if (victory){
        battle.enemyTrainer.defeated=true;
        const reward=rng.randi(60,120);
        player.money += reward;
        say(`You won! Earned €${reward}.`);
      } else {
        battle.enemyTrainer.autoChallenge=false;
        const loss=Math.min(player.money,rng.randi(20,60));
        player.money -= loss;
        for (const m of player.party) m.hp=Math.max(1, Math.floor(m.maxHP*0.35));
        say(`You lost... Paid €${loss}.`);
        say(`${battle.enemyTrainer.name}: Talk to me to challenge me again.`);
      }
    }
    defer(()=>{ if (battle.evoQueue.length){ const next=battle.evoQueue.shift(); startEvolutionScene(next.mon,next.into); } });
    requestExitBattle(Scene.Overworld);
  }

  function tryCatch(){
    if (!battle.wild){ say("You can't catch a trainer's monster!", null, null, {onStart:Audio.miss}); return; }
    if ((player.bag["Monster Ball"]||0)<=0){ say("No Monster Balls left!", null, null, {onStart:Audio.miss}); return; }
    player.bag["Monster Ball"]--;
    const e=battle.enemyMon;
    const hpFactor=1-(e.hp/e.maxHP);
    const p=clamp(e.catch + hpFactor*0.55, 0.05, 0.95);
    const shakes=rng.chance(p)?3:(rng.chance(p*0.7)?2:(rng.chance(p*0.45)?1:0));
    if (shakes===0){ battle.anim.enemyDodge=0.20; say("The ball missed!", null, null, {onStart:Audio.miss}); return; }
    if (shakes<3){ battle.anim.enemyDodge=0.20; say(`Shake... (${shakes}) It broke free!`, null, null, {onStart:Audio.miss}); return; }
    say(`Gotcha! ${e.id} was caught!`, null, null, {onStart:Audio.catch, afterClose:()=>Audio.cry(e)});
    player.dexCaught.add(e.id); player.dexSeen.add(e.id);
    if (player.party.length<3){ player.party.push(e); say(`${e.id} joined your party.`); }
    else { player.box.push(e); say(`${e.id} was sent to the Box.`); }
    say("The wild encounter ended.");
    battle.active=false;
    requestExitBattle(Scene.Overworld);
  }

  function useAdrenaline(mon){
    for (const mv of mon.moves) mv.curPP = Math.min(mv.pp, mv.curPP + 6);
    say(`${mon.id}'s moves recovered PP!`, null, null, {onStart:Audio.blip});
  }

  function pushMoveFX(who, move, kind){
    pushEffect({ who, type: move.type, kind, dur: 0.28, stat: move.buff ? Object.keys(move.buff)[0] : null });
  }

  function enemyTurn(){
    const a=battle.enemyMon, p=battle.playerMon;
    const usable=a.moves.filter(m=>m.curPP>0);
    const mv=usable.length ? usable[rng.randi(0,usable.length-1)] : MOVE_DB.Neutral[0];
    if (mv.curPP>0) mv.curPP--;
    battle.anim.enemyAtk=0.18;

    if (!rng.chance(mv.acc)){
      battle.anim.playerDodge=0.20;
      say(`${a.id}'s ${mv.id} missed!`, null, null, {onStart:Audio.miss});
      pushMoveFX("player", mv, "cast");
      return;
    }
    if (mv.buff){
      if (mv.buff.atk) a.atk += mv.buff.atk;
      if (mv.buff.def) a.def += mv.buff.def;
      if (mv.buff.spd) a.spd += mv.buff.spd;
      logMoveOnce(a,mv);
      pushMoveFX("enemy", mv, "buff");
      say(`${a.id} powered up!`, null, null, {onStart:Audio.blip});
      return;
    }
    const {dmg,mult}=calcDamage(a,p,mv);
    p.hp=clamp(p.hp-dmg,0,p.maxHP);
    battle.anim.playerHit=0.22;

    logMoveOnce(a,mv);
    pushMoveFX("enemy", mv, "cast");
    pushMoveFX("player", mv, "hit");

    if (mult>1.2) say("It's super effective!");
    else if (mult<0.85) say("It's not very effective...");
    say(`${p.id} took ${dmg} damage.`, null, null, {onStart:Audio.hit});
  }

  function playerUseMove(mv){
    const p=battle.playerMon, e=battle.enemyMon;
    if (mv.curPP<=0){ say("No PP left for that move!", null, null, {onStart:Audio.miss}); return {acted:false}; }
    mv.curPP--;
    battle.anim.playerAtk=0.18;

    if (!rng.chance(mv.acc)){
      battle.anim.enemyDodge=0.20;
      say(`${p.id}'s ${mv.id} missed!`, null, null, {onStart:Audio.miss});
      pushMoveFX("enemy", mv, "cast");
      return {acted:true};
    }
    if (mv.buff){
      if (mv.buff.atk) p.atk += mv.buff.atk;
      if (mv.buff.def) p.def += mv.buff.def;
      if (mv.buff.spd) p.spd += mv.buff.spd;
      logMoveOnce(p,mv);
      pushMoveFX("player", mv, "buff");
      say(`${p.id} powered up!`, null, null, {onStart:Audio.blip});
      return {acted:true};
    }
    const {dmg,mult}=calcDamage(p,e,mv);
    e.hp=clamp(e.hp-dmg,0,e.maxHP);
    battle.anim.enemyHit=0.22;

    logMoveOnce(p,mv);
    pushMoveFX("player", mv, "cast");
    pushMoveFX("enemy", mv, "hit");

    if (mult>1.2) say("It's super effective!");
    else if (mult<0.85) say("It's not very effective...");
    say(`${e.id} took ${dmg} damage.`, null, null, {onStart:Audio.hit});
    return {acted:true};
  }

  function checkFaints(){
    const p=battle.playerMon, e=battle.enemyMon;

    if (e && e.hp<=0){
      say(`${e.id} fainted!`, null, null, {onStart:Audio.faint});
      awardExp(p,e,!battle.wild);

      if (!battle.wild && battle.enemyTrainer){
        const next=battle.enemyTrainer.party.find(m=>m.hp>0);
        if (next){
          battle.enemyMon=next;
          player.dexSeen.add(next.id);
          say(`${battle.enemyTrainer.name} sent out ${next.id}!`, null, null, {onStart:()=>Audio.cry(next)});
        } else {
          say("Trainer defeated!");
          endBattle(true);
        }
      } else {
        say("Wild encounter ended.");
        battle.active=false;
        requestExitBattle(Scene.Overworld);
      }
      return true;
    }

    if (p && p.hp<=0){
      say(`${p.id} fainted!`, null, null, {onStart:Audio.faint});
      const next=player.party.find(m=>m.hp>0);
      if (next){
        battle.playerMon=next;
        say(`Go, ${next.id}!`, null, null, {onStart:()=>Audio.cry(next)});
      } else {
        say("You lost the battle!");
        endBattle(false);
      }
      return true;
    }
    return false;
  }

  // ============================================================
  // Movement + encounters + doors
  // ============================================================
  function findSpawnNearDoor(door){
    const candidates=[
      {x:door.x,y:door.y+2},{x:door.x-2,y:door.y+1},{x:door.x+2,y:door.y+1},
      {x:door.x,y:door.y+3},{x:door.x-3,y:door.y+2},{x:door.x+3,y:door.y+2}
    ];
    for (const c of candidates){
      const t=tileAt(World,"route",c.x,c.y);
      if (walkable(t) && !npcAt("route",c.x,c.y)) return c;
    }
    return {x:door.x,y:door.y+2};
  }
  function warpTo(worldId,x,y){
    player.worldId=worldId; player.x=x; player.y=y;
    player.px=x*TILE; player.py=y*TILE;
    player.moving=false;
  }

  function onStepTile(){
    const wid=player.worldId;
    const t=tileAt(World,wid, player.x, player.y);

    if (wid==="route"){
      const town=insideTown(routeMeta, player.x, player.y);
      if (town) player.lastTownId = town.id;
    }

    if (t===Tile.Door){
      const dm = doorMeaning(wid, player.x, player.y);
      if (dm){
        Audio.ui();
        if (wid==="route"){
          player.returnDoor = { x: player.x, y: player.y };
          player.lastTownId = dm.townId || player.lastTownId;
          if (dm.to==="center"){
            const doorX=Math.floor(World.center.w/2);
            warpTo("center", doorX, World.center.h-3);
            say("Pokécenter: Nurse heals HP + PP. Box stores extra monsters.");
            return;
          }
          if (dm.to==="mart"){
            const doorX=Math.floor(World.mart.w/2);
            warpTo("mart", doorX, World.mart.h-3);
            say("Mart: Buy items. (Box terminal is inside.)");
            return;
          }
        } else {
          const spawn = findSpawnNearDoor(player.returnDoor);
          warpTo("route", spawn.x, spawn.y);
          return;
        }
      }
    }

    if (wid==="route" && t===Tile.Grass){
      const biome = biomeAt(World,'route', player.x, player.y);
      const baseP = (biome===Biome.Forest)?0.16:(biome===Biome.Beach)?0.13:(biome===Biome.City)?0.12:0.14;
      const noiseMul=player.lastMoveSprint ? 1.65 : 1.0;
      if (rng.chance(baseP*noiseMul)){
        beginWildEncounter();
        return;
      }
    }

    if (wid==="route"){
      for (const tr of trainers){
        if (tr.defeated) continue;
        if (!tr.autoChallenge) continue;
        if (!partyHasAlive()) continue;
        if (playerInSight(tr)){
          beginTrainerBattle(tr);
          return;
        }
      }
    }
  }

  function startMove(dx,dy){
    if (player.moving) return false;
    const nx=player.x+dx, ny=player.y+dy;
    const t=tileAt(World, player.worldId, nx, ny);
    if (!walkable(t)) return false;
    if (npcAt(player.worldId,nx,ny)) return false;
    player.dir = dx===1?Dir.Right : dx===-1?Dir.Left : dy===1?Dir.Down : Dir.Up;
    player.moving=true; player.moveT=0;
    player.moveFrom={x:player.x,y:player.y};
    player.moveTo={x:nx,y:ny};
    player.lastMoveSprint=input.pressed("Shift");
    return true;
  }
  function updateMove(dt){
    if (!player.moving) return;
    player.moveT += dt*9.5*(player.lastMoveSprint?1.65:1.0);
    const t=clamp(player.moveT,0,1);
    const fx=player.moveFrom.x*TILE, fy=player.moveFrom.y*TILE;
    const tx=player.moveTo.x*TILE, ty=player.moveTo.y*TILE;
    player.px = fx + (tx-fx)*easeOutCubic(t);
    player.py = fy + (ty-fy)*easeOutCubic(t);
    if (player.moveT>=1){
      player.moving=false;
      player.x=player.moveTo.x; player.y=player.moveTo.y;
      player.px=player.x*TILE; player.py=player.y*TILE;
      onStepTile();
    }
  }
  function getHeldDir(){
    if (input.pressed("ArrowUp")||input.pressed("w")) return {dx:0,dy:-1,dir:Dir.Up};
    if (input.pressed("ArrowDown")||input.pressed("s")) return {dx:0,dy:1,dir:Dir.Down};
    if (input.pressed("ArrowLeft")||input.pressed("a")) return {dx:-1,dy:0,dir:Dir.Left};
    if (input.pressed("ArrowRight")||input.pressed("d")) return {dx:1,dy:0,dir:Dir.Right};
    return null;
  }

  // LOS for trainers
  function clearLine(worldId,x0,y0,x1,y1){
    if (x0===x1){
      const step=Math.sign(y1-y0);
      for (let y=y0+step; y!==y1; y+=step){
        if (!walkable(tileAt(World,worldId,x0,y))) return false;
        if (npcAt(worldId,x0,y)) return false;
      }
      return true;
    }
    if (y0===y1){
      const step=Math.sign(x1-x0);
      for (let x=x0+step; x!==x1; x+=step){
        if (!walkable(tileAt(World,worldId,x,y0))) return false;
        if (npcAt(worldId,x,y0)) return false;
      }
      return true;
    }
    return false;
  }
  function playerInSight(tr){
    const dx=player.x-tr.x, dy=player.y-tr.y;
    if (tr.dir===Dir.Left && dy===0 && dx<0 && Math.abs(dx)<=tr.sight) return clearLine("route", tr.x,tr.y, player.x,player.y);
    if (tr.dir===Dir.Right&& dy===0 && dx>0 && Math.abs(dx)<=tr.sight) return clearLine("route", tr.x,tr.y, player.x,player.y);
    if (tr.dir===Dir.Up   && dx===0 && dy<0 && Math.abs(dy)<=tr.sight) return clearLine("route", tr.x,tr.y, player.x,player.y);
    if (tr.dir===Dir.Down && dx===0 && dy>0 && Math.abs(dy)<=tr.sight) return clearLine("route", tr.x,tr.y, player.x,player.y);
    return false;
  }

  // ============================================================
  // Minimal Menu / Box / Shop (kept)
  // ============================================================
  const menu = { open:false, page:0, cursor:0 };
  const dexUI = { cols:3, rows:2, cursor:0, detail:false };
  const boxUI = { open:false, mode:"partyToBox", cursor:0, boxCursor:0 };
  const shopUI = { open:false, cursor:0 };

  function openMenu(){ menu.open=true; menu.page=0; menu.cursor=0; scene=Scene.Menu; Audio.ui(); }
  function closeMenu(){ menu.open=false; scene=Scene.Overworld; Audio.ui(); }
  function openBox(){ boxUI.open=true; boxUI.mode="partyToBox"; boxUI.cursor=0; boxUI.boxCursor=0; scene=Scene.Box; Audio.ui(); }
  function closeBox(){ boxUI.open=false; scene=Scene.Overworld; Audio.ui(); }
  function openShop(){ shopUI.open=true; shopUI.cursor=0; scene=Scene.Shop; Audio.ui(); }
  function closeShop(){ shopUI.open=false; scene=Scene.Overworld; Audio.ui(); }

  function boxPartyToStorage(idx){
    if (player.party.length<=1){ say("You can't store your last party monster."); return; }
    const m=player.party.splice(idx,1)[0];
    player.box.push(m);
    say(`${m.id} was stored in the Box.`);
  }
  function boxStorageToParty(idx){
    if (player.party.length>=3){ say("Your party is full (max 3)."); return; }
    const m=player.box.splice(idx,1)[0];
    player.party.push(m);
    say(`${m.id} joined your party.`);
  }

  function buyItem(stock){
    if (player.money < stock.price){ say("Not enough money.", null, null, {onStart:Audio.miss}); return; }
    player.money -= stock.price;
    player.bag[stock.name] = (player.bag[stock.name]||0) + 1;
    say(`Bought ${stock.name}.`, null, null, {onStart:Audio.blip});
  }

  function useItemOverworld(itemName){
    const lead=leadMon();
    if (!player.bag[itemName] || player.bag[itemName]<=0){ say("You don't have that item.", null, null, {onStart:Audio.miss}); return; }

    if (itemName==="Potion" || itemName==="Super Potion"){
      if (lead.hp>=lead.maxHP){ say(`${lead.id} is already full HP.`); return; }
      player.bag[itemName]--;
      const amt=(itemName==="Potion")?18:35;
      const before=lead.hp;
      lead.hp=clamp(lead.hp+amt,0,lead.maxHP);
      say(`Used ${itemName}. ${lead.id} recovered ${lead.hp-before} HP.`, null, null, {onStart:Audio.blip});
      return;
    }
    if (itemName==="Adrenaline Potion"){
      player.bag[itemName]--;
      useAdrenaline(lead);
      return;
    }
    if (itemName==="Escape Rope"){
      player.bag[itemName]--;
      const tA=routeMeta.towns.find(t=>t.id==="A");
      warpTo("route", tA.x+12, tA.y+14);
      say("You used Escape Rope and returned to Town A.", null, null, {onStart:Audio.ui});
      return;
    }
    say("It can't be used right now.", null, null, {onStart:Audio.miss});
  }

  // Interactions
  function talkTrainer(tr){
    if (tr.defeated){ say(`${tr.name}: You're getting stronger.`); return; }
    if (!partyHasAlive()){ say(`${tr.name}: Heal up before battling.`); return; }
    if (!tr.autoChallenge){
      say(`${tr.name}: Want to challenge me again?`, ["Yes","No"], (pick)=>{
        if (pick==="Yes"){ tr.autoChallenge=true; beginTrainerBattle(tr); }
        else say("Maybe later.");
      });
      return;
    }
    beginTrainerBattle(tr);
  }

  function interactFrontTile(){
    const vdir=dirVec[player.dir];
    const fx=player.x+vdir.x, fy=player.y+vdir.y;
    const npc=npcAt(player.worldId, fx, fy);
    if (npc){
      Audio.ui();
      if (npc.type===NPCType.Heal){
        say(`${npc.name}: Heal your party (HP + PP)?`, ["Yes","No"], (pick)=>{
          if (pick==="Yes"){ healPartyFull(); say("All monsters fully healed!"); }
          else say("Take care.");
        });
        return;
      }
      if (npc.type===NPCType.Box){
        say("Box Terminal: Manage stored monsters.", ["Open Box","Cancel"], (pick)=>{ if (pick==="Open Box") openBox(); });
        return;
      }
      if (npc.type===NPCType.Shop){
        say(`${npc.name}: Welcome!`, ["Shop","Cancel"], (pick)=>{ if (pick==="Shop") openShop(); });
        return;
      }
      if (npc.type===NPCType.Trainer){ talkTrainer(npc); return; }
      if (npc.type===NPCType.Quest){
        say(`${npc.name}: Quests coming soon in this modular build.`);
        return;
      }
    }
    const t=tileAt(World, player.worldId, fx, fy);
    if (t===Tile.Door){ say("Walk onto the door tile to enter/exit."); return; }
  }

  // ============================================================
  // Rendering helpers
  // ============================================================
  function rect(x,y,w,h,r=0){
    if (r<=0){ g.fillRect(x,y,w,h); return; }
    const rr=Math.min(r,w/2,h/2);
    g.beginPath();
    g.moveTo(x+rr,y);
    g.arcTo(x+w,y,x+w,y+h,rr);
    g.arcTo(x+w,y+h,x,y+h,rr);
    g.arcTo(x,y+h,x,y,rr);
    g.arcTo(x,y,x+w,y,rr);
    g.closePath(); g.fill();
  }
  function panel(x,y,w,h){
    g.fillStyle="rgba(18,26,36,0.92)"; rect(x,y,w,h,10);
    g.strokeStyle="rgba(255,255,255,0.10)"; g.lineWidth=1;
    g.strokeRect(x+0.5,y+0.5,w-1,h-1);
  }
  function tinyText(s,x,y,color="#9db0c9"){ g.fillStyle=color; g.font="8px ui-monospace, Menlo, monospace"; g.fillText(s,x,y); }
  function text(s,x,y,color="#e9f1ff"){ g.fillStyle=color; g.font="10px system-ui, sans-serif"; g.fillText(s,x,y); }
  function bigText(s,x,y,color="#e9f1ff"){ g.fillStyle=color; g.font="12px system-ui, sans-serif"; g.fillText(s,x,y); }
  function hpBar(x,y,w,h,cur,max){
    const pct=max<=0?0:clamp(cur/max,0,1);
    g.fillStyle="rgba(255,255,255,0.10)"; rect(x,y,w,h,4);
    g.fillStyle=pct>0.5?"#48ff8a":pct>0.25?"#ffd35b":"#ff5b5b";
    rect(x,y,Math.floor(w*pct),h,4);
    g.strokeStyle="rgba(0,0,0,0.35)"; g.strokeRect(x+0.5,y+0.5,w-1,h-1);
  }
  function drawSpritePerson(px,py,p){
    g.fillStyle=p.body; g.fillRect(px+3,py+4,6,6);
    g.fillStyle=p.head; g.fillRect(px+4,py+1,4,4);
    g.fillStyle=p.accent; g.fillRect(px+3,py+9,2,3);
    g.fillStyle=p.accent; g.fillRect(px+7,py+9,2,3);
    g.fillStyle="rgba(0,0,0,0.35)";
    g.fillRect(px+4,py+3,1,1); g.fillRect(px+7,py+3,1,1);
  }
  function drawMonsterIcon(px,py,mon,sil=false){
    g.fillStyle="rgba(0,0,0,0.35)"; rect(px-1,py-1,18,14,6);
    g.fillStyle=sil?"#000000":typeColor(mon.type); rect(px+1,py+1,14,10,5);
    g.fillStyle="rgba(255,255,255,0.22)"; if (!sil) g.fillRect(px+4,py+3,4,2);
  }
  function drawMonsterBig(x,y,mon,sil=false){
    const c=sil?"#000000":typeColor(mon.type);
    g.fillStyle="rgba(0,0,0,0.35)"; rect(x-22,y-16,52,40,12);
    g.fillStyle=c; rect(x-20,y-14,48,36,12);
    g.fillStyle="rgba(255,255,255,0.22)"; if(!sil) rect(x-12,y-6,14,6,6);
    g.fillStyle="rgba(0,0,0,0.30)"; g.fillRect(x-10,y+2,4,2); g.fillRect(x+6,y+2,4,2);
  }

  function drawTile(worldId,t,x,y){
    const b = (worldId==='route') ? biomeAt(World,'route',x,y) : null;
    const px=x*TILE, py=y*TILE;
    const isInterior=(worldId==="center"||worldId==="mart");
    if (t===Tile.Block){
      if (isInterior){
        g.fillStyle="#0d121a"; g.fillRect(px,py,TILE,TILE);
        g.fillStyle="rgba(255,255,255,0.04)"; if ((x+y)%3===0) g.fillRect(px+2,py+2,3,1);
      } else {
        g.fillStyle="#1a1f27"; g.fillRect(px,py,TILE,TILE);
        g.fillStyle="#232a35"; g.fillRect(px+1,py+1,TILE-2,TILE-2);
        g.fillStyle="rgba(255,255,255,0.04)"; if ((x*7+y*11)%13===0) g.fillRect(px+3,py+3,2,2);
        g.fillStyle="rgba(0,0,0,0.18)"; g.fillRect(px+2,py+TILE-3,4,1);
      }
      return;
    }
    if (t===Tile.Path){
      let p0="#2b2a20", p1="#3a382a";
      if (b===Biome.Beach){ p0="#2d2a1a"; p1="#4a3f23"; }
      else if (b===Biome.City){ p0="#20242a"; p1="#303741"; }
      else if (b===Biome.Forest){ p0="#24261d"; p1="#303427"; }
      g.fillStyle=p0; g.fillRect(px,py,TILE,TILE);
      g.fillStyle=p1; g.fillRect(px+1,py+1,TILE-2,TILE-2);
      g.fillStyle="rgba(255,255,255,0.06)"; g.fillRect(px+2,py+3,TILE-4,1);
      return;
    }
    if (t===Tile.Clearing){
      let c0="#1d3b27", c1="#255233";
      if (b===Biome.Beach){ c0="#264a3d"; c1="#2e5a46"; }
      else if (b===Biome.City){ c0="#24303a"; c1="#2b3a46"; }
      else if (b===Biome.Forest){ c0="#122c1e"; c1="#173b28"; }
      g.fillStyle=c0; g.fillRect(px,py,TILE,TILE);
      g.fillStyle=c1; g.fillRect(px+1,py+1,TILE-2,TILE-2);
      g.fillStyle="rgba(255,255,255,0.05)"; g.fillRect(px,py,TILE,1);
      return;
    }
    if (t===Tile.Grass){
      let g0="#0f2b1a", g1="#173b24", blades="rgba(170,255,200,0.18)";
      if (b===Biome.Beach){ g0="#2b2415"; g1="#3a2f18"; blades="rgba(255,230,160,0.22)"; }
      else if (b===Biome.City){ g0="#1a1f25"; g1="#222a33"; blades="rgba(210,230,255,0.16)"; }
      else if (b===Biome.Forest){ g0="#071f14"; g1="#0b2a1b"; blades="rgba(140,255,210,0.14)"; }
      g.fillStyle=g0; g.fillRect(px,py,TILE,TILE);
      g.fillStyle=g1; g.fillRect(px+1,py+1,TILE-2,TILE-2);
      g.fillStyle=blades;
      for (let i=0;i<7;i++){
        const bx=px+rng.randi(1,14), by=py+rng.randi(3,14);
        g.fillRect(bx,by,1,rng.randi(1,4));
      }
      return;
    }
    if (t===Tile.Door){
      if (isInterior){
        g.fillStyle="#151f2b"; g.fillRect(px,py,TILE,TILE);
        g.fillStyle="#caa86c"; g.fillRect(px+5,py+3,6,10);
        g.fillStyle="rgba(0,0,0,0.25)"; g.fillRect(px+6,py+5,2,2);
      } else {
        g.fillStyle="#255233"; g.fillRect(px,py,TILE,TILE);
        g.fillStyle="#caa86c"; g.fillRect(px+5,py+3,6,10);
        g.fillStyle="rgba(0,0,0,0.25)"; g.fillRect(px+6,py+5,2,2);
      }
      return;
    }
    if (t===Tile.Interior){
      g.fillStyle="#151f2b"; g.fillRect(px,py,TILE,TILE);
      g.fillStyle="rgba(255,255,255,0.03)"; g.fillRect(px,py,TILE,1);
    }
  }

  function drawBuilding(b){
    const px=b.x*TILE, py=b.y*TILE;
    const w=b.w*TILE, h=b.h*TILE;
    g.fillStyle="rgba(0,0,0,0.25)";
    rect(px+2,py+2,w,h,10);
    g.fillStyle = b.kind==="center" ? "#2a3a58" : "#223a2f";
    rect(px,py,w,h,10);
    g.fillStyle="rgba(255,255,255,0.10)";
    rect(px+2,py+2,w-4,6,8);
    g.fillStyle="rgba(0,0,0,0.35)";
    rect(px+10,py+10,w-20,10,6);
    tinyText(b.kind==="center" ? "CENTER" : "MART", px+14, py+18, "#e9f1ff");
    const dx=b.door.x*TILE, dy=b.door.y*TILE;
    g.fillStyle="rgba(202,168,108,0.85)";
    rect(dx+4, dy+2, 8, 12, 6);
    g.fillStyle="rgba(0,0,0,0.25)";
    g.fillRect(dx+7, dy+7, 2, 2);
  }

  // Camera
  const camera={x:0,y:0};
  function updateCamera(){
    const W=World[player.worldId];
    const worldPxW=W.w*TILE, worldPxH=W.h*TILE;
    camera.x = clamp(Math.floor(player.px - VW/2 + TILE/2), 0, Math.max(0, worldPxW - VW));
    camera.y = clamp(Math.floor(player.py - VH/2 + TILE/2), 0, Math.max(0, worldPxH - VH));
  }

  function drawMessageBox(){
    if (!ui.activeMsg) return;
    const boxH=48;
    const x=6, y=VH-boxH-6, w=VW-12, h=boxH;
    panel(x,y,w,h);
    const full=ui.activeMsg.text;
    const shown=full.slice(0, Math.floor(ui.msgReveal));
    const words=shown.split(" ");
    const lines=[]; let line="";
    for (const w0 of words){
      if ((line+w0).length>38){ lines.push(line.trimEnd()); line=w0+" "; }
      else line += w0+" ";
    }
    if (line.trim()) lines.push(line.trimEnd());
    let ly=y+16;
    for (let i=0;i<Math.min(lines.length,2);i++){ text(lines[i], x+12, ly); ly+=12; }

    if (ui.msgReveal>=full.length && ui.choices && ui.choices.length){
      for (let i=0;i<ui.choices.length;i++){
        const sel=ui.choiceIndex===i;
        const cy=y+16+i*12;
        text(`${sel?"▶ ":"  "}${ui.choices[i]}`, x+182, cy, sel?"#e9f1ff":"#9db0c9");
      }
    } else {
      tinyText(ui.msgReveal>=full.length ? "Z/Enter" : "Space", x+w-56, y+h-10, "#9db0c9");
    }
  }

  // Battle UI (kept)
  function drawStatusPanel(x,y,mon,isPlayer=false){
    panel(x,y,148,44);
    bigText(`${mon.id}`, x+10, y+14);
    tinyText(`Lv${mon.level} · ${mon.type}`, x+10, y+24);
    hpBar(x+10, y+28, 104, 7, mon.hp, mon.maxHP);
    tinyText(`${mon.hp}/${mon.maxHP}`, x+118, y+35, "#9db0c9");
    if (isPlayer){
      tinyText(`EXP ${mon.exp}/${mon.expNext}`, x+10, y+41, "#9db0c9");
      drawMonsterIcon(x+126, y+8, mon, false);
    }
  }
  function battleOffsets(isPlayer){
    const a=battle.anim;
    let x=0,y=0;
    const atkT=isPlayer?a.playerAtk:a.enemyAtk;
    const hitT=isPlayer?a.playerHit:a.enemyHit;
    const dodgeT=isPlayer?a.playerDodge:a.enemyDodge;
    if (atkT>0){ const t=1-(atkT/0.18); const kick=Math.sin(t*Math.PI)*6; x += isPlayer?kick:-kick; y -= Math.sin(t*Math.PI)*2; }
    if (hitT>0){ const t=1-(hitT/0.22); const sh=Math.sin(t*20)*2.0; x+=sh; y+=Math.sin(t*14)*1.0; }
    if (dodgeT>0){ const t=1-(dodgeT/0.20); const d=Math.sin(t*Math.PI)*4; x += (isPlayer?-1:1)*d; }
    return {x,y};
  }
  function drawPartyBalls(x,y,mons){
    const r=3;
    for (let i=0;i<mons.length;i++){
      const alive=mons[i].hp>0;
      g.fillStyle=alive?"#ff6b6b":"rgba(255,255,255,0.16)";
      rect(x+i*(r*2+3), y, r*2, r*2, 6);
      g.fillStyle="rgba(0,0,0,0.25)";
      g.fillRect(x+i*(r*2+3), y+r, r*2, 1);
    }
  }
  function drawMoveEffects(){
    const enemyBase={x:236,y:42};
    const playerBase={x:72,y:104};
    const eo=battleOffsets(false);
    const po=battleOffsets(true);
    const enemyPos={x:enemyBase.x+eo.x, y:enemyBase.y+eo.y};
    const playerPos={x:playerBase.x+po.x, y:playerBase.y+po.y};

    for (const e of battle.effects){
      const t=e.t/e.dur;
      const col=typeColor(e.type);
      const isEnemy=(e.who==="enemy");
      const pos=isEnemy?enemyPos:playerPos;
      if (e.kind==="cast"){
        g.fillStyle=col;
        for (let k=0;k<6;k++){
          const a=(k/6)*Math.PI*2 + t*6.0;
          const rad=10 + Math.sin(t*Math.PI)*6;
          const px=pos.x + Math.cos(a)*rad;
          const py=pos.y + Math.sin(a)*rad*0.6;
          g.fillRect(px,py,2,2);
        }
      } else if (e.kind==="hit"){
        g.fillStyle=col;
        const burst=10+t*10;
        for (let k=0;k<8;k++){
          const a=(k/8)*Math.PI*2;
          const px=pos.x + Math.cos(a)*burst;
          const py=pos.y + Math.sin(a)*burst*0.7;
          g.fillRect(px,py,2,2);
        }
        g.fillStyle="rgba(255,255,255,0.10)";
        rect(pos.x-14,pos.y-10,28,18,10);
      } else if (e.kind==="buff"){
        g.fillStyle=col;
        const rise=(1-t)*10;
        for (let k=0;k<4;k++){
          const ox=(-10+k*7), oy=-8-rise;
          g.fillRect(pos.x+ox, pos.y+oy, 2, 6);
          g.fillRect(pos.x+ox-1, pos.y+oy, 4, 2);
        }
        g.fillStyle="rgba(255,255,255,0.18)";
        tinyText(`+${(e.stat||"stat").toUpperCase()}`, pos.x-16, pos.y-20, "#e9f1ff");
      }
    }
  }
  function drawBattleCommands(){
    const msgH=48, msgY=VH-msgH-6;
    const cmdH=56, cmdY=msgY-cmdH-6;
    panel(6,cmdY,308,cmdH);
    const root=["Fight","Bag","Catch","Run"];

    if (battle.menu==="root"){
      bigText("Choose an action", 14, cmdY+14, "#9db0c9");
      for (let i=0;i<4;i++){
        const ox=16+(i%2)*150;
        const oy=cmdY+30+Math.floor(i/2)*14;
        const sel=battle.cursor===i;
        text(`${sel?"▶ ":"  "}${root[i]}`, ox, oy, sel?"#e9f1ff":"#9db0c9");
      }
      return;
    }
    if (battle.menu==="items"){
      bigText("Bag", 14, cmdY+14, "#9db0c9");
      const items=Object.keys(player.bag).filter(k=>player.bag[k]>0).slice(0,6);
      if (!items.length){ text("Your bag is empty.", 16, cmdY+32, "#9db0c9"); }
      else{
        for (let i=0;i<items.length;i++){
          const k=items[i], sel=battle.cursor===i;
          text(`${sel?"▶ ":"  "}${k} x${player.bag[k]}`, 16, cmdY+30+i*10, sel?"#e9f1ff":"#9db0c9");
        }
      }
      tinyText("X/Esc: back", 240, cmdY+50, "#9db0c9");
      return;
    }
    if (battle.menu==="moves"){
      bigText("Fight", 14, cmdY+14, "#9db0c9");
      const m=battle.playerMon;
      for (let i=0;i<m.moves.length;i++){
        const mv=m.moves[i];
        const sel=battle.cursor===i;
        text(`${sel?"▶ ":"  "}${mv.id} (${mv.type}) PP ${mv.curPP}/${mv.pp}`, 16, cmdY+30+i*10, sel?"#e9f1ff":"#9db0c9");
      }
      tinyText("X/Esc: back", 240, cmdY+50, "#9db0c9");
    }
  }

  function drawBattle(){
    g.fillStyle="#0b0f14"; g.fillRect(0,0,VW,VH);
    g.fillStyle="#0f1620"; rect(0,92,VW,88,0);
    g.fillStyle="rgba(77,211,255,0.08)"; rect(0,92,VW,2,0);

    let shakeX=0, shakeY=0;
    if (ui.fx.shakeT>0){
      const mag=ui.fx.shakeMag*(ui.fx.shakeT/0.12);
      shakeX=(rng.rand()*2-1)*mag; shakeY=(rng.rand()*2-1)*mag;
    }
    g.save(); g.translate(shakeX,shakeY);

    g.fillStyle="rgba(255,255,255,0.07)"; rect(192,48,104,42,14);
    g.fillStyle="rgba(255,255,255,0.06)"; rect(18,104,130,50,16);

    if (battle.enemyMon){ const o=battleOffsets(false); drawMonsterBig(236+o.x,42+o.y,battle.enemyMon,false); }
    if (battle.playerMon){ const o=battleOffsets(true); drawMonsterBig(72+o.x,104+o.y,battle.playerMon,false); }

    drawMoveEffects();

    if (battle.enemyMon) drawStatusPanel(166,6,battle.enemyMon,false);
    if (battle.playerMon) drawStatusPanel(6,64,battle.playerMon,true);

    const enemyList=battle.wild ? [battle.enemyMon] : (battle.enemyTrainer?.party || [battle.enemyMon]);
    drawPartyBalls(10,6,player.party);
    drawPartyBalls(240,6,enemyList);

    g.restore();

    if (!ui.activeMsg) drawBattleCommands();
    drawMessageBox();
  }

  // Evolution render
  function drawEvolution(){
    g.fillStyle="#0b0f14"; g.fillRect(0,0,VW,VH);
    g.fillStyle="rgba(77,211,255,0.06)"; rect(0,0,VW,VH,0);
    const from=makeMon(evo.fromId,1,rng.randi);
    const to=makeMon(evo.toId,1,rng.randi);
    const flicker=(Math.sin(evo.t*18)>0);
    const showTo=evo.phase>=1?flicker:false;
    const glow=Math.min(1,evo.t/1.2);
    g.fillStyle=`rgba(77,211,255,${0.12*glow})`;
    rect(60,30,200,120,22);
    const x=160,y=92;
    if (evo.phase===0) drawMonsterBig(x,y,from,false);
    else if (evo.phase===1){
      drawMonsterBig(x,y,showTo?to:from,false);
      if (flicker){ g.fillStyle="rgba(255,255,255,0.12)"; rect(x-26,y-20,56,44,12); }
    } else drawMonsterBig(x,y,to,false);
    bigText("Evolving...", 124, 22, "#e9f1ff");
    tinyText("Press Space to speed up", 112, 170, "#9db0c9");
  }

  // Overworld render
  function drawOverworld(){
    updateCamera();
    const wid=player.worldId;
    const W=World[wid];
    g.fillStyle="#0b0f14"; g.fillRect(0,0,VW,VH);

    const tx0=Math.floor(camera.x/TILE);
    const ty0=Math.floor(camera.y/TILE);
    const tx1=Math.ceil((camera.x+VW)/TILE);
    const ty1=Math.ceil((camera.y+VH)/TILE);

    g.save(); g.translate(-camera.x,-camera.y);

    for (let y=ty0;y<ty1;y++){
      for (let x=tx0;x<tx1;x++){
        drawTile(wid, tileAt(World,wid,x,y), x,y);
      }
    }

    if (wid==="route"){
      for (const b of routeMeta.buildings) drawBuilding(b);
    }

    for (const n of npcListForWorld(wid)){
      const px=n.x*TILE, py=n.y*TILE;
      if (n.type===NPCType.Heal){
        drawSpritePerson(px+2,py+2,{head:"#ffd7c2",body:"#3a2a58",accent:"#ff6b6b"});
      } else if (n.type===NPCType.Box){
        g.fillStyle="rgba(0,0,0,0.35)"; rect(px+2,py+2,12,12,4);
        g.fillStyle="#4dd3ff"; rect(px+3,py+3,10,10,4);
        g.fillStyle="rgba(255,255,255,0.22)"; g.fillRect(px+5,py+5,6,2);
      } else if (n.type===NPCType.Shop){
        drawSpritePerson(px+2,py+2,{head:"#ffd7c2",body:"#223a58",accent:"#48ff8a"});
      } else if (n.type===NPCType.Quest){
        drawSpritePerson(px+2,py+2,{head:"#ffd7c2",body:"#5a3a22",accent:"#ffd35b"});
      } else {
        drawSpritePerson(px+2,py+2,{head:"#ffd7c2",body:"#223a58",accent:"#4dd3ff"});
        if (wid==="route" && !n.defeated && n.autoChallenge && partyHasAlive()){
          g.fillStyle="rgba(77,211,255,0.06)";
          const vv=dirVec[n.dir];
          for (let i=1;i<=n.sight;i++){
            const sx=n.x+vv.x*i, sy=n.y+vv.y*i;
            if (!walkable(tileAt(World,"route",sx,sy))) break;
            if (npcAt("route",sx,sy)) break;
            g.fillRect(sx*TILE, sy*TILE, TILE, TILE);
          }
        }
      }
    }

    drawSpritePerson(player.px+2, player.py+2, {head:"#ffd7c2",body:"#2b5a40",accent:"#ffd35b"});
    g.restore();

    // HUD
    panel(6,6,308,26);
    tinyText(`€${player.money}`, 14, 22, "#e9f1ff");
    tinyText(`Badges: ${Array.from(player.badges).join(", ")||"—"}`, 250, 22, "#9db0c9");
    const pm=leadMon();
    if (pm){
      tinyText(`${pm.id} Lv${pm.level}`, 62, 16, "#e9f1ff");
      hpBar(62, 19, 100, 6, pm.hp, pm.maxHP);
      tinyText(`EXP ${pm.exp}/${pm.expNext}`, 170, 22, "#9db0c9");
    }

    let loc = (player.worldId==="route") ? "Route" : (player.worldId==="center" ? "Pokécenter" : "Mart");
    if (player.worldId==="route"){
      const t=insideTown(routeMeta, player.x,player.y);
      if (t) loc = t.name;
    }
    tinyText(loc, 268, 14, "#9db0c9");

    if (input.pressed("Shift") && scene===Scene.Overworld) tinyText("SPRINT", 268, 26, "#ffd35b");
    drawMessageBox();
  }

  // Menu render (kept simple)
  function drawMenu(){
    drawOverworld();
    g.fillStyle="rgba(0,0,0,0.35)"; g.fillRect(0,0,VW,VH);
    panel(14,12,292,156);
    bigText("Menu", 24, 28);

    const pages=["Party","Bag","Dex"];
    for (let i=0;i<pages.length;i++){
      const sel=menu.page===i;
      g.fillStyle=sel?"rgba(77,211,255,0.20)":"rgba(255,255,255,0.06)";
      rect(24+i*70,34,64,16,8);
      tinyText(pages[i], 34+i*70, 46, sel?"#e9f1ff":"#9db0c9");
    }

    if (menu.page===0){
      bigText("Your Party", 24, 62, "#9db0c9");
      for (let i=0;i<player.party.length;i++){
        const m=player.party[i], sel=menu.cursor===i;
        g.fillStyle=sel?"rgba(77,211,255,0.16)":"rgba(255,255,255,0.05)";
        rect(24,70+i*28,272,24,10);
        drawMonsterIcon(30,74+i*28,m,false);
        text(`${sel?"▶ ":"  "}${m.id} Lv${m.level}`, 54, 84+i*28, sel?"#e9f1ff":"#9db0c9");
        hpBar(176,78+i*28,112,6,m.hp,m.maxHP);
      }
      tinyText("Z/Enter: make lead · X/Esc: close", 92, 162, "#9db0c9");
    }

    if (menu.page===1){
      bigText("Bag", 24, 62, "#9db0c9");
      const items=Object.keys(player.bag).filter(k=>player.bag[k]>0);
      const view=items.slice(0,10);
      if (!view.length) text("Your bag is empty.", 30, 86, "#9db0c9");
      for (let i=0;i<view.length;i++){
        const k=view[i], sel=menu.cursor===i;
        text(`${sel?"▶ ":"  "}${k} x${player.bag[k]}`, 30, 78+i*10, sel?"#e9f1ff":"#9db0c9");
      }
      tinyText("Z/Enter: use selected · X/Esc: close", 94, 162, "#9db0c9");
    }

    if (menu.page===2){
      bigText("Dex", 24, 62, "#9db0c9");
      const dexList=MON_DB.slice(0,6).map(m=>m.id);
      const maxIndex=dexList.length-1;
      const cols=dexUI.cols;
      const cellW=92, cellH=36;

      for (let i=0;i<dexList.length;i++){
        const id=dexList[i];
        const caught=player.dexCaught.has(id);
        const seen=player.dexSeen.has(id);
        const r=Math.floor(i/cols), c=i%cols;
        const x=24+c*cellW, y=72+r*cellH;
        const sel=(!dexUI.detail && dexUI.cursor===i);
        g.fillStyle=sel?"rgba(77,211,255,0.18)":"rgba(255,255,255,0.05)";
        rect(x,y,86,30,10);

        const mon=makeMon(id,1,rng.randi);
        drawMonsterIcon(x+6,y+8,mon,!caught);
        const name=caught?id:(seen?"??????":"??????");
        text(name, x+28, y+18, caught?"#e9f1ff":"#9db0c9");
        tinyText(caught?"CAUGHT":(seen?"SEEN":"UNKNOWN"), x+28, y+28, caught?"#48ff8a":"#9db0c9");
      }

      tinyText("Arrows: move · Z: details · X: close", 86, 162, "#9db0c9");

      if (dexUI.detail){
        const id=dexList[dexUI.cursor];
        const caught=player.dexCaught.has(id);
        const seen=player.dexSeen.has(id);
        panel(24,56,272,96);
        bigText(seen?id:"??????", 36, 74);
        const db=monById.get(id);
        tinyText(seen?`Type: ${db.type}`:"Type: ???", 36, 88, "#9db0c9");
        const desc=caught?(MON_DESC[id]||""):(seen?"Seen it, but not caught yet.":"You haven't seen this monster.");
        text(desc, 36, 104, "#e9f1ff");
        tinyText("X/Esc: back", 220, 146, "#9db0c9");
        const mon=makeMon(id,1,rng.randi);
        drawMonsterBig(252,112,mon,!caught);
      }
    }
  }

  function drawBoxUI(){
    drawOverworld();
    g.fillStyle="rgba(0,0,0,0.45)"; g.fillRect(0,0,VW,VH);
    panel(10,10,300,160);
    bigText("Box Storage", 20, 28);
    tinyText("Left: Party | Right: Box | Z: move | X: close | Tab: switch", 20, 42, "#9db0c9");

    bigText("Party", 22, 60, "#9db0c9");
    for (let i=0;i<player.party.length;i++){
      const m=player.party[i];
      const sel=(boxUI.mode==="partyToBox" && boxUI.cursor===i);
      g.fillStyle=sel?"rgba(77,211,255,0.18)":"rgba(255,255,255,0.06)";
      rect(20,68+i*22,136,18,8);
      drawMonsterIcon(24,71+i*22,m,false);
      tinyText(`${m.id} Lv${m.level}`, 44, 81+i*22, sel?"#e9f1ff":"#9db0c9");
    }

    bigText(`Box (${player.box.length})`, 172, 60, "#9db0c9");
    const start=clamp(boxUI.boxCursor-3, 0, Math.max(0, player.box.length-5));
    const view=player.box.slice(start,start+5);
    for (let i=0;i<view.length;i++){
      const m=view[i];
      const abs=start+i;
      const sel=(boxUI.mode==="boxToParty" && boxUI.boxCursor===abs);
      g.fillStyle=sel?"rgba(77,211,255,0.18)":"rgba(255,255,255,0.06)";
      rect(170,68+i*22,136,18,8);
      drawMonsterIcon(174,71+i*22,m,false);
      tinyText(`${m.id} Lv${m.level}`, 194, 81+i*22, sel?"#e9f1ff":"#9db0c9");
    }
    if (!player.box.length) tinyText("Box is empty.", 182, 84, "#9db0c9");
  }

  function drawShopUI(){
    drawOverworld();
    g.fillStyle="rgba(0,0,0,0.45)"; g.fillRect(0,0,VW,VH);
    panel(18,16,284,148);
    bigText("Mart", 28, 34);
    tinyText(`Money: €${player.money}`, 212, 34, "#e9f1ff");
    bigText("Buy", 28, 58, "#9db0c9");
    const list=SHOP_STOCK.concat([{name:"Leave",price:0}]);
    for (let i=0;i<list.length;i++){
      const s=list[i];
      const sel=shopUI.cursor===i;
      const line=s.name==="Leave"?"Leave":`${s.name}  €${s.price}`;
      text(`${sel?"▶ ":"  "}${line}`, 30, 74+i*12, sel?"#e9f1ff":"#9db0c9");
    }
    tinyText("Z/Enter: buy/select · X/Esc: close", 66, 156, "#9db0c9");
  }

  
  function drawStarter(){
    g.fillStyle="#0b0f14"; g.fillRect(0,0,VW,VH);
    panel(20,18,280,144);
    bigText("Choose your starter", 84, 40, "#e9f1ff");
    tinyText("Left/Right to choose · Z/Enter to pick", 70, 56, "#9db0c9");

    for (let i=0;i<STARTERS.length;i++){
      const id=STARTERS[i];
      const sel=starterUI.cursor===i;
      const x=44 + i*90;
      const y=78;
      g.fillStyle=sel?"rgba(77,211,255,0.18)":"rgba(255,255,255,0.06)";
      rect(x-18,y-26,72,66,14);
      const mon = makeMon(id, 5, rng.randi);
      drawMonsterBig(x+18,y+6, mon, false);
      text(`${sel?"▶ ":"  "}${id}`, x-6, y+38, sel?"#e9f1ff":"#9db0c9");
      tinyText(mon.type, x+18, y+48, "#9db0c9");
    }
    if (ui.activeMsg) drawMessageBox();
  }

    function drawAnimatedBackground(){
    title.t += 1/60;
    for (const p of title.bg){
      p.x += p.vx*(1/60); p.y += p.vy*(1/60);
      if (p.x<-10) p.x=VW+10; if (p.x>VW+10) p.x=-10;
      if (p.y<-10) p.y=VH+10; if (p.y>VH+10) p.y=-10;
    }
    g.fillStyle="#0b0f14"; g.fillRect(0,0,VW,VH);
    const s=0.5+0.5*Math.sin(title.t*0.7);
    g.fillStyle=`rgba(77,211,255,${0.05+0.03*s})`; rect(-40,20,VW+80,40,30);
    g.fillStyle=`rgba(176,140,255,${0.04+0.02*(1-s)})`; rect(-30,110,VW+60,46,30);
    for (const p of title.bg){ g.fillStyle=`rgba(255,255,255,${p.a})`; g.fillRect(p.x,p.y,p.r,p.r); }
  }

  function drawTitle(){
    drawAnimatedBackground();
    panel(8,8,172,34);
    bigText("Grid Monster RPG", 16, 28, "#e9f1ff");
    tinyText("tap play to start", 16, 40, "#9db0c9");

    const {play, toggle} = getTitleRects();
    title.btnPlay = play;
    title.btnToggle = toggle;

    g.fillStyle="rgba(77,211,255,0.20)"; rect(play.x,play.y,play.w,play.h,14);
    g.fillStyle="rgba(255,255,255,0.10)"; rect(play.x+2,play.y+2,play.w-4,play.h-4,12);
    bigText("▶ Play", play.x+18, play.y+22, "#e9f1ff");

    g.fillStyle="rgba(255,255,255,0.08)"; rect(toggle.x, toggle.y, toggle.w, toggle.h, 12);
    const val=settings.showMobileControls?"ON":"OFF";
    text(`Mobile controls: ${val}`, toggle.x+14, toggle.y+20, "#e9f1ff");
    tinyText("tap to toggle", toggle.x+14, toggle.y+30, "#9db0c9");

    panel(186,14,126,150);
    tinyText("Monsters", 198, 30, "#9db0c9");
    const list=MON_DB.map(m=>m.id);
    title.carousel += 1/120;
    const i=Math.floor(title.carousel)%list.length;
    const j=(i+1)%list.length;
    const t=title.carousel-Math.floor(title.carousel);
    const mA=makeMon(list[i],5,rng.randi);
    const mB=makeMon(list[j],5,rng.randi);
    const bob=Math.sin(title.t*2.0)*2;
    g.globalAlpha=1-t; drawMonsterBig(250,78+bob,mA,false);
    g.globalAlpha=t;   drawMonsterBig(250,78+bob,mB,false);
    g.globalAlpha=1;
    tinyText(list[i], 204, 150, "#e9f1ff");
    tinyText(isTouchDevice?"Touch controls available":"Keyboard: WASD + Z/X", 16, 168, "#9db0c9");
  }

  function drawMobileControls(){
    if (!settings.showMobileControls) return;

    const M = uiRect("mobile_ctrl");
    title.btnInGameToggle = M;
    g.fillStyle="rgba(255,255,255,0.08)"; rect(M.x,M.y,M.w,M.h,12);
    tinyText("CTRL", M.x+10, M.y+18, "#e9f1ff");

    const padR = uiRect("mobile_pad");
    const pad={cx:padR.x+padR.w/2, cy:padR.y+padR.h/2, r:Math.min(padR.w,padR.h)/2};
    g.fillStyle="rgba(255,255,255,0.06)";
    rect(pad.cx-pad.r,pad.cy-pad.r,pad.r*2,pad.r*2,20);

    const btn=(r,label)=>{
      g.fillStyle="rgba(255,255,255,0.08)"; rect(r.x,r.y,r.w,r.h,14);
      g.fillStyle="rgba(255,255,255,0.10)"; rect(r.x+2,r.y+2,r.w-4,r.h-4,12);
      tinyText(label, r.x+10, r.y+18, "#e9f1ff");
    };
    btn(uiRect("mobile_a"), "Z");
    btn(uiRect("mobile_b"), "X");
    btn(uiRect("mobile_spr"), "SPR");
  }

  function applyTouchControls(){
    vRelease("ArrowUp"); vRelease("ArrowDown"); vRelease("ArrowLeft"); vRelease("ArrowRight");
    vRelease("w"); vRelease("a"); vRelease("s"); vRelease("d");
    vRelease("Shift"); vRelease("z"); vRelease("Enter"); vRelease("x"); vRelease("Escape");

    // consume in-game toggle taps
    if (settings.showMobileControls && title.btnInGameToggle){
      for (let i=uiTapQueue.length-1;i>=0;i--){
        const tap=uiTapQueue[i];
        if (hitRect(tap.vx,tap.vy,title.btnInGameToggle)){
          uiTapQueue.splice(i,1);
          setShowMobileControls(!settings.showMobileControls);
          break;
        }
      }
    }

    if (!settings.showMobileControls) return;

    const padR = uiRect("mobile_pad");
    const pad={cx:padR.x+padR.w/2, cy:padR.y+padR.h/2, r:Math.min(padR.w,padR.h)/2};
    const A = uiRect("mobile_a");
    const B = uiRect("mobile_b");
    const S = uiRect("mobile_spr");

    for (const t of touches.values()){
      const px=t.vx, py=t.vy;
      const dx=px-pad.cx, dy=py-pad.cy;
      const dist=Math.hypot(dx,dy);
      if (dist < pad.r){
        if (Math.abs(dx)>Math.abs(dy)){
          if (dx<-6){ vPress("ArrowLeft"); vPress("a"); }
          if (dx>6){ vPress("ArrowRight"); vPress("d"); }
        } else {
          if (dy<-6){ vPress("ArrowUp"); vPress("w"); }
          if (dy>6){ vPress("ArrowDown"); vPress("s"); }
        }
        continue;
      }
      if (hitRect(px,py,A)){ vPress("z"); vPress("Enter"); continue; }
      if (hitRect(px,py,B)){ vPress("x"); vPress("Escape"); continue; }
      if (hitRect(px,py,S)){ vPress("Shift"); continue; }
    }
  }

  function drawUIEditorOverlay(){
    if (!uiEdit.on) return;
    g.fillStyle="rgba(0,0,0,0.35)";
    g.fillRect(0,0,VW,VH);
    panel(10,10,300,44);
    bigText("UI Editor (F2 to toggle)", 20, 28, "#e9f1ff");
    tinyText("Tap a box to select, drag to move. R resets.", 20, 40, "#9db0c9");

    const keys=["title_play","title_toggle","mobile_ctrl","mobile_pad","mobile_a","mobile_b","mobile_spr"];
    for (const k of keys){
      const r=uiRect(k);
      g.strokeStyle=(uiEdit.key===k)?"rgba(77,211,255,0.95)":"rgba(255,255,255,0.28)";
      g.lineWidth=(uiEdit.key===k)?2:1;
      g.strokeRect(r.x+0.5,r.y+0.5,r.w-1,r.h-1);
      g.fillStyle="rgba(0,0,0,0.55)";
      rect(r.x, r.y-10, Math.min(96, r.w), 10, 6);
      tinyText(k.replace("mobile_","m_").replace("title_","t_"), r.x+4, r.y-2, "#e9f1ff");
    }
  }

function render(){
    g.clearRect(0,0,VW,VH);
    if (scene===Scene.Title) drawTitle();
    else if (scene===Scene.Starter) drawStarter();
    else if (scene===Scene.Overworld) drawOverworld();
    else if (scene===Scene.Battle) drawBattle();
    else if (scene===Scene.Menu) drawMenu();
    else if (scene===Scene.Box) drawBoxUI();
    else if (scene===Scene.Shop) drawShopUI();
    else if (scene===Scene.Evo) drawEvolution();

    if (scene!==Scene.Title) drawMobileControls();
    drawUIEditorOverlay();

    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.imageSmoothingEnabled=false;
    ctx.drawImage(v,0,0,canvas.width,canvas.height);
  }

  // BGM mode selection
  function updateBGM(){
    if (!audioUnlocked) return;
    if (scene===Scene.Battle) { Audio.BGM.setMode('battle'); return; }
    if (scene===Scene.Title || scene===Scene.Starter) { Audio.BGM.setMode('town'); return; }
    if (player.worldId!=="route") { Audio.BGM.setMode("town"); return; }
    const t=insideTown(routeMeta, player.x,player.y);
    Audio.BGM.setMode(t ? "town" : "route");
  }

  // ============================================================
  // Update loop
  // ============================================================
  function update(dt){
    applyTouchControls();
    if (input.tapped('F2')) toggleUIEditor();
    if (uiEdit.on && input.tapped('r')) resetLayout();

    if (!ui.activeMsg && ui.msgQueue.length) startNextMessage();
    const uiBlocking = !!ui.activeMsg;
    if (ui.fx.shakeT>0) ui.fx.shakeT = Math.max(0, ui.fx.shakeT - dt);

    if (ui.activeMsg){
      const fast=input.pressed("Space");
      ui.msgReveal = Math.min(ui.activeMsg.text.length, ui.msgReveal + dt*(fast?70:40));
      if (ui.msgReveal>=ui.activeMsg.text.length && ui.choices && ui.choices.length){
        if (input.tapped("ArrowUp")||input.tapped("w")){ ui.choiceIndex=(ui.choiceIndex-1+ui.choices.length)%ui.choices.length; Audio.ui(); }
        if (input.tapped("ArrowDown")||input.tapped("s")){ ui.choiceIndex=(ui.choiceIndex+1)%ui.choices.length; Audio.ui(); }
      }
      if (input.tapped("Enter")||input.tapped("z")){
        Audio.ui();
        advanceMessage();
        if (!ui.activeMsg && ui.msgQueue.length===0) flushDeferred();
      }
    } else {
      if (deferred.length) flushDeferred();
    }

    if (scene===Scene.Evo){
      evo.t += dt*(input.pressed("Space")?1.8:1.0);
      if (evo.t>1.0 && evo.phase===0) evo.phase=1;
      if (evo.t>2.3 && evo.phase===1) evo.phase=2;
      if (evo.t>2.8){
        finishEvolution();
        if (battle.evoQueue.length){
          const next=battle.evoQueue.shift();
          startEvolutionScene(next.mon,next.into);
        }
      }
      updateBGM();
      return;
    }

    if (scene===Scene.Title){
  updateBGM();
  if (input.tapped("Enter") || input.tapped("z")){
    Audio.ui(); scene=Scene.Starter; return;
  }
  while (uiTapQueue.length){
    const tap=uiTapQueue.shift();
    if (hitRect(tap.vx,tap.vy,title.btnPlay)){ Audio.ui(); scene=Scene.Starter; return; }
    if (hitRect(tap.vx,tap.vy,title.btnToggle)){ Audio.ui(); setShowMobileControls(!settings.showMobileControls); return; }
  }
  return;
}

if (uiEdit.on){
  // select/drag
  while (uiTapQueue.length){
    const tap=uiTapQueue.shift();
    const keys=["title_play","title_toggle","mobile_ctrl","mobile_pad","mobile_a","mobile_b","mobile_spr"];
    for (const k of keys){
      const r=uiRect(k);
      if (hitRect(tap.vx,tap.vy,r)){
        uiEdit.key=k; uiEdit.dragging=true;
        uiEdit.dx=tap.vx - r.x; uiEdit.dy=tap.vy - r.y;
        break;
      }
    }
  }
  if (uiEdit.dragging && uiEdit.key){
    const first = touches.values().next().value;
    if (first){
      const r=uiRect(uiEdit.key);
      const nx=Math.max(0,Math.min(VW-r.w, first.vx-uiEdit.dx));
      const ny=Math.max(0,Math.min(VH-r.h, first.vy-uiEdit.dy));
      setRect(uiEdit.key, {x:nx,y:ny,w:r.w,h:r.h});
    } else {
      uiEdit.dragging=false;
    }
  }
  updateBGM();
  return;
}

if (scene===Scene.Starter){

      updateBGM();
      if (uiBlocking) return;
      if (input.tapped("ArrowLeft")||input.tapped("a")){ starterUI.cursor=(starterUI.cursor+STARTERS.length-1)%STARTERS.length; Audio.ui(); }
      if (input.tapped("ArrowRight")||input.tapped("d")){ starterUI.cursor=(starterUI.cursor+1)%STARTERS.length; Audio.ui(); }
      if (input.tapped("Enter")||input.tapped("z")){ Audio.ui(); setStarter(STARTERS[starterUI.cursor]); }
      return;
    }

    if (scene===Scene.Overworld){
      updateBGM();
      if (!uiBlocking){
        if (input.tapped("Escape")||input.tapped("x")){ openMenu(); return; }
        if (input.tapped("Enter")||input.tapped("z")){ interactFrontTile(); return; }
      }

      if (!uiBlocking && !player.moving){
        const held=getHeldDir();
        if (!held){ player.hold.dir=null; player.hold.timer=0; }
        else{
          const newDir=held.dir;
          if (player.hold.dir!==newDir){ player.hold.dir=newDir; player.hold.timer=0; player.dir=newDir; }
          const sprint=input.pressed("Shift");
          const firstDelay=sprint?0.10:0.16;
          const repeatDelay=sprint?0.055:0.085;
          player.hold.timer -= dt;
          if (player.hold.timer<=0){
            const moved=startMove(held.dx,held.dy);
            if (moved) player.hold.timer = (player.hold.timer<-0.2)?firstDelay:repeatDelay;
            else player.hold.timer = 0.06;
          }
        }
      }
      updateMove(dt);
      return;
    }

    if (scene===Scene.Menu){
      updateBGM();
      if (uiBlocking) return;

      if (menu.page===2 && dexUI.detail){
        if (input.tapped("Escape")||input.tapped("x")){ dexUI.detail=false; Audio.ui(); return; }
      } else {
        if (input.tapped("Escape")||input.tapped("x")){ closeMenu(); return; }
      }

      const pageCount=3;
      if (input.tapped("ArrowLeft")||input.tapped("a")){ menu.page=(menu.page+pageCount-1)%pageCount; menu.cursor=0; Audio.ui(); return; }
      if (input.tapped("ArrowRight")||input.tapped("d")){ menu.page=(menu.page+1)%pageCount; menu.cursor=0; Audio.ui(); return; }

      if (menu.page===0){
        if (input.tapped("ArrowUp")||input.tapped("w")){ menu.cursor=clamp(menu.cursor-1,0,player.party.length-1); Audio.ui(); }
        if (input.tapped("ArrowDown")||input.tapped("s")){ menu.cursor=clamp(menu.cursor+1,0,player.party.length-1); Audio.ui(); }
        if (input.tapped("Enter")||input.tapped("z")){
          if (menu.cursor!==0){
            const tmp=player.party[0]; player.party[0]=player.party[menu.cursor]; player.party[menu.cursor]=tmp;
            say(`${player.party[0].id} is now leading your party.`);
          }
        }
      } else if (menu.page===1){
        const items=Object.keys(player.bag).filter(k=>player.bag[k]>0);
        if (items.length){
          if (input.tapped("ArrowUp")||input.tapped("w")){ menu.cursor=clamp(menu.cursor-1,0,items.length-1); Audio.ui(); }
          if (input.tapped("ArrowDown")||input.tapped("s")){ menu.cursor=clamp(menu.cursor+1,0,items.length-1); Audio.ui(); }
        }
        if (input.tapped("Enter")||input.tapped("z")){
          if (!items.length){ say("Your bag is empty."); Audio.miss(); }
          else useItemOverworld(items[menu.cursor]);
        }
      } else if (menu.page===2){
        const dexList=MON_DB.slice(0,6).map(m=>m.id);
        const maxIndex=dexList.length-1;
        if (!dexUI.detail){
          if (input.tapped("ArrowLeft")||input.tapped("a")){ dexUI.cursor=clamp(dexUI.cursor-1,0,maxIndex); Audio.ui(); }
          if (input.tapped("ArrowRight")||input.tapped("d")){ dexUI.cursor=clamp(dexUI.cursor+1,0,maxIndex); Audio.ui(); }
          if (input.tapped("ArrowUp")||input.tapped("w")){ dexUI.cursor=clamp(dexUI.cursor-dexUI.cols,0,maxIndex); Audio.ui(); }
          if (input.tapped("ArrowDown")||input.tapped("s")){ dexUI.cursor=clamp(dexUI.cursor+dexUI.cols,0,maxIndex); Audio.ui(); }
          if (input.tapped("Enter")||input.tapped("z")){ dexUI.detail=true; Audio.ui(); }
        }
      }
      return;
    }

    if (scene===Scene.Box){
      updateBGM();
      if (uiBlocking) return;
      if (input.tapped("Escape")||input.tapped("x")){ closeBox(); return; }
      if (input.tapped("Tab")){ boxUI.mode=(boxUI.mode==="partyToBox")?"boxToParty":"partyToBox"; Audio.ui(); }
      if (boxUI.mode==="partyToBox"){
        if (input.tapped("ArrowUp")||input.tapped("w")){ boxUI.cursor=clamp(boxUI.cursor-1,0,player.party.length-1); Audio.ui(); }
        if (input.tapped("ArrowDown")||input.tapped("s")){ boxUI.cursor=clamp(boxUI.cursor+1,0,player.party.length-1); Audio.ui(); }
        if (input.tapped("Enter")||input.tapped("z")){
          boxPartyToStorage(boxUI.cursor);
          boxUI.cursor=clamp(boxUI.cursor,0,player.party.length-1);
        }
      } else {
        if (player.box.length){
          if (input.tapped("ArrowUp")||input.tapped("w")){ boxUI.boxCursor=clamp(boxUI.boxCursor-1,0,player.box.length-1); Audio.ui(); }
          if (input.tapped("ArrowDown")||input.tapped("s")){ boxUI.boxCursor=clamp(boxUI.boxCursor+1,0,player.box.length-1); Audio.ui(); }
          if (input.tapped("Enter")||input.tapped("z")){
            boxStorageToParty(boxUI.boxCursor);
            boxUI.boxCursor=clamp(boxUI.boxCursor,0,player.box.length-1);
          }
        } else {
          if (input.tapped("Enter")||input.tapped("z")) Audio.miss();
        }
      }
      return;
    }

    if (scene===Scene.Shop){
      updateBGM();
      if (uiBlocking) return;
      if (input.tapped("Escape")||input.tapped("x")){ closeShop(); return; }
      const list=SHOP_STOCK.concat([{name:"Leave",price:0}]);
      if (input.tapped("ArrowUp")||input.tapped("w")){ shopUI.cursor=clamp(shopUI.cursor-1,0,list.length-1); Audio.ui(); }
      if (input.tapped("ArrowDown")||input.tapped("s")){ shopUI.cursor=clamp(shopUI.cursor+1,0,list.length-1); Audio.ui(); }
      if (input.tapped("Enter")||input.tapped("z")){
        const it=list[shopUI.cursor];
        if (it.name==="Leave") closeShop();
        else buyItem(it);
      }
      return;
    }

    if (scene===Scene.Battle){
      updateBGM();
      const a=battle.anim;
      a.playerAtk=Math.max(0,a.playerAtk-dt);
      a.enemyAtk=Math.max(0,a.enemyAtk-dt);
      a.playerHit=Math.max(0,a.playerHit-dt);
      a.enemyHit=Math.max(0,a.enemyHit-dt);
      a.playerDodge=Math.max(0,a.playerDodge-dt);
      a.enemyDodge=Math.max(0,a.enemyDodge-dt);
      updateEffects(dt);

      if (battle.exitRequested){
        battle.exitRequested=false;
        scene=battle.exitTo ?? Scene.Overworld;
        battle.exitTo=null;
        battle.menu="root"; battle.cursor=0;
        updateBGM();
        return;
      }

      if (uiBlocking) return;
      if (!battle.active){ requestExitBattle(Scene.Overworld); return; }

      if (input.tapped("Escape")||input.tapped("x")){
        if (battle.menu!=="root"){ battle.menu="root"; battle.cursor=0; Audio.ui(); }
        return;
      }

      if (battle.menu==="root"){
        if (input.tapped("ArrowUp")||input.tapped("w")){ battle.cursor = (battle.cursor>=2)?battle.cursor-2:battle.cursor; Audio.ui(); }
        if (input.tapped("ArrowDown")||input.tapped("s")){ battle.cursor = (battle.cursor<=1)?battle.cursor+2:battle.cursor; Audio.ui(); }
        if (input.tapped("ArrowLeft")||input.tapped("a")){ battle.cursor = (battle.cursor%2===1)?battle.cursor-1:battle.cursor; Audio.ui(); }
        if (input.tapped("ArrowRight")||input.tapped("d")){ battle.cursor = (battle.cursor%2===0)?battle.cursor+1:battle.cursor; Audio.ui(); }
      } else if (battle.menu==="items"){
        const items=Object.keys(player.bag).filter(k=>player.bag[k]>0).slice(0,6);
        const max=Math.max(0,items.length-1);
        if (input.tapped("ArrowUp")||input.tapped("w")){ battle.cursor=clamp(battle.cursor-1,0,max); Audio.ui(); }
        if (input.tapped("ArrowDown")||input.tapped("s")){ battle.cursor=clamp(battle.cursor+1,0,max); Audio.ui(); }
      } else if (battle.menu==="moves"){
        const max=battle.playerMon.moves.length-1;
        if (input.tapped("ArrowUp")||input.tapped("w")){ battle.cursor=clamp(battle.cursor-1,0,max); Audio.ui(); }
        if (input.tapped("ArrowDown")||input.tapped("s")){ battle.cursor=clamp(battle.cursor+1,0,max); Audio.ui(); }
      }

      if (input.tapped("Enter")||input.tapped("z")){
        Audio.ui();
        if (battle.menu==="root"){
          const idx=battle.cursor;
          if (idx===0){ battle.menu="moves"; battle.cursor=0; return; }
          if (idx===1){ battle.menu="items"; battle.cursor=0; return; }
          if (idx===2){
            tryCatch();
            if (battle.active && !battle.exitRequested){
              defer(()=>{ if (!battle.active) return; enemyTurn(); checkFaints(); });
            }
            battle.menu="root"; battle.cursor=0; return;
          }
          if (idx===3){
            if (!battle.canRun){ say("Can't run from a trainer battle!", null, null, {onStart:Audio.miss}); }
            else {
              const p=battle.playerMon, e=battle.enemyMon;
              const runP=clamp(0.35+(p.spd-e.spd)*0.03,0.1,0.9);
              if (rng.chance(runP)){
                say("Got away safely!");
                battle.active=false;
                requestExitBattle(Scene.Overworld);
              } else {
                say("Couldn't escape!", null, null, {onStart:Audio.miss});
                defer(()=>{ if (!battle.active) return; enemyTurn(); checkFaints(); });
              }
            }
            battle.menu="root"; battle.cursor=0; return;
          }
        }

        if (battle.menu==="items"){
          const items=Object.keys(player.bag).filter(k=>player.bag[k]>0).slice(0,6);
          if (!items.length){ say("Your bag is empty.", null, null, {onStart:Audio.miss}); battle.menu="root"; return; }
          const item=items[battle.cursor] || items[0];

          if (item==="Potion"||item==="Super Potion"){
            player.bag[item]--;
            const mon=battle.playerMon;
            const amt=(item==="Potion")?18:35;
            const before=mon.hp;
            mon.hp=clamp(mon.hp+amt,0,mon.maxHP);
            say(`${mon.id} recovered ${mon.hp-before} HP!`, null, null, {onStart:Audio.blip});
            defer(()=>{ if (!battle.active) return; enemyTurn(); checkFaints(); });
            battle.menu="root"; battle.cursor=0; return;
          }
          if (item==="Adrenaline Potion"){
            player.bag[item]--;
            useAdrenaline(battle.playerMon);
            defer(()=>{ if (!battle.active) return; enemyTurn(); checkFaints(); });
            battle.menu="root"; battle.cursor=0; return;
          }
          if (item==="Monster Ball"){
            tryCatch();
            if (battle.active && !battle.exitRequested){
              defer(()=>{ if (!battle.active) return; enemyTurn(); checkFaints(); });
            }
            battle.menu="root"; battle.cursor=0; return;
          }
          if (item==="Escape Rope"){
            if (!battle.canRun){ say("It can't be used here.", null, null, {onStart:Audio.miss}); battle.menu="root"; return; }
            player.bag[item]--;
            say("You escaped using Escape Rope!", null, null, {onStart:Audio.ui});
            battle.active=false;
            requestExitBattle(Scene.Overworld);
            defer(()=>{ const tA=routeMeta.towns.find(t=>t.id==="A"); warpTo("route", tA.x+12, tA.y+14); });
            battle.menu="root"; battle.cursor=0; return;
          }
          say("Nothing happened.", null, null, {onStart:Audio.miss});
          battle.menu="root"; battle.cursor=0; return;
        }

        if (battle.menu==="moves"){
          const mv=battle.playerMon.moves[battle.cursor];
          const p=battle.playerMon, e=battle.enemyMon;
          const usableEnemy=e.moves.some(m=>m.curPP>0);
          const enemyMv=usableEnemy ? e.moves.filter(m=>m.curPP>0)[0] : MOVE_DB.Neutral[0];
          const pFirst=(mv.priority||0)>(enemyMv.priority||0) || (p.spd>=e.spd);

          if (pFirst){
            const res=playerUseMove(mv);
            if (res.acted){
              defer(()=>{ if (checkFaints()) return; if (!battle.active) return; enemyTurn(); checkFaints(); });
            }
          } else {
            defer(()=>{ if (!battle.active) return; enemyTurn(); if (checkFaints()) return; const res=playerUseMove(mv); if (res.acted) checkFaints(); });
          }
          battle.menu="root"; battle.cursor=0; return;
        }
      }
      return;
    }
  }

  // Kickoff messages
  say("Modular build loaded.");
  say("Spawn: You start inside Town A.");
  say("World: One main road leads to Town B.");
  say("Buildings: Center and Mart are visible; walk onto doors to enter.");
  say("Tip: Click once to enable sound.");

  // Main loop (fixed timestep)
  let last=performance.now();
  let acc=0;
  const STEP=1/60;
  const MAX_ACC=0.25;

  function loop(now){
    const dt=Math.min(MAX_ACC, (now-last)/1000);
    last=now;
    acc += dt;
    while (acc>=STEP){ update(STEP); acc-=STEP; }
    render();
    input.clearJustPressed();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // return tiny debug surface for future extensions
  return { World, routeMeta, player, rng };
}

  window.GMRPG.createGame = createGame;
})();
