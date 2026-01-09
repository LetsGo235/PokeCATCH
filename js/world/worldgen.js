// js/world/worldgen.js (classic)
window.GMRPG = window.GMRPG || {};

const TILE = 16;
const Tile = { Block:0, Path:1, Clearing:2, Grass:3, Door:4, Interior:5, WaterShallow:6, WaterDeep:7 };
const Dir  = { Up:0, Right:1, Down:2, Left:3 };
const dirVec = [{x:0,y:-1},{x:1,y:0},{x:0,y:1},{x:-1,y:0}];

// Biomes (for routes / encounters)
const Biome = { Grass:"Grass", Forest:"Forest", Beach:"Beach", City:"City", Town:"Town" };

function newMap(w,h, fill=Tile.Block){
  return new Array(h).fill(0).map(()=>new Array(w).fill(fill));
}
function newBiomeMap(w,h, fill=Biome.Grass){
  return new Array(h).fill(0).map(()=>new Array(w).fill(fill));
}

function createWorld({mapW=240,mapH=140}={}){
  return {
    route:{ w:mapW, h:mapH, tiles:newMap(mapW,mapH,Tile.Block), biome:newBiomeMap(mapW,mapH,Biome.Grass) },
    center:{ w:22, h:16, tiles:newMap(22,16,Tile.Interior) },
    mart:{ w:22, h:16, tiles:newMap(22,16,Tile.Interior) },
  };
}

function inBounds(World, worldId, x,y){
  const W=World[worldId]; return x>=0 && y>=0 && x<W.w && y<W.h;
}
function tileAt(World, worldId, x,y){
  const W=World[worldId]; if (!W) return Tile.Block;
  if (!inBounds(World, worldId, x,y)) return Tile.Block;
  return W.tiles[y][x];
}
function biomeAt(World, worldId, x,y){
  const W=World[worldId];
  if (!W || !W.biome) return Biome.Grass;
  if (!inBounds(World, worldId, x,y)) return Biome.Grass;
  return W.biome[y][x];
}
function setBiome(World, worldId, x,y,b){
  const W=World[worldId];
  if (!W || !W.biome) return;
  if (!inBounds(World, worldId, x,y)) return;
  W.biome[y][x]=b;
}
function setTile(World, worldId, x,y,t){
  if (!inBounds(World, worldId, x,y)) return;
  World[worldId].tiles[y][x]=t;
}
function carveRect(World, worldId, x,y,w,h,t, biome=null){
  for (let yy=y; yy<y+h; yy++){
    for (let xx=x; xx<x+w; xx++){
      setTile(World, worldId, xx,yy,t);
      if (biome) setBiome(World, worldId, xx,yy, biome);
    }
  }
}
const walkable = (t)=> (t===Tile.Path || t===Tile.Clearing || t===Tile.Grass || t===Tile.Door || t===Tile.Interior || t===Tile.WaterShallow);

function carveThickPath(World, worldId, x0,y0,x1,y1,width=5, biome=null){
  const half=Math.floor(width/2);
  const stepX=Math.sign(x1-x0), stepY=Math.sign(y1-y0);
  let x=x0, y=y0;
  const carveAt=(cx,cy)=>{
    for (let yy=cy-half; yy<=cy+half; yy++){
      for (let xx=cx-half; xx<=cx+half; xx++){
        if (inBounds(World, worldId, xx,yy)){
          setTile(World, worldId, xx,yy,Tile.Path);
          if (biome) setBiome(World, worldId, xx,yy, biome);
        }
      }
    }
  };
  while (x!==x1){ carveAt(x,y); x+=stepX; }
  while (y!==y1){ carveAt(x,y); y+=stepY; }
  carveAt(x1,y1);
}

function genInteriors(World){
  // Center
  {
    const w=World.center.w, h=World.center.h;
    World.center.tiles = newMap(w,h,Tile.Interior);
    for (let x=0;x<w;x++){ setTile(World,"center",x,0,Tile.Block); setTile(World,"center",x,h-1,Tile.Block); }
    for (let y=0;y<h;y++){ setTile(World,"center",0,y,Tile.Block); setTile(World,"center",w-1,y,Tile.Block); }
    const doorX=Math.floor(w/2); setTile(World,"center",doorX,h-2,Tile.Door);
    carveRect(World,"center",3,3,w-6,2,Tile.Block);
    setTile(World,"center",5,3,Tile.Interior);
    carveRect(World,"center",w-9,6,6,5,Tile.Interior);
    setTile(World,"center",w-9,6,Tile.Block); setTile(World,"center",w-4,6,Tile.Block);
  }
  // Mart
  {
    const w=World.mart.w, h=World.mart.h;
    World.mart.tiles = newMap(w,h,Tile.Interior);
    for (let x=0;x<w;x++){ setTile(World,"mart",x,0,Tile.Block); setTile(World,"mart",x,h-1,Tile.Block); }
    for (let y=0;y<h;y++){ setTile(World,"mart",0,y,Tile.Block); setTile(World,"mart",w-1,y,Tile.Block); }
    const doorX=Math.floor(w/2); setTile(World,"mart",doorX,h-2,Tile.Door);
    carveRect(World,"mart",3,3,w-6,2,Tile.Block);
    setTile(World,"mart",5,3,Tile.Interior);
    carveRect(World,"mart",w-9,6,6,5,Tile.Interior);
    setTile(World,"mart",w-9,6,Tile.Block); setTile(World,"mart",w-4,6,Tile.Block);
  }
}

