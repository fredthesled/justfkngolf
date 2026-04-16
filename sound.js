/* ================================================================
 *  Just F'kn Golf — sound.js
 *  Web Audio API engine. No external files — everything synthesized.
 *  Must call Sound.init() on first user gesture (AudioContext policy).
 *
 *  Public API:
 *    Sound.init()
 *    Sound.playTitleFanfare()
 *    Sound.playAnnouncer()      ← "JUST! ... FRIKKIN! ... GOLF!"
 *    Sound.playCough()
 *    Sound.playAirHorn()
 *    Sound.playShank()
 *    Sound.playCrowdCheer()
 *    Sound.playStrike()
 *    Sound.playHoleResult(isGood)
 *    Sound.playLeaderboardUpdate()
 * ================================================================ */

class SoundEngine {
  constructor(){
    this.ctx    = null;
    this.master = null;
    this.ready  = false;
  }

  init(){
    if(this.ready) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.72;
      this.master.connect(this.ctx.destination);
      this.ready = true;
    } catch(e){ console.warn('Web Audio unavailable:', e); }
  }

  // ── Utilities ─────────────────────────────────────────────────

  // Soft-clip distortion — higher amount = more crunch
  _distCurve(amount){
    const n = 256, c = new Float32Array(n);
    for(let i=0;i<n;i++){
      const x = i*2/n - 1;
      c[i] = (Math.PI + amount) * x / (Math.PI + amount * Math.abs(x));
    }
    return c;
  }

  // Bit-reduction curve — simulates 8/10-bit depth
  _bitCrush(bits){
    const steps = Math.pow(2, bits), n = 256, c = new Float32Array(n);
    for(let i=0;i<n;i++){
      const x = i*2/n - 1;
      c[i] = Math.round(x * steps) / steps;
    }
    return c;
  }

  // Create osc → waveShaper → gain → master and schedule it
  _osc(type, freq, gainVal, dur, delay=0, distAmt=0){
    if(!this.ready) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g   = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    if(distAmt > 0){
      const ws = ctx.createWaveShaper();
      ws.curve = this._distCurve(distAmt);
      osc.connect(ws); ws.connect(g);
    } else {
      osc.connect(g);
    }
    g.connect(this.master);
    const t = ctx.currentTime + delay;
    g.gain.setValueAtTime(gainVal, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.start(t); osc.stop(t + dur + 0.05);
    return osc;
  }

  // White noise burst routed through a bandpass filter
  _noise(freq, Q, gainVal, dur, delay=0){
    if(!this.ready) return;
    const ctx  = this.ctx;
    const buf  = ctx.createBuffer(1, Math.ceil(ctx.sampleRate*(dur+0.1)), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for(let i=0;i<data.length;i++) data[i] = Math.random()*2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const flt = ctx.createBiquadFilter();
    flt.type = 'bandpass'; flt.frequency.value = freq; flt.Q.value = Q;
    const g = ctx.createGain();
    src.connect(flt); flt.connect(g); g.connect(this.master);
    const t = ctx.currentTime + delay;
    g.gain.setValueAtTime(gainVal, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.start(t); src.stop(t + dur + 0.1);
  }

  // Kick drum — sine pitch-bomb
  _kick(delay=0, gain=0.9){
    if(!this.ready) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g   = ctx.createGain();
    osc.type  = 'sine';
    const t   = ctx.currentTime + delay;
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.16);
    osc.connect(g); g.connect(this.master);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    osc.start(t); osc.stop(t + 0.26);
  }

  // ── TITLE FANFARE ────────────────────────────────────────────
  // Three-hit 16-bit power chord stinger
  playTitleFanfare(){
    if(!this.ready) return;
    // Rising stab notes (square wave = retro)
    const hits = [
      { f:220, d:0,    dur:0.28 },
      { f:330, d:0.16, dur:0.28 },
      { f:440, d:0.32, dur:0.55 },
      { f:550, d:0.32, dur:0.55 },
      { f:660, d:0.32, dur:0.55 },
    ];
    hits.forEach(h => this._osc('square', h.f, 0.30, h.dur, h.d, 250));
    // Kick on the accent hit
    this._kick(0.00, 0.8);
    this._kick(0.32, 1.0);
    // Short snare noise burst
    this._noise(2200, 1.2, 0.35, 0.12, 0.34);
  }

  // ── ANNOUNCER ─────────────────────────────────────────────────
  // Web Speech API. Fires three words at staggered delays.
  // Pitch 0.5 + rate 0.8 = deep, deliberate, "Guile's stage" energy.
  playAnnouncer(){
    if(!window.speechSynthesis) return;

    const words  = ['JUST!', 'FRIKKIN!', 'GOLF!'];
    const delays = [0,        620,         1180 ];

    const doSpeak = () => {
      words.forEach((word, i) => {
        setTimeout(() => {
          const utt      = new SpeechSynthesisUtterance(word);
          utt.pitch      = 0.48;   // as low as it goes
          utt.rate       = 0.82;   // deliberate bark
          utt.volume     = 1.0;
          const voices   = speechSynthesis.getVoices();
          const deep     = voices.find(v =>
            /david|mark|daniel|george|alex|thomas|fred/i.test(v.name) &&
            /en/i.test(v.lang)
          ) || voices.find(v => /en/i.test(v.lang)) || voices[0];
          if(deep) utt.voice = deep;
          speechSynthesis.speak(utt);
          // Punch each word with a short synth accent
          this._osc('square', 110 + i*55, 0.18, 0.14, 0, 180);
        }, delays[i]);
      });
    };

    // Voices list can be async on first load
    if(speechSynthesis.getVoices().length > 0){
      doSpeak();
    } else {
      speechSynthesis.addEventListener('voiceschanged', doSpeak, { once: true });
    }
  }

  // ── IN-GAME SFX ──────────────────────────────────────────────

  playCough(){
    // Bandpass noise burst — muffled, short
    this._noise(850, 2.2, 0.65, 0.22);
    this._noise(400, 1.0, 0.25, 0.18, 0.04);
  }

  playAirHorn(){
    if(!this.ready) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const ws  = ctx.createWaveShaper();
    const g   = ctx.createGain();
    ws.curve  = this._distCurve(700);
    osc.type  = 'sawtooth';
    const t   = ctx.currentTime;
    osc.frequency.setValueAtTime(233, t);
    osc.frequency.exponentialRampToValueAtTime(110, t + 1.0);
    osc.connect(ws); ws.connect(g); g.connect(this.master);
    g.gain.setValueAtTime(0.50, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.05);
    osc.start(t); osc.stop(t + 1.1);
  }

  // Comedic descending slide-whistle on a big shank
  playShank(){
    if(!this.ready) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g   = ctx.createGain();
    osc.type  = 'sine';
    const t   = ctx.currentTime;
    osc.frequency.setValueAtTime(520, t);
    osc.frequency.exponentialRampToValueAtTime(75, t + 0.75);
    osc.connect(g); g.connect(this.master);
    g.gain.setValueAtTime(0.38, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.82);
    osc.start(t); osc.stop(t + 0.88);
    this._kick(0, 0.4);
  }

  // Crowd noise swell
  playCrowdCheer(){
    if(!this.ready) return;
    const ctx  = this.ctx;
    const dur  = 1.3;
    const buf  = ctx.createBuffer(2, Math.ceil(ctx.sampleRate*dur), ctx.sampleRate);
    for(let ch=0;ch<2;ch++){
      const data = buf.getChannelData(ch);
      for(let i=0;i<data.length;i++){
        const env = Math.min(i/(ctx.sampleRate*0.12),1) *
                    Math.max(0,1-(i-ctx.sampleRate*0.75)/(ctx.sampleRate*0.5));
        data[i] = (Math.random()*2-1) * env;
      }
    }
    const src = ctx.createBufferSource(); src.buffer = buf;
    const flt = ctx.createBiquadFilter();
    flt.type = 'bandpass'; flt.frequency.value = 1100; flt.Q.value = 0.7;
    const g = ctx.createGain(); g.gain.value = 0.38;
    src.connect(flt); flt.connect(g); g.connect(this.master);
    src.start(ctx.currentTime);
  }

  // Buzzer for getting a strike
  playStrike(){
    if(!this.ready) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const ws  = ctx.createWaveShaper();
    const g   = ctx.createGain();
    ws.curve  = this._distCurve(500);
    osc.type  = 'sawtooth';
    osc.frequency.value = 95;
    osc.connect(ws); ws.connect(g); g.connect(this.master);
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.55, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    osc.start(t); osc.stop(t + 0.5);
  }

  // 4-note arp up (good) or down (bad)
  playHoleResult(isGood){
    const notes = isGood ? [330,415,523,659] : [440,330,220,165];
    notes.forEach((f,i) => this._osc('square', f, 0.22, 0.22, i*0.09, 80));
    if(isGood) this._kick(0, 0.5);
  }

  // Satisfying card-click on leaderboard update
  playLeaderboardUpdate(){
    this._osc('square', 880, 0.20, 0.08, 0,   0);
    this._osc('square', 660, 0.18, 0.10, 0.06, 0);
  }
}

window.Sound = new SoundEngine();
