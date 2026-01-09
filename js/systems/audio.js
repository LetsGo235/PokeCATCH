window.GMRPG = window.GMRPG || {};
// js/systems/audio.js
function createAudio(){
  let ctxA = null;
  function ensure(){
    if (!ctxA) ctxA = new (window.AudioContext||window.webkitAudioContext)();
    if (ctxA.state==="suspended") ctxA.resume().catch(()=>{});
    return ctxA;
  }
  function beep(freq=440,dur=0.06,type="square",gain=0.05,slideTo=null){
    try{
      const c=ensure(); const o=c.createOscillator(); const gg=c.createGain();
      o.type=type; o.frequency.setValueAtTime(freq,c.currentTime);
      if (slideTo!=null) o.frequency.exponentialRampToValueAtTime(Math.max(1,slideTo), c.currentTime+dur);
      gg.gain.setValueAtTime(gain,c.currentTime);
      gg.gain.exponentialRampToValueAtTime(0.0001,c.currentTime+dur);
      o.connect(gg); gg.connect(c.destination);
      o.start(); o.stop(c.currentTime+dur);
    }catch{}
  }
  function noiseBurst(dur=0.05,gain=0.035){
    try{
      const c=ensure();
      const n=Math.floor(c.sampleRate*dur);
      const buf=c.createBuffer(1,n,c.sampleRate);
      const d=buf.getChannelData(0);
      for (let i=0;i<n;i++) d[i]=(Math.random()*2-1)*(1-i/n);
      const src=c.createBufferSource(); src.buffer=buf;
      const gg=c.createGain();
      gg.gain.setValueAtTime(gain,c.currentTime);
      gg.gain.exponentialRampToValueAtTime(0.0001,c.currentTime+dur);
      src.connect(gg); gg.connect(c.destination);
      src.start(); src.stop(c.currentTime+dur);
    }catch{}
  }
  function cry(mon){
    const t=mon?.type||"Air";
    if (t==="Leaf"){ beep(520,0.05,"triangle",0.035,680); beep(720,0.06,"sine",0.03,540); }
    else if (t==="Fire"){ beep(220,0.07,"sawtooth",0.03,520); noiseBurst(0.04,0.02); }
    else if (t==="Water"){ beep(440,0.06,"sine",0.03,330); beep(330,0.08,"sine",0.025,260); }
    else if (t==="Stone"){ beep(160,0.09,"square",0.03,120); beep(120,0.08,"square",0.02,90); }
    else if (t==="Night"){ beep(300,0.06,"triangle",0.03,140); beep(140,0.10,"sine",0.02,110); }
    else { beep(880,0.04,"square",0.03,660); beep(660,0.05,"square",0.02,520); }
  }
  function evoJingle(){
    beep(330,0.10,"square",0.03,440);
    setTimeout(()=>beep(440,0.10,"square",0.03,660),110);
    setTimeout(()=>beep(660,0.10,"square",0.03,880),220);
    setTimeout(()=>beep(880,0.14,"square",0.035,990),330);
  }

  const BGM = (() => {
    let enabled = true;
    let current = "route";
    let timer = null;
    let gainNode = null;

    const tracks = {
      route: { bpm:120, waves:["triangle","sine"], seq:[220,247,262,294,330,294,262,247,220,247,262,294,349,330,294,262], bass:[110,110,123,123,131,131,123,123], vol:0.045 },
      town:  { bpm:112, waves:["sine","triangle"], seq:[262,294,330,392,330,294,262,247,262,294,330,349,330,294,262,247], bass:[131,131,147,147,165,165,147,147], vol:0.045 },
      battle:{ bpm:140, waves:["square","sawtooth"], seq:[330,330,392,392,440,392,330,294,330,330,392,392,494,440,392,330], bass:[165,165,196,196,220,220,196,196], vol:0.05 }
    };

    function stop(){ if (timer){ clearInterval(timer); timer=null; } }
    function set(on){ enabled=on; if(!enabled) stop(); }

    function startTrack(name){
      if (!enabled) return;
      current = name;
      stop();
      const c = ensure();
      if (!gainNode){
        gainNode = c.createGain();
        gainNode.gain.setValueAtTime(1.0, c.currentTime);
        gainNode.connect(c.destination);
      }
      const T = tracks[name] || tracks.route;
      const stepMs = (60_000 / T.bpm) / 2;
      let i=0, j=0;

      timer = setInterval(()=>{
        try{
          const c = ensure();
          const t0 = c.currentTime;

          const f = T.seq[i % T.seq.length];
          const o1 = c.createOscillator();
          const g1 = c.createGain();
          o1.type = T.waves[0];
          o1.frequency.setValueAtTime(f, t0);
          g1.gain.setValueAtTime(T.vol, t0);
          g1.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.10);
          o1.connect(g1); g1.connect(gainNode);
          o1.start(t0); o1.stop(t0 + 0.12);

          if ((i % 2)===0){
            const b = T.bass[j % T.bass.length];
            const o2 = c.createOscillator();
            const g2 = c.createGain();
            o2.type = T.waves[1];
            o2.frequency.setValueAtTime(b, t0);
            g2.gain.setValueAtTime(T.vol*0.75, t0);
            g2.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
            o2.connect(g2); g2.connect(gainNode);
            o2.start(t0); o2.stop(t0 + 0.18);
            j++;
          }
          i++;
        }catch{}
      }, stepMs);
    }

    function setMode(name){ if (name!==current) startTrack(name); }
    return { setMode, startTrack, stop, set };
  })();

  return {
    ensure,
    ui: ()=>beep(740,0.035,"square",0.045,520),
    blip: ()=>beep(520,0.03,"square",0.04,420),
    encounter: ()=>{ beep(220,0.08,"sawtooth",0.03,380); beep(440,0.06,"square",0.03,520); },
    hit: ()=>{ noiseBurst(0.05,0.04); beep(160,0.04,"triangle",0.03,90); },
    miss: ()=>beep(260,0.05,"square",0.03,220),
    faint: ()=>beep(220,0.12,"sine",0.04,60),
    catch: ()=>{ beep(660,0.05,"square",0.04,880); beep(990,0.06,"square",0.03,520); },
    cry, evoJingle, BGM
  };
}

window.GMRPG.createAudio = createAudio;