function genRouteFiveTowns(World, rng){
  const { randi, clamp } = rng;
  const MAP_W=World.route.w, MAP_H=World.route.h;
  World.route.tiles = newMap(MAP_W,MAP_H,Tile.Block);
  World.route.biome = newBiomeMap(MAP_W,MAP_H,Biome.Grass);

  const buildings = []; // { kind, townId, x,y,w,h, door, label }
  const doorLookup = new Map();
  const doorKey=(x,y)=>`${x},${y}`;

  function addBuilding(townId, kind, x, y){
    const w=10, h=7;
    const door = { x: x+Math.floor(w/2), y: y+h-1 };
    buildings.push({ townId, kind, x,y,w,h, door, label: kind==="center"?"Center":"Mart" });

    for (let yy=y; yy<y+h; yy++) for (let xx=x; xx<x+w; xx++) setTile(World,"route",xx,yy,Tile.Block);
    setTile(World,"route", door.x, door.y, Tile.Door);
    carveRect(World,"route", door.x-1, door.y+1, 3, 2, Tile.Clearing, Biome.Town);
    setTile(World,"route", door.x, door.y+1, Tile.Clearing);
  }

  function addTown(id, name, x,y){
    const w=34, h=24;
    carveRect(World,"route", x,y,w,h, Tile.Clearing, Biome.Town);
    return { id, name, x,y,w,h };
  }

function rectsOverlap(a,b,pad){
  pad = pad||0;
  return !(a.x+a.w+pad < b.x || b.x+b.w+pad < a.x || a.y+a.h+pad < b.y || b.y+b.h+pad < a.y);
}
function placeTown(id,name,x, yMin, yMax, placed){
  for (let tries=0; tries<40; tries++){
    const y = randi(yMin, yMax);
    const t = addTown(id,name,x,y);
    let ok=true;
    for (const o of placed){
      if (rectsOverlap(t,o,8)){ ok=false; break; }
    }
    if (ok) return t;
    // remove the failed town carving by re-blocking that area (cheap fix: just abandon; overlap is rare with x spacing)
    // In this generator, overlap issues are mainly due to y closeness; we simply retry with a new y.
  }
  return addTown(id,name,x, randi(yMin,yMax));
}


  // Layout: left to right main road, with vertical variation.
// Bigger map + wider spacing.
const townA = addTown("A","Town A", 12, 40);
const townB = addTown("B","Town B", 75, randi(26, 84));
const townC = addTown("C","Town C", 138, randi(22, 92));
const townD = addTown("D","Seabreeze Town", 195, randi(26, 88));
const townE = addTown("E","Metro City", MAP_W-34-10, randi(26, 84)); // near right edge

const towns=[townA,townB,townC,townD,townE];


  const hub = (t)=>({ x: t.x+Math.floor(t.w/2), y: t.y+Math.floor(t.h/2) });

  const hubA=hub(townA), hubB=hub(townB), hubC=hub(townC), hubD=hub(townD), hubE=hub(townE);

  // Biome segments:
  // A->B Grass, B->C Forest, C->D Beach, D->E City
  carveThickPath(World,"route", hubA.x,hubA.y, hubB.x,hubB.y, 5, Biome.Grass);
  carveThickPath(World,"route", hubB.x,hubB.y, hubC.x,hubC.y, 5, Biome.Forest);
  carveThickPath(World,"route", hubC.x,hubC.y, hubD.x,hubD.y, 5, Biome.Beach);
  carveThickPath(World,"route", hubD.x,hubD.y, hubE.x,hubE.y, 5, Biome.City);
// --- Beach sea near Town D (Seabreeze Town) ---
// Shallow water close to shore, deep water further out.
const seaStartX = townD.x + townD.w + 6;
const seaEndX   = Math.min(MAP_W-3, seaStartX + 28);
const seaTopY   = Math.max(3, townD.y - 10);
const seaBotY   = Math.min(MAP_H-3, townD.y + townD.h + 10);
for (let y=seaTopY; y<=seaBotY; y++){
  for (let x=seaStartX; x<=seaEndX; x++){
    const depth = x - seaStartX;
    const t = (depth < 8) ? Tile.WaterShallow : Tile.WaterDeep;
    setTile(World,"route",x,y,t);
    setBiome(World,"route",x,y,Biome.Beach);
  }
}
// Sandy shore strip
carveRect(World,"route", townD.x + townD.w, townD.y+2, 6, townD.h-4, Tile.Path, Biome.Beach);

  // Add side clearings + grass patches along each segment
  const segments=[
    {a:hubA,b:hubB, biome:Biome.Grass},
    {a:hubB,b:hubC, biome:Biome.Forest},
    {a:hubC,b:hubD, biome:Biome.Beach},
    {a:hubD,b:hubE, biome:Biome.City},
  ];
  for (const seg of segments){
// Extra tall-grass patches directly along the main road (so routes always have encounters)
for (let i=0;i<14;i++){
  const px = randi(Math.min(seg.a.x, seg.b.x)+6, Math.max(seg.a.x, seg.b.x)-6);
  const py = randi(6, MAP_H-8);
  let anchor=null;
  for (let k=0;k<120;k++){
    const x = clamp(px + randi(-14,14), 4, MAP_W-5);
    const y = clamp(py + randi(-12,12), 4, MAP_H-5);
    if (tileAt(World,"route", x, y) === Tile.Path){ anchor={x,y}; break; }
  }
  if (!anchor) continue;
  const gw=randi(6,12), gh=randi(5,10);
  const gx=clamp(anchor.x + randi(-8,8) - Math.floor(gw/2), 2, MAP_W-gw-2);
  const gy=clamp(anchor.y + randi(-8,8) - Math.floor(gh/2), 2, MAP_H-gh-2);
  carveRect(World,"route", gx, gy, gw, gh, Tile.Grass, seg.biome);
}

    for (let i=0;i<7;i++){
      const px = randi(Math.min(seg.a.x, seg.b.x)+6, Math.max(seg.a.x, seg.b.x)-6);
      const py = randi(8, MAP_H-10);
      let best=null;
      for (let k=0;k<80;k++){
        const x = clamp(px + randi(-10,10), 4, MAP_W-5);
        const y = clamp(py + randi(-10,10), 4, MAP_H-5);
        if (tileAt(World,"route", x, y) === Tile.Path){ best={x,y}; break; }
      }
      if (!best) continue;

      const w = randi(12, 18), h = randi(10, 16);
      const rx = clamp(best.x - Math.floor(w/2), 2, MAP_W-w-2);
      const ry = clamp(best.y - Math.floor(h/2), 2, MAP_H-h-2);

      carveRect(World,"route", rx, ry, w, h, Tile.Clearing, seg.biome);

      const patches = randi(4, 8);
      for (let p=0;p<patches;p++){
        const gw=randi(5,9), gh=randi(4,7);
        const gx=randi(rx+2, rx+w-gw-3);
        const gy=randi(ry+2, ry+h-gh-3);
        // grass tiles are encounter tiles in ALL biomes
        carveRect(World,"route", gx, gy, gw, gh, Tile.Grass, seg.biome);
      }

      carveThickPath(World,"route", best.x, best.y, rx+Math.floor(w/2), ry+Math.floor(h/2), 3, seg.biome);
    }
  }

  // Buildings: center+mart in each town
  for (const t of towns){
    addBuilding(t.id,"center", t.x + 5,  t.y + 4);
    addBuilding(t.id,"mart",   t.x + 19, t.y + 4);
  }

  for (const b of buildings){
    doorLookup.set(doorKey(b.door.x, b.door.y), { to:b.kind, townId:b.townId });
  }

  return { towns, hubs:{A:hubA,B:hubB,C:hubC,D:hubD,E:hubE}, buildings, doorLookup, Biome };
}

function insideTown(routeMeta, x,y){
  for (const t of routeMeta.towns){
    if (x>=t.x && y>=t.y && x<t.x+t.w && y<t.y+t.h) return t;
  }
  return null;
}

// expose
window.GMRPG.TILE = TILE;
window.GMRPG.Tile = Tile;
window.GMRPG.Dir = Dir;
window.GMRPG.dirVec = dirVec;
window.GMRPG.Biome = Biome;

window.GMRPG.newMap = newMap;
window.GMRPG.createWorld = createWorld;
window.GMRPG.genInteriors = genInteriors;
window.GMRPG.genRouteFiveTowns = genRouteFiveTowns;

window.GMRPG.insideTown = insideTown;
window.GMRPG.inBounds = inBounds;
window.GMRPG.tileAt = tileAt;
window.GMRPG.biomeAt = biomeAt;
window.GMRPG.setTile = setTile;
window.GMRPG.carveRect = carveRect;
window.GMRPG.walkable = walkable;
window.GMRPG.carveThickPath = carveThickPath;
