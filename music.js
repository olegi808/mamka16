/* =====================================================================
   ВРЕМЕННАЯ МУЗЫКА — синтезатор в браузере (Web Audio API), без файлов.
   Играет, только когда нет настоящего mp3 в папке audio/.
   Когда положишь все треки, этот файл можно удалить.
   ===================================================================== */
const Synth = (() => {
  let ctx = null, master = null, noiseBuf = null, cur = null;
  const midi = n => 440 * Math.pow(2, (n - 69) / 12);

  // ---- настроения ----
  // chords — аккорды (MIDI-ноты), по одному на такт (16 шагов)
  // arp — узор арпеджио: число = нота аккорда (0..2) + 3 за октаву вверх, -1 = пауза
  // beat — 'lofi' | 'trap' | 'heart' | null
  const P = {
    menu:  { bpm:72, chords:[[57,60,64],[53,57,60],[48,52,55],[55,59,62]],
             pad:'triangle', padVol:.07, cutoff:1300,
             arp:[0,-1,2,-1,4,-1,2,-1,3,-1,2,-1,1,-1,2,-1], arpType:'sine', arpVol:.06, arpOct:12,
             beat:'lofi', bass:true, vinyl:.010 },
    love:  { bpm:92, chords:[[60,64,67],[55,59,62],[57,60,64],[53,57,60]],
             pad:'triangle', padVol:.06, cutoff:2400,
             arp:[0,2,4,2,3,2,4,5,0,2,4,2,3,5,4,2], arpType:'triangle', arpVol:.05, arpOct:12,
             beat:null, bass:true, vinyl:0 },
    shock: { bpm:60, chords:[[45,52,56],[45,51,57],[44,52,57],[45,52,56]],
             pad:'sawtooth', padVol:.035, cutoff:500,
             arp:[-1,-1,-1,-1,-1,-1,5,-1,-1,-1,-1,-1,-1,-1,-1,4], arpType:'sine', arpVol:.06, arpOct:24,
             beat:'heart', bass:false, vinyl:0, drone:33 },
    drama: { bpm:74, chords:[[57,60,64],[53,57,60],[50,53,57],[52,56,59]],
             pad:'sawtooth', padVol:.03, cutoff:900,
             arp:[0,-1,-1,2,-1,-1,1,-1,0,-1,-1,2,-1,4,-1,-1], arpType:'sine', arpVol:.07, arpOct:12,
             beat:'trap', bass:true, vinyl:.006 },
    birth: { bpm:84, chords:[[50,53,57],[46,50,53],[53,57,60],[48,52,55]],
             pad:'triangle', padVol:.07, cutoff:1800,
             arp:[0,1,2,3,4,5,4,3,0,1,2,3,4,5,4,3], arpType:'triangle', arpVol:.045, arpOct:12,
             beat:null, bass:true, vinyl:0 },
    life:  { bpm:76, chords:[[53,57,60],[48,52,55],[50,53,57],[46,50,53]],
             pad:'sine', padVol:.06, cutoff:1600,
             arp:[3,4,5,4,3,-1,4,-1,3,4,5,6,5,-1,4,-1], arpType:'sine', arpVol:.055, arpOct:24, musicBox:true,
             beat:null, bass:false, vinyl:.006 },
    bad:   { bpm:56, chords:[[45,48,52],[41,45,48],[40,44,47],[45,48,52]],
             pad:'triangle', padVol:.07, cutoff:900,
             arp:[5,-1,4,-1,3,-1,2,-1,1,-1,-1,-1,0,-1,-1,-1], arpType:'sine', arpVol:.06, arpOct:12,
             beat:null, bass:true, vinyl:.008 },
    good:  { bpm:70, chords:[[60,64,67],[55,59,62],[57,60,64],[53,57,60]],
             pad:'triangle', padVol:.08, cutoff:2600,
             arp:[0,-1,2,-1,4,-1,5,-1,4,-1,2,-1,3,-1,-1,-1], arpType:'sine', arpVol:.06, arpOct:12,
             beat:null, bass:true, vinyl:.006 },
  };

  function init(){
    if(ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if(!AC) return false;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp); comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for(let i=0;i<d.length;i++) d[i] = Math.random()*2 - 1;
    return true;
  }

  // ---- голоса ----
  function pad(out, p, notes, t, dur){
    const f = ctx.createBiquadFilter(); f.type='lowpass'; f.frequency.value = p.cutoff; f.Q.value = .5;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(p.padVol, t + Math.min(1.2, dur*.4));
    g.gain.setValueAtTime(p.padVol, t + dur*.75);
    g.gain.linearRampToValueAtTime(0, t + dur + .3);
    f.connect(g); g.connect(out);
    notes.forEach(n => [-6, 6].forEach(det => {
      const o = ctx.createOscillator(); o.type = p.pad; o.frequency.value = midi(n); o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + dur + .4);
    }));
  }
  function pluck(out, p, note, t){
    const o = ctx.createOscillator(); o.type = p.arpType; o.frequency.value = midi(note);
    const g = ctx.createGain(); const dec = p.musicBox ? 1.2 : .6;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(p.arpVol, t + .01);
    g.gain.exponentialRampToValueAtTime(.0001, t + dec);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + dec + .05);
    if(p.musicBox){ // звон музыкальной шкатулки
      const o2 = ctx.createOscillator(); o2.type='sine'; o2.frequency.value = midi(note)*4;
      const g2 = ctx.createGain(); g2.gain.setValueAtTime(p.arpVol*.25, t); g2.gain.exponentialRampToValueAtTime(.0001, t+.4);
      o2.connect(g2); g2.connect(out); o2.start(t); o2.stop(t+.45);
    }
  }
  function bass(out, note, t, dur, vol){
    const o = ctx.createOscillator(); o.type='sine'; o.frequency.value = midi(note);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t+.02);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + .05);
  }
  function kick(out, t, vol){
    const o = ctx.createOscillator(); o.type='sine';
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(42, t + .14);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + .32);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + .35);
  }
  function noiseHit(out, t, type, freq, vol, dec){
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dec);
    s.connect(f); f.connect(g); g.connect(out); s.start(t, Math.random()); s.stop(t + dec + .02);
  }
  function vinyl(out, vol){
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type='bandpass'; f.frequency.value = 3000; f.Q.value = .7;
    const g = ctx.createGain(); g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(out); s.start();
    return s;
  }
  function drone(out, note, vol){
    const o = ctx.createOscillator(); o.type='sawtooth'; o.frequency.value = midi(note);
    const f = ctx.createBiquadFilter(); f.type='lowpass'; f.frequency.value = 220;
    const lfo = ctx.createOscillator(); lfo.frequency.value = .08;
    const lg = ctx.createGain(); lg.gain.value = 120; lfo.connect(lg); lg.connect(f.frequency);
    const g = ctx.createGain(); g.gain.value = vol;
    o.connect(f); f.connect(g); g.connect(out); o.start(); lfo.start();
    return [o, lfo];
  }

  // ---- один шаг секвенсора (16-я нота) ----
  function step(tr, i, t){
    const p = tr.p, s16 = 60 / p.bpm / 4, bar = Math.floor(i / 16), pos = i % 16;
    const ch = p.chords[bar % p.chords.length];
    if(pos === 0){
      pad(tr.out, p, ch, t, s16 * 16);
      if(p.bass) bass(tr.out, ch[0] - 24, t, s16 * 7, .16);
    }
    if(p.bass && pos === 8 && p.beat) bass(tr.out, ch[0] - 24, t, s16 * 6, .12);
    const a = p.arp[pos];
    if(a >= 0){ const n = ch[a % 3] + 12 * Math.floor(a / 3) + p.arpOct - 12; pluck(tr.out, p, n, t); }
    if(p.beat === 'lofi'){
      if(pos === 0 || pos === 10) kick(tr.out, t, .32);
      if(pos === 4 || pos === 12) noiseHit(tr.out, t, 'bandpass', 1800, .09, .16);
      if(pos % 2 === 0) noiseHit(tr.out, t, 'highpass', 7000, pos % 4 ? .015 : .025, .04);
    } else if(p.beat === 'trap'){
      if(pos === 0 || pos === 7 || pos === 10) kick(tr.out, t, .34);
      if(pos === 8) noiseHit(tr.out, t, 'bandpass', 1600, .11, .2);
      noiseHit(tr.out, t, 'highpass', 8000, pos % 2 ? .008 : .018, .03);
    } else if(p.beat === 'heart'){
      if(pos === 0) kick(tr.out, t, .4);
      if(pos === 3) kick(tr.out, t, .28);
    }
  }

  function play(key){
    if(!P[key] || !init()) return;
    stop();
    const p = P[key];
    const out = ctx.createGain(); out.gain.setValueAtTime(0, ctx.currentTime);
    out.gain.linearRampToValueAtTime(1, ctx.currentTime + 1.5);
    out.connect(master);
    const tr = { key, p, out, i:0, next: ctx.currentTime + .1, extras:[] };
    if(p.vinyl) tr.extras.push(vinyl(out, p.vinyl));
    if(p.drone) tr.extras.push(...drone(out, p.drone, .05));
    tr.timer = setInterval(() => {
      while(tr.next < ctx.currentTime + .25){ step(tr, tr.i, tr.next); tr.i++; tr.next += 60 / p.bpm / 4; }
    }, 50);
    cur = tr;
  }
  function stop(){
    if(!cur || !ctx) return;
    const tr = cur; cur = null;
    clearInterval(tr.timer);
    const t = ctx.currentTime;
    tr.out.gain.cancelScheduledValues(t); tr.out.gain.setValueAtTime(tr.out.gain.value, t);
    tr.out.gain.linearRampToValueAtTime(0, t + 1.2);
    setTimeout(() => { tr.extras.forEach(n => { try{ n.stop(); }catch(e){} }); tr.out.disconnect(); }, 1400);
  }
  function resume(){ if(ctx && ctx.state === 'suspended') ctx.resume(); }
  function current(){ return cur ? cur.key : ''; }
  function state(){ return ctx ? ctx.state : 'none'; }
  return { play, stop, resume, current, state };
})();
window.Synth = Synth;
