/* ================================================================
 *  Just F'kn Golf — v0.5
 *  Title screen, camera pan, birds, flag wave, announcer voice
 *  640×360 canvas, three-strike caught system, wager ÷10
 *
 *  TIMING ZONES:
 *    Outside window  → MISS     +1 strike,  combo reset,  $0
 *    Orange GOOD     → GOOD     no strike,  combo +1,     $20×combo
 *    Yellow CRIT     → CRITICAL −1 strike,  combo +1,     $50×combo
 *    No heckle       → IDLE     no strike,  combo kept,   $0
 *
 *  3 STRIKES  → ejected (game over)
 *  3 CONSEC.CRITS → golfer rage-quits (game over)
 *  FINISH 9   → +$200 survival bonus
 * ================================================================ */

const W = 640, H = 360;

const C = {
  skyT:0x1a2a4a, skyB:0x5a90d0, hill:0x2a6040,
  rough:0x1a5020, fair:0x3aa040, fairDk:0x28782e,
  sand:0xe0c060, flag:0xe02828, green:0x58c858,
  gShirt:0xf0f0f0, gPants:0x1828b0, gSkin:0xe8b888, gHat:0xb01818, gClub:0xd0d0d0,
  cBib:0x28882a, cShirt:0xe8e8d0, cPants:0xb09060, cSkin:0xe8c090, cCap:0xf0f0e0, cBag:0x805030,
  cr:[0xb83030,0x2850b0,0xb09030,0x704090,0x408060],
  uBg:0x0f0f0f, uGood:0x30e030, uWarn:0xf0a020, uCrit:0xffff30, uBad:0xe02020,
  white:0xffffff, black:0x000000,
  lbBg:0x162814, lbWood:0x2e1a0a, lbRow:0x221408, lbRowAlt:0x1a1006,
  lbGold:0xd4a820, lbText:0xf0e8d0, lbCard:0xf0e0a0, lbHi:0xffe050,
};

const PAYOUT       = { CRITICAL:50, GOOD:20, MISS:0, IDLE:0 };
const SURVIVAL_BONUS = 200;
const MAX_COMBO    = 4;
const CRIT_FRAC    = 0.22;
const MAX_STRIKES  = 3;
const RAGE_LIMIT   = 3;

const GOLFER_ROSTER = [
  { name:'B. HARRINGTON', player:true  },
  { name:'CHIP EAGLETON', player:false },
  { name:'SANDY BUNKER',  player:false },
  { name:'FORE-ST GUMP',  player:false },
  { name:'PAR EXCELLENCE',player:false },
  { name:'BIRDIE LAWS',   player:false },
  { name:'A. DIVOT JR.',  player:false },
  { name:'J. NIKLISS',    player:false },
];

const HOLE_LABELS = ['1ST','2ND','3RD','4TH','5TH','6TH','7TH','8TH','9TH'];

function relPar(n){
  return n<=-2?'EAGLE!':n===-1?'BIRDIE':n===0?'PAR':n===1?'BOGEY':n===2?'DBL BOGEY':`+${n}`;
}
function relParColor(n){
  return n<0?'#ffe050':n===0?'#ffffff':n===1?'#ff9040':'#ff4040';
}
function scoreDisp(n){
  return n===0?' E':(n>0?'+':'')+n;
}

// ═══════════════════════════════════════════════════════════════
//  TITLE SCENE
// ═══════════════════════════════════════════════════════════════
class TitleScene extends Phaser.Scene {
  constructor(){ super({ key:'TitleScene' }); }

  create(){
    // World extends 320px above the normal viewport so we can pan down
    const SKY_EXTRA = 320;

    // ── Extended sky backdrop ──────────────────────────────────
    const g = this.add.graphics();
    // Deep sky (above normal view)
    g.fillStyle(C.skyT); g.fillRect(0, -SKY_EXTRA, W, SKY_EXTRA + 80);
    g.fillStyle(C.skyB); g.fillRect(0, -SKY_EXTRA + 80, W, SKY_EXTRA);

    // ── Clouds (drifting slowly right) ────────────────────────
    this.clouds = [];
    const cloudDefs = [
      { x:90,  y:-290, rx:55, ry:18, a:0.70, spd:10 },
      { x:310, y:-255, rx:44, ry:14, a:0.55, spd:7  },
      { x:500, y:-275, rx:62, ry:20, a:0.65, spd:12 },
      { x:200, y:-200, rx:38, ry:13, a:0.45, spd:8  },
      { x:580, y:-220, rx:50, ry:16, a:0.60, spd:9  },
    ];
    cloudDefs.forEach(cd => {
      const c = this.add.ellipse(cd.x, cd.y, cd.rx*2, cd.ry*2, C.white, cd.a);
      this.clouds.push({ obj:c, spd:cd.spd, baseX:cd.x });
    });

    // ── Birds ─────────────────────────────────────────────────
    this.birds = this._makeBirds();

    // ── Full course (normal y coords) ─────────────────────────
    this._buildCourse(g);
    this._buildFlagWave();

    // ── Camera setup: start high, pan down ───────────────────
    this.cameras.main.setScroll(0, -SKY_EXTRA);
    this.cameras.main.fadeIn(500, 0, 0, 0);

    // ── Title text (placed at course-level y, hidden at start) ─
    this.titleGroup = this._buildTitleGroup();
    this.titleGroup.setAlpha(0);

    // ── Start the pan after fade ──────────────────────────────
    this.time.delayedCall(550, () => {
      this.tweens.add({
        targets: this.cameras.main,
        scrollY: 0,
        duration: 3600,
        ease: 'Quad.easeInOut',
        onComplete: () => this._revealTitle(),
      });
    });

    // ── Input: SPACE fires announcer then starts game ─────────
    this.spaceReady = false;
    this.input.keyboard.on('keydown-SPACE', () => {
      if(!this.spaceReady) return;
      this.spaceReady = false;
      Sound.init();
      Sound.playTitleFanfare();
      // Stagger words to match title lines already on screen
      setTimeout(() => Sound.playAnnouncer(), 120);
      this.cameras.main.flash(180, 255, 255, 255);
      this.time.delayedCall(1900, () => this.scene.start('GameScene'));
    });

    this.elapsed = 0;
  }

  // ── Course drawing (identical palette to GameScene) ──────────
  _buildCourse(g){
    g.fillStyle(C.hill);
    g.fillTriangle(0,200, 173,112, 340,200);
    g.fillTriangle(267,200, 453,126, 640,200);
    g.fillStyle(C.rough);  g.fillRect(0, 197, W, H-197);
    g.fillStyle(C.fair);   g.fillEllipse(W/2, 290, 625, 174);
    g.fillStyle(C.fairDk);
    for(let i=0;i<28;i++) g.fillRect(16+i*21, 225+((i*11)%52), 11, 3);
    g.fillStyle(C.sand);   g.fillEllipse(490, 283, 96, 32);
    g.fillStyle(C.green);  g.fillEllipse(123, 192, 46, 13);
  }

  // ── Animated flag (pole + waving pennant) ────────────────────
  _buildFlagWave(){
    // Pole
    this.add.rectangle(122, 173, 3, 38, 0x666666).setOrigin(0.5, 1);
    // Flag pennant — rectangle anchored left to pole top, will tween scaleX
    this.flagPennant = this.add.rectangle(122, 154, 18, 11, C.flag).setOrigin(0, 0.5);
    this.tweens.add({
      targets: this.flagPennant,
      scaleX: 0.45,
      duration: 420,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    // Subtle vertical droop at minimum
    this.tweens.add({
      targets: this.flagPennant,
      y: 157,
      duration: 420,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  // ── Birds ─────────────────────────────────────────────────────
  _makeBirds(){
    const birds = [];
    const defs = [
      { x:W+30,  y:-240, spd:28, dir:-1, flapRate:320 },
      { x:W+110, y:-205, spd:19, dir:-1, flapRate:380 },
      { x:W+220, y:-175, spd:23, dir:-1, flapRate:290 },
      { x:-30,   y:-190, spd:16, dir: 1, flapRate:420 },
    ];
    defs.forEach(d => {
      const con = this.add.container(d.x, d.y);
      const body = this.add.rectangle(0, 0, 5, 2, 0x111111);
      // Wings as two rectangles that rotate around their inner edge
      const wL = this.add.rectangle(-5, 0, 8, 2, 0x111111).setOrigin(1, 0.5);
      const wR = this.add.rectangle( 5, 0, 8, 2, 0x111111).setOrigin(0, 0.5);
      con.add([body, wL, wR]);
      // Wing flap tween
      this.tweens.add({ targets:wL, rotation:-0.65, duration:d.flapRate, yoyo:true, repeat:-1, ease:'Sine.easeInOut' });
      this.tweens.add({ targets:wR, rotation: 0.65, duration:d.flapRate, yoyo:true, repeat:-1, ease:'Sine.easeInOut', delay:d.flapRate/2 });
      birds.push({ con, spd:d.spd, dir:d.dir });
    });
    return birds;
  }

  // ── Title text group ──────────────────────────────────────────
  _buildTitleGroup(){
    const con = this.add.container(0, 0);
    // Dark panel behind text
    con.add(this.add.rectangle(W/2, 175, 460, 148, 0x000000, 0.64));
    // Scanlines
    const sg = this.add.graphics();
    for(let y=100; y<250; y+=4) sg.fillStyle(0x000000,0.12).fillRect(W/2-230, y, 460, 2);
    con.add(sg);
    // Word 1
    this.titleW1 = this.add.text(W/2, 120, 'JUST', {
      fontFamily:'Courier New', fontSize:'42px', color:'#ffffff',
      stroke:'#000000', strokeThickness:5,
    }).setOrigin(0.5);
    // Word 2
    this.titleW2 = this.add.text(W/2 + 18, 164, "F'KN", {
      fontFamily:'Courier New', fontSize:'38px', color:'#ffdd44',
      stroke:'#000000', strokeThickness:5,
    }).setOrigin(0.5);
    // Word 3 (big)
    this.titleW3 = this.add.text(W/2, 212, 'GOLF', {
      fontFamily:'Courier New', fontSize:'54px', color:'#ffffff',
      stroke:'#113300', strokeThickness:7,
    }).setOrigin(0.5).setScale(1.4).setScale(1);
    // Decorative line
    this.titleLine = this.add.rectangle(W/2, 238, 0, 2, C.lbGold);
    // Press start
    this.pressStart = this.add.text(W/2, 262, 'PRESS  SPACE  TO  START', {
      fontFamily:'Courier New', fontSize:'13px', color:'#9cff9c',
      stroke:'#000', strokeThickness:2,
    }).setOrigin(0.5).setAlpha(0);
    // Version tag
    con.add(this.add.text(W-8, H-10, 'v0.5', {
      fontFamily:'Courier New', fontSize:'9px', color:'#444444',
    }).setOrigin(1));
    con.add([this.titleW1, this.titleW2, this.titleW3, this.titleLine, this.pressStart]);
    return con;
  }

  // ── Title reveal sequence (fires when camera pan finishes) ────
  _revealTitle(){
    // Fade in the whole group
    this.tweens.add({ targets:this.titleGroup, alpha:1, duration:300 });

    // Stagger each word
    this.titleW1.setAlpha(0).setY(128);
    this.titleW2.setAlpha(0).setY(172);
    this.titleW3.setAlpha(0).setScale(1.5);

    this.time.delayedCall(100, () => {
      this.tweens.add({ targets:this.titleW1, alpha:1, y:120, duration:380, ease:'Quad.easeOut' });
    });
    this.time.delayedCall(480, () => {
      this.tweens.add({ targets:this.titleW2, alpha:1, y:164, duration:340, ease:'Quad.easeOut' });
    });
    this.time.delayedCall(860, () => {
      this.tweens.add({ targets:this.titleW3, alpha:1, scaleX:1, scaleY:1, duration:220, ease:'Back.easeOut' });
      this.cameras.main.shake(120, 0.004);
    });
    // Underline sweeps in
    this.time.delayedCall(1100, () => {
      this.tweens.add({ targets:this.titleLine, width:360, duration:350, ease:'Quad.easeOut' });
    });
    // Press start fades in, then blinks
    this.time.delayedCall(1500, () => {
      this.tweens.add({ targets:this.pressStart, alpha:1, duration:400, onComplete:() => {
        this.tweens.add({ targets:this.pressStart, alpha:0.25, duration:550, yoyo:true, repeat:-1 });
        this.spaceReady = true;
      }});
    });
  }

  update(_, delta){
    this.elapsed += delta;
    // Drift clouds left→right
    this.clouds.forEach(c => {
      c.obj.x += c.spd * delta * 0.001;
      if(c.obj.x > W + 80) c.obj.x = -80;
    });
    // Move birds
    this.birds.forEach(b => {
      b.con.x += b.dir * b.spd * delta * 0.001;
      // Gentle vertical undulation
      b.con.y += Math.sin(this.elapsed * 0.001 + b.spd) * 0.18;
      // Wrap off-screen
      if(b.dir < 0 && b.con.x < -60) b.con.x = W + 60;
      if(b.dir > 0 && b.con.x > W + 60) b.con.x = -60;
    });
  }
}

// ═══════════════════════════════════════════════════════════════
//  GAME SCENE
// ═══════════════════════════════════════════════════════════════
class GameScene extends Phaser.Scene {
  constructor(){ super({ key:'GameScene' }); }

  create(){
    // Restore or init game state
    const saved = this.registry.get('gd');
    if(saved){
      this.gd = saved;
      this.gd.hole++;
      if(this.gd.hole > this.gd.maxHoles){ this.showVictory(); return; }
    } else {
      this.gd = {
        hole:1, maxHoles:9,
        strikes:0,
        combo:1, totalPayout:0, consecutiveCrits:0,
        golferScores: GOLFER_ROSTER.map(()=>0),
      };
      this.registry.set('gd', this.gd);
    }

    this.swingState = 'idle';
    this.swingT = 0;
    this.heckled = false;
    this.holeResult = null;
    this.crowdT = 0;
    this.crowdExcite = 0;

    this.buildCourse();
    this.buildCrowd();
    this.buildGolfer();
    this.buildCaddy();
    this.buildBall();
    this.buildTimingBar();
    this.buildStrikeIndicator();
    this.buildHUD();

    this.input.keyboard.on('keydown-SPACE', ()=> this.onHeckle());
    this.input.keyboard.on('keydown-R', ()=>{ Sound.init();
      this.registry.remove('gd');
      this.scene.start('GameScene');
    });

    this.time.delayedCall(700, ()=> this.beginSwing());
  }

  // ── COURSE ───────────────────────────────────────────────────
  buildCourse(){
    const g = this.add.graphics();
    // sky
    g.fillStyle(C.skyT); g.fillRect(0, 0, W, 75);
    g.fillStyle(C.skyB); g.fillRect(0, 75, W, 130);
    // hills
    g.fillStyle(C.hill);
    g.fillTriangle(0,200, 173,112, 340,200);
    g.fillTriangle(267,200, 453,126, 640,200);
    // ground
    g.fillStyle(C.rough);  g.fillRect(0, 197, W, H-197);
    g.fillStyle(C.fair);   g.fillEllipse(W/2, 290, 625, 174);
    g.fillStyle(C.fairDk);
    for(let i=0;i<28;i++) g.fillRect(16+i*21, 225+((i*11)%52), 11, 3);
    // sand trap
    g.fillStyle(C.sand);   g.fillEllipse(490, 283, 96, 32);
    // distant green + flag
    g.fillStyle(C.green);  g.fillEllipse(123, 192, 46, 13);
    g.fillStyle(0x666666); g.fillRect(121, 154, 3, 38);
    g.fillStyle(C.flag);   g.fillTriangle(124,154, 138,161, 124,168);
    // hole sign
    g.fillStyle(0x2a1a08); g.fillRect(8, 264, 62, 30);
    g.fillStyle(C.lbGold); g.fillRect(9, 265, 60, 28);
    this.add.text(39, 279, HOLE_LABELS[(this.gd.hole-1)%9]+' HOLE', {
      fontFamily:'Courier New', fontSize:'9px', color:'#1a0a00',
    }).setOrigin(0.5);
  }

  // ── CROWD ────────────────────────────────────────────────────
  buildCrowd(){
    const g = this.add.graphics();
    g.fillStyle(0x3a2510); g.fillRect(0, 208, W, 3);
    this.crowdHeads = [];
    for(let row=0; row<2; row++){
      for(let i=0; i<36; i++){
        const x = 9+i*17+row*9, y = 196-row*12;
        const col = C.cr[(i+row*3)%C.cr.length];
        const h = this.add.rectangle(x, y, 12, 12, col);
        const f = this.add.rectangle(x, y+3, 8, 5, C.gSkin);
        this.crowdHeads.push({h, f, by:y, ph:i*0.38+row});
      }
    }
  }

  // ── GOLFER ───────────────────────────────────────────────────
  buildGolfer(){
    const gx=336, gy=293;
    this.gc = this.add.container(gx, gy);
    this.gShadow = this.add.ellipse(0, 3, 38, 8, 0, 0.3);
    this.gLL = this.add.rectangle(-5,-13, 7,27, C.gPants);
    this.gRL = this.add.rectangle( 5,-13, 7,27, C.gPants);
    this.gTo = this.add.rectangle( 0,-37,19,24, C.gShirt);
    this.gHd = this.add.rectangle( 0,-56,13,13, C.gSkin);
    this.gHt = this.add.rectangle( 0,-64,16, 5, C.gHat);
    this.gBr = this.add.rectangle( 5,-61, 8, 3, C.gHat);
    this.gEB = this.add.rectangle( 0,-60,11, 3, C.black).setAlpha(0);
    this.gAr = this.add.container(0, -43);
    this.gAr.add([this.add.rectangle(-3,8,5,19,C.gSkin), this.add.rectangle(3,8,5,19,C.gSkin)]);
    this.gCl = this.add.container(0, -43);
    this.gCl.add([this.add.rectangle(0,29,3,61,C.gClub), this.add.rectangle(-4,61,11,5,C.gClub)]);
    this.gCl.setRotation(-0.3);
    this.gc.add([this.gShadow,this.gLL,this.gRL,this.gTo,this.gHd,this.gHt,this.gBr,this.gEB,this.gAr,this.gCl]);
    this.gReact = this.add.text(gx+14,gy-74,'',{fontFamily:'Courier New',fontSize:'13px',color:'#ff6060',stroke:'#000',strokeThickness:2}).setAlpha(0);
    this.tiltWarn = this.add.text(W/2,105,'⚠  TILTING  ⚠',{fontFamily:'Courier New',fontSize:'17px',color:'#ff4400',stroke:'#000',strokeThickness:3}).setOrigin(0.5).setAlpha(0);
  }

  // ── CADDY ────────────────────────────────────────────────────
  buildCaddy(){
    const cx=267, cy=293;
    this.cX=cx; this.cY=cy;
    this.cc = this.add.container(cx, cy);
    this.cSh = this.add.ellipse(0, 3, 29, 7, 0, 0.3);
    this.cLL = this.add.rectangle(-4,-12, 5,24, C.cPants);
    this.cRL = this.add.rectangle( 4,-12, 5,24, C.cPants);
    this.cTo = this.add.rectangle( 0,-35,16,21, C.cShirt);
    this.cBi = this.add.rectangle( 0,-35,12,19, C.cBib);
    this.cHd = this.add.rectangle( 0,-53,12,12, C.cSkin);
    this.cCp = this.add.rectangle( 0,-61,15, 4, C.cCap);
    this.cVi = this.add.rectangle(-5,-59, 7, 3, C.cCap);
    this.cAL = this.add.container(-8,-40); this.cAL.add(this.add.rectangle(0,7,4,16,C.cSkin));
    this.cAR = this.add.container( 8,-40); this.cAR.add(this.add.rectangle(0,7,4,16,C.cSkin));
    const bag = this.add.container(19,-11);
    bag.add([
      this.add.rectangle(0, 0,11,29, C.cBag),
      this.add.rectangle(0,-19,12, 5, 0x604020),
      this.add.rectangle(-3,-24, 3,11, C.gClub),
      this.add.rectangle( 1,-23, 3,10, C.gClub),
      this.add.rectangle( 4,-22, 3, 9, C.gClub),
    ]);
    this.cc.add([this.cSh,this.cLL,this.cRL,this.cTo,this.cBi,this.cHd,this.cCp,this.cVi,this.cAL,this.cAR,bag]);
    this.hTxt = this.add.text(cx-12,cy-86,'',{fontFamily:'Courier New',fontSize:'16px',color:'#ffff55',stroke:'#000',strokeThickness:3}).setOrigin(0.5).setAlpha(0);
    this.catchTxt = this.add.text(cx,cy-96,'!!',{fontFamily:'Courier New',fontSize:'20px',color:'#ff3030',stroke:'#000',strokeThickness:3}).setOrigin(0.5).setAlpha(0);
  }

  // ── BALL ─────────────────────────────────────────────────────
  buildBall(){
    this.ball   = this.add.circle(363, 295, 3.5, C.white);
    this.ballSh = this.add.ellipse(363, 298, 8, 3, 0, 0.35);
  }

  // ── TIMING BAR ───────────────────────────────────────────────
  buildTimingBar(){
    this.tb = { x:93, y:H-37, w:W-186, h:14 };
    this.tbBg   = this.add.rectangle(this.tb.x,this.tb.y,this.tb.w,this.tb.h,C.uBg).setOrigin(0,0.5).setStrokeStyle(1,C.white);
    this.tbFill = this.add.rectangle(this.tb.x,this.tb.y,0,this.tb.h-2,C.uGood).setOrigin(0,0.5);
    this.tbGood = this.add.rectangle(this.tb.x,this.tb.y,0,this.tb.h-2,C.uBad,0.45).setOrigin(0,0.5);
    this.tbCrit = this.add.rectangle(this.tb.x,this.tb.y,0,this.tb.h,C.uCrit,0.85).setOrigin(0,0.5);
    this.tbHead = this.add.rectangle(this.tb.x,this.tb.y,3,this.tb.h+9,C.white).setOrigin(0.5);
    this.tbLG   = this.add.text(0,this.tb.y+12,'HECKLE',{fontFamily:'Courier New',fontSize:'10px',color:'#ff8040'}).setOrigin(0.5).setAlpha(0);
    this.tbLC   = this.add.text(0,this.tb.y+12,'PERFECT',{fontFamily:'Courier New',fontSize:'10px',color:'#ffff30'}).setOrigin(0.5).setAlpha(0);
    [this.tbBg,this.tbFill,this.tbGood,this.tbCrit,this.tbHead,this.tbLG,this.tbLC].forEach(o=>o.setVisible(false));
  }

  // ── STRIKE INDICATOR ─────────────────────────────────────────
  buildStrikeIndicator(){
    // Three boxes top-right, like a three-strike counter
    const bw=22, bh=22, gap=6;
    const startX = W - 8 - (3*bw + 2*gap);
    const sy = 14;
    this.add.text(startX-6, sy,'CAUGHT:', {fontFamily:'Courier New',fontSize:'12px',color:'#dddddd',stroke:'#000',strokeThickness:1}).setOrigin(1,0.5);
    this.strikeBgs  = [];
    this.strikeMarks = [];
    for(let i=0;i<MAX_STRIKES;i++){
      const bx = startX + i*(bw+gap);
      const bg = this.add.rectangle(bx,sy,bw,bh,0x222222).setOrigin(0,0.5).setStrokeStyle(1,0x888888);
      const mk = this.add.text(bx+bw/2,sy,'X',{fontFamily:'Courier New',fontSize:'14px',color:'#ff3030',stroke:'#000',strokeThickness:2}).setOrigin(0.5).setAlpha(0);
      this.strikeBgs.push(bg);
      this.strikeMarks.push(mk);
    }
  }

  refreshStrikeIndicator(){
    const s = this.gd.strikes;
    for(let i=0;i<MAX_STRIKES;i++){
      if(i < s){
        this.strikeBgs[i].fillColor = 0x550000;
        this.strikeBgs[i].setStrokeStyle(1,0xff3030);
        this.strikeMarks[i].setAlpha(1);
      } else {
        this.strikeBgs[i].fillColor = 0x222222;
        this.strikeBgs[i].setStrokeStyle(1,0x888888);
        this.strikeMarks[i].setAlpha(0);
      }
    }
    // Flash 2nd box when on 2 strikes as a warning
    if(s === 2){
      this.tweens.add({targets:this.strikeBgs[1],alpha:0.3,duration:180,yoyo:true,repeat:3,onComplete:()=>this.strikeBgs[1].setAlpha(1)});
    }
    // Angry brow based on strike count
    this.gEB.setAlpha(s === 0 ? 0 : s === 1 ? 0.5 : 1.0);
  }

  // ── HUD ──────────────────────────────────────────────────────
  buildHUD(){
    this.holeTxt   = this.add.text(10,12,'',{fontFamily:'Courier New',fontSize:'14px',color:'#ffffff',stroke:'#000',strokeThickness:2});
    this.payTxt    = this.add.text(10,30,'',{fontFamily:'Courier New',fontSize:'14px',color:'#ffe050',stroke:'#000',strokeThickness:2});
    this.comboTxt  = this.add.text(10,48,'',{fontFamily:'Courier New',fontSize:'13px',color:'#ff9040',stroke:'#000',strokeThickness:2});
    this.promptTxt = this.add.text(W/2,H-16,'',{fontFamily:'Courier New',fontSize:'13px',color:'#9cff9c',stroke:'#000',strokeThickness:2}).setOrigin(0.5);
    this.refreshHUD();
  }

  refreshHUD(){
    const d = this.gd;
    this.holeTxt.setText(`HOLE ${d.hole} / ${d.maxHoles}`);
    this.payTxt.setText(`WAGER: $${d.totalPayout}`);
    this.comboTxt.setText(d.combo > 1 ? `COMBO ×${d.combo} 🔥` : '');
    this.promptTxt.setText('SPACE = HECKLE');
    this.refreshStrikeIndicator();
  }

  // ── SWING CONTROL ────────────────────────────────────────────
  beginSwing(){
    this.swingState='swinging';
    this.swingT=0; this.heckled=false; this.holeResult=null;
    const h = this.gd.hole;
    this.swingDur = Math.max(1100, 2400 - h*135);
    const ww = Math.max(0.10, 0.22 - h*0.013);
    const ws = Phaser.Math.FloatBetween(0.40, 0.82-ww);
    const we = ws+ww, cm=(ws+we)/2, cw=ww*CRIT_FRAC;
    this.win = { s:ws, e:we, cs:cm-cw/2, ce:cm+cw/2 };
    this.tbGood.x = this.tb.x + this.tb.w*ws;
    this.tbGood.width = this.tb.w*ww;
    this.tbCrit.x = this.tb.x + this.tb.w*this.win.cs;
    this.tbCrit.width = this.tb.w*cw;
    this.tbLG.x = this.tb.x + this.tb.w*(ws + ww*0.22);
    this.tbLC.x = this.tb.x + this.tb.w*cm;
    [this.tbBg,this.tbFill,this.tbGood,this.tbCrit,this.tbHead,this.tbLG,this.tbLC].forEach(o=>o.setVisible(true));
    this.tbLG.setAlpha(0.9); this.tbLC.setAlpha(1);
    this.promptTxt.setText('SPACE = HECKLE');
    if(this.gd.consecutiveCrits >= 2){
      this.tiltWarn.setAlpha(0.95);
      this.tweens.add({targets:this.tiltWarn, alpha:0, duration:1400, delay:700});
      this.cameras.main.shake(90,0.003);
    }
  }

  onHeckle(){
    if(this.swingState!=='swinging'||this.heckled) return;
    this.heckled = true;
    const t = this.swingT / this.swingDur;
    const w = this.win;
    let res;
    if(t>=w.cs && t<=w.ce)    res='CRITICAL';
    else if(t>=w.s && t<=w.e) res='GOOD';
    else                       res='MISS';
    this.holeResult = res;
    Sound.init();
    const types = res==='MISS' ? ['cough'] : ['cough','airhorn','sneeze'];
    const chosenType = Phaser.Utils.Array.GetRandom(types);
    if(chosenType === 'airhorn') Sound.playAirHorn(); else Sound.playCough();
    this.animCaddyHeckle(chosenType, res);
    if(res !== 'MISS') this.golferFlinch(res);
    else               this.suspSpike();
  }

  // ── CADDY ANIMATIONS ─────────────────────────────────────────
  animCaddyHeckle(type, res){
    const LINES = {
      CRITICAL:['"Noonan…"','*barely a cough*','   *whistles innocently*'],
      GOOD:    ['"MISS IT!"','*COUGH*','"YOU\'RE A BUM!"','"NOONAN!"'],
      MISS:    ['"...uh"','*weak cough*','"...nice day?"'],
    };
    const line = Phaser.Utils.Array.GetRandom(LINES[res]);
    this.hTxt.setText(line).setX(this.cX-12).setY(this.cY-86).setAlpha(1);
    this.tweens.add({targets:this.hTxt, y:this.cY-102, alpha:0, duration:1200, ease:'Quad.easeOut'});
    if(type==='airhorn') this.animAirHorn();
    else                 this.animCough(res);
  }

  animCough(res){
    const reps = res==='CRITICAL' ? 1 : 2;
    this.tweens.add({targets:this.cc, y:this.cY+4, duration:100, yoyo:true, repeat:reps, onComplete:()=>this.cc.y=this.cY});
    this.tweens.add({targets:this.cAR, rotation:-1.2, duration:80, yoyo:true, repeat:reps});
    if(res!=='MISS') this.cameras.main.shake(res==='CRITICAL'?200:120, res==='CRITICAL'?0.005:0.003);
  }

  animAirHorn(){
    this.tweens.add({targets:this.cAR, rotation:-2.4, duration:90, yoyo:true, repeat:1});
    const horn = this.add.rectangle(this.cX+10, this.cY-54, 16, 6, 0xffaa00);
    this.tweens.add({targets:horn, x:this.cX+28, alpha:0, duration:450, ease:'Quad.easeOut', onComplete:()=>horn.destroy()});
    this.cameras.main.shake(220, 0.007);
  }

  golferFlinch(res){
    const jerk = res==='CRITICAL' ? 0.65 : 0.35;
    this.tweens.add({targets:this.gCl, rotation:`+=${jerk}`, duration:70, yoyo:true});
    this.tweens.add({targets:this.gTo, x:'+=3', duration:60, yoyo:true});
    const sw = this.add.text(this.gc.x+14, this.gc.y-68, '💦', {fontSize:'14px'});
    this.tweens.add({targets:sw, y:sw.y+13, alpha:0, duration:550, onComplete:()=>sw.destroy()});
    const rs = res==='CRITICAL'
      ? ['SHANK!!','OH NO—','FORE!!!!!']
      : ['"Wha—"','"AUGH!"','"Not again!"'];
    this.gReact.setText(Phaser.Utils.Array.GetRandom(rs)).setAlpha(1).y = this.gc.y-74;
    this.tweens.add({targets:this.gReact, y:this.gc.y-90, alpha:0, duration:1000, onComplete:()=>this.gReact.y=this.gc.y-74});
  }

  suspSpike(){
    this.tweens.add({targets:this.cc, x:this.cX-4, duration:60, yoyo:true, repeat:3, onComplete:()=>this.cc.x=this.cX});
    this.catchTxt.setAlpha(1).setX(this.cX).setY(this.cY-96);
    this.tweens.add({targets:this.catchTxt, y:this.cY-112, alpha:0, duration:800});
    this.gReact.setText('"Hey…"').setAlpha(1).y = this.gc.y-74;
    this.tweens.add({targets:this.gReact, alpha:0, delay:600, duration:700, onComplete:()=>this.gReact.y=this.gc.y-74});
    this.cameras.main.shake(90, 0.003);
  }

  // ── SWING ANIMATION ──────────────────────────────────────────
  animSwing(t){
    let cr,ar,ty;
    if(t < 0.38)     { cr=-0.3;               ar=0;          ty=-37; }
    else if(t < 0.73){ const k=(t-0.38)/0.35; cr=-0.3-k*2.3; ar=-k*0.8; ty=-37-Math.sin(k*Math.PI)*1.5; }
    else if(t < 0.80){ cr=-2.6;               ar=-0.8;       ty=-38.5; }
    else             { const k=(t-0.80)/0.20; cr=-2.6+k*4.2; ar=-0.8+k*1.5; ty=-37; }
    this.gCl.setRotation(cr);
    this.gAr.setRotation(ar);
    this.gTo.y = ty;
  }

  // ── UPDATE ───────────────────────────────────────────────────
  update(time, delta){
    this.crowdT += delta;
    const exc = this.crowdExcite || 0;
    if(this.crowdHeads) for(const h of this.crowdHeads){
      const b = Math.sin((this.crowdT + h.ph*180)/280) * (0.8 + exc*3);
      h.h.y = h.by + b;
      h.f.y = h.by + 3 + b;
    }
    if(exc > 0) this.crowdExcite = Math.max(0, exc - delta*0.001);

    // flash 3rd strike box danger at 2 strikes
    if(this.gd && this.gd.strikes === 2 && this.strikeBgs){
      this.strikeBgs[2].setAlpha((Math.sin(time*0.01)+1)*0.4+0.2);
    }

    if(this.swingState !== 'swinging') return;
    this.swingT += delta;
    const t = Math.min(1, this.swingT / this.swingDur);
    this.animSwing(t);
    this.cc.y = this.cY + Math.sin(this.swingT*0.0015)*1;
    this.cAL.rotation = Math.sin(this.swingT*0.001)*0.12;
    this.tbFill.width = this.tb.w * t;
    this.tbHead.x = this.tb.x + this.tb.w * t;
    const w = this.win;
    this.tbFill.fillColor = t>=w.cs&&t<=w.ce ? C.uCrit : t>=w.s&&t<=w.e ? C.uWarn : C.uGood;
    if(t >= 1) this.resolveSwing();
  }

  // ── RESOLVE ──────────────────────────────────────────────────
  resolveSwing(){
    this.swingState = 'result';
    [this.tbBg,this.tbFill,this.tbGood,this.tbCrit,this.tbHead,this.tbLG,this.tbLC].forEach(o=>o.setVisible(false));
    const res = this.holeResult || 'IDLE';
    const d   = this.gd;

    // Strikes
    if(res === 'MISS'){     d.strikes = Math.min(d.strikes + 1, MAX_STRIKES); Sound.playStrike(); }
    if(res === 'CRITICAL') d.strikes = Math.max(d.strikes - 1, 0);

    // Combo
    if(res === 'MISS')      d.combo = 1;
    else if(res !== 'IDLE') d.combo = Math.min(d.combo + 1, MAX_COMBO);

    // Payout
    const earned = PAYOUT[res] * d.combo;
    d.totalPayout += earned;

    // Consecutive crits
    d.consecutiveCrits = res === 'CRITICAL' ? d.consecutiveCrits + 1 : 0;

    // Hole score for tournament
    let holeScore;
    if(res==='CRITICAL')    holeScore = +2;
    else if(res==='GOOD')   holeScore = +1;
    else                    holeScore = Phaser.Math.Between(-1, 0);
    d.golferScores = d.golferScores.map((s,i) => {
      if(GOLFER_ROSTER[i].player) return s + holeScore;
      const bias = i===1 ? -1 : 0;
      return s + Phaser.Math.Between(-1+bias, 1+bias);
    });

    this.refreshHUD();
    if(res==='CRITICAL'||res==='GOOD') this.crowdExcite = 1;

    // Ball animation
    if(res==='CRITICAL'){
      Sound.playShank();
      Sound.playCrowdCheer();
      this.tweens.add({targets:[this.ball,this.ballSh], x:'+=76', y:'+=-42', duration:380, ease:'Quad.easeOut',
        onComplete:()=>this.tweens.add({targets:[this.ball,this.ballSh], y:'+=45', duration:320, ease:'Bounce.easeOut'})});
      this.promptTxt.setText(`MASSIVE SHANK!${earned ? `  +$${earned}` : ''}  [SPACE]`);
    } else if(res==='GOOD'){
      Sound.playCrowdCheer();
      this.tweens.add({targets:[this.ball,this.ballSh], x:'+=26', y:'+=-16', duration:300, ease:'Quad.easeOut',
        onComplete:()=>this.tweens.add({targets:[this.ball,this.ballSh], y:'+=18', duration:250, ease:'Bounce.easeOut'})});
      this.promptTxt.setText(`Flinched!  +$${earned}  [SPACE]`);
    } else if(res==='MISS'){
      this.promptTxt.setText('He noticed…  Strike added!  [SPACE]');
    } else {
      this.tweens.add({targets:[this.ball,this.ballSh], x:123, y:192, scale:0.5, duration:1100, ease:'Quad.easeOut'});
      this.promptTxt.setText('Clean shot. No strikes.  [SPACE]');
    }

    // Game over checks
    if(d.strikes >= MAX_STRIKES){
      this.time.delayedCall(1300, ()=> this.gameOverEjected()); return;
    }
    if(d.consecutiveCrits >= RAGE_LIMIT){
      this.time.delayedCall(1000, ()=> this.gameOverRageQuit()); return;
    }

    this.input.keyboard.once('keydown-SPACE', ()=> this.goToLeaderboard(res, holeScore, earned));
  }

  goToLeaderboard(res, holeScore, earned){
    this.registry.set('gd', this.gd);
    this.registry.set('lastHole', {res, holeScore, earned, holeNum:this.gd.hole});
    this.scene.start('LeaderboardScene');
  }

  // ── GAME OVERS ───────────────────────────────────────────────
  gameOverEjected(){
    this.swingState = 'over';
    this.tweens.add({targets:this.cAL, rotation:-2.2, duration:200});
    this.tweens.add({targets:this.cAR, rotation: 2.2, duration:200});
    this.time.delayedCall(550, ()=> this.showOverlay(
      '⛳  EJECTED FROM THE COURSE',
      '"That caddy is out of here!"',
      `Holes: ${this.gd.hole}/9   Wager collected: $${this.gd.totalPayout}`,
      '#ff3030'
    ));
  }

  gameOverRageQuit(){
    this.swingState = 'over';
    this.tweens.add({targets:this.gCl, rotation:1.8, duration:160, onComplete:()=>{
      const slam = this.add.rectangle(this.gc.x+14, this.gc.y+3, 5, 40, C.gClub).setRotation(0.4);
      this.tweens.add({targets:slam, y:this.gc.y+22, alpha:0, duration:700, ease:'Bounce.easeOut', onComplete:()=>slam.destroy()});
    }});
    this.tweens.add({targets:this.gc, x:this.gc.x+80, duration:1400, ease:'Quad.easeIn'});
    this.time.delayedCall(1400, ()=> this.showOverlay(
      '🏌️  GOLFER HAS WITHDRAWN',
      '"I QUIT! I know it was YOU!"',
      'Wager voided.  You\'re fired.   $0',
      '#ff8800'
    ));
  }

  showOverlay(title, sub, stat, col){
    this.add.rectangle(W/2,H/2, W,H, 0,0.85);
    this.add.text(W/2,H/2-50, title,{fontFamily:'Courier New',fontSize:'17px',color:col,stroke:'#000',strokeThickness:3}).setOrigin(0.5);
    this.add.text(W/2,H/2-22, sub,  {fontFamily:'Courier New',fontSize:'13px',color:'#ffaa40'}).setOrigin(0.5);
    this.add.text(W/2,H/2+ 4, stat, {fontFamily:'Courier New',fontSize:'14px',color:'#ffffff'}).setOrigin(0.5);
    this.add.text(W/2,H/2+48, 'press R to try again',{fontFamily:'Courier New',fontSize:'13px',color:'#666666'}).setOrigin(0.5);
    this.input.keyboard.on('keydown-R',()=>{ this.registry.remove('gd'); this.scene.start('GameScene'); });
  }

  showVictory(){
    const d = this.gd;
    const total = d.totalPayout + SURVIVAL_BONUS;
    const grade =
      total>=450?'🏆 LEGENDARY SABOTEUR'   :
      total>=300?'🎖  CUNNING CONSPIRATOR'  :
      total>=175?'😏 CRAFTY CADDY'          :
      total>=100?'🙄 SHAKY BEGINNER'        :
                 '😇 SUSPICIOUSLY POLITE';
    this.add.rectangle(W/2,H/2, W,H, 0,0.85);
    this.add.text(W/2,H/2-62,'— ROUND COMPLETE —',     {fontFamily:'Courier New',fontSize:'20px',color:'#ffe050',stroke:'#000',strokeThickness:2}).setOrigin(0.5);
    this.add.text(W/2,H/2-34,`Wager collected: $${d.totalPayout}`, {fontFamily:'Courier New',fontSize:'14px',color:'#9cff9c'}).setOrigin(0.5);
    this.add.text(W/2,H/2-14,`Survival bonus:  +$${SURVIVAL_BONUS}`,{fontFamily:'Courier New',fontSize:'14px',color:'#9cff9c'}).setOrigin(0.5);
    this.add.text(W/2,H/2+ 8,`TOTAL: $${total}`,       {fontFamily:'Courier New',fontSize:'18px',color:'#ffe050',stroke:'#000',strokeThickness:2}).setOrigin(0.5);
    this.add.text(W/2,H/2+32, grade,                    {fontFamily:'Courier New',fontSize:'16px',color:'#ffcc00',stroke:'#000',strokeThickness:2}).setOrigin(0.5);
    this.add.text(W/2,H/2+56,`Strikes at finish: ${d.strikes} / ${MAX_STRIKES}`,{fontFamily:'Courier New',fontSize:'11px',color:d.strikes>1?'#ff8040':'#30ff30'}).setOrigin(0.5);
    this.add.text(W/2,H/2+76,'press R to play again',   {fontFamily:'Courier New',fontSize:'12px',color:'#555555'}).setOrigin(0.5);
    this.input.keyboard.on('keydown-R',()=>{ this.registry.remove('gd'); this.scene.start('GameScene'); });
  }
}

// ═══════════════════════════════════════════════════════════════
//  LEADERBOARD SCENE
// ═══════════════════════════════════════════════════════════════
class LeaderboardScene extends Phaser.Scene {
  constructor(){ super({ key:'LeaderboardScene' }); }

  create(){
    this.gd   = this.registry.get('gd');
    this.last = this.registry.get('lastHole');
    this.readyToContinue = false;
    const d=this.gd, lh=this.last;

    // Background
    this.add.rectangle(W/2,H/2,W,H,C.lbBg);
    const g=this.add.graphics();
    g.fillStyle(0x0f0802,0.45);
    for(let i=0;i<11;i++) g.fillRect(0,i*34,W,17);

    // Title bar
    this.add.rectangle(W/2,20,W,40,C.lbWood);
    this.add.text(W/2,20,'GREENWOOD INVITATIONAL',{fontFamily:'Courier New',fontSize:'16px',color:'#d4a820',stroke:'#000',strokeThickness:2}).setOrigin(0.5);
    this.add.text(W-12,20,`THRU ${lh.holeNum}`,{fontFamily:'Courier New',fontSize:'11px',color:'#a08040'}).setOrigin(1,0.5);

    // Sorted leaderboard
    const entries = GOLFER_ROSTER.map((r,i)=>({...r, score:d.golferScores[i]}));
    entries.sort((a,b)=>a.score-b.score);

    const bx=14, by=46, rh=28, bw=W-28;
    this.add.rectangle(bx+bw/2, by+entries.length*rh/2, bw, entries.length*rh, C.lbWood);

    this.playerRow = null;
    entries.forEach((e,rank)=>{
      const ry = by + rank*rh;
      const isP = e.player;
      const rowBg = this.add.rectangle(bx+bw/2,ry+rh/2,bw,rh-2,isP?0x2a2000:rank%2===0?C.lbRow:C.lbRowAlt);
      if(isP) rowBg.setStrokeStyle(2,C.lbGold);
      // Rank
      this.add.text(bx+10,ry+rh/2,`${rank+1}`,{fontFamily:'Courier New',fontSize:'13px',color:isP?C.lbHi:C.lbText}).setOrigin(0,0.5);
      // Name
      this.add.text(bx+28,ry+rh/2,e.name,{fontFamily:'Courier New',fontSize:'13px',color:isP?'#ffe050':C.lbText}).setOrigin(0,0.5);
      // Score card
      const sdStr = scoreDisp(e.score);
      const cardX = bx+bw-8;
      const cardBg  = this.add.rectangle(cardX,ry+rh/2,36,rh-6,isP?C.lbCard:0x404040).setOrigin(1,0.5);
      const cardTxt = this.add.text(cardX-18,ry+rh/2,sdStr,{fontFamily:'Courier New',fontSize:'13px',
        color:e.score<0?'#ffe050':e.score===0?'#ffffff':'#ff6040'}).setOrigin(0.5);
      if(isP) this.playerRow = { ry:ry+rh/2, cardBg, cardTxt };
    });

    // Hole result banner
    const hlabel = relPar(lh.holeScore);
    const hcol   = relParColor(lh.holeScore);
    this.resultBanner = this.add.container(W/2, H+40);
    this.resultBanner.add([
      this.add.rectangle(0,0,260,34,C.lbWood).setStrokeStyle(2,C.lbGold),
      this.add.text(0,0,`${HOLE_LABELS[lh.holeNum-1]} HOLE: ${hlabel}`,
        {fontFamily:'Courier New',fontSize:'16px',color:hcol,stroke:'#000',strokeThickness:2}).setOrigin(0.5),
    ]);

    // Payout line
    this.payLine = this.add.text(W/2,H-10,
      lh.earned>0
        ? `+$${lh.earned} (×${d.combo} combo)   |   Total: $${d.totalPayout}`
        : `Total: $${d.totalPayout}`,
      {fontFamily:'Courier New',fontSize:'12px',color:'#ffe050'}).setOrigin(0.5).setAlpha(0);

    this.promptLb = this.add.text(W/2,H-28,'',{fontFamily:'Courier New',fontSize:'12px',color:'#888888'}).setOrigin(0.5).setAlpha(0);

    // Attendant silhouette (right side, will walk to player row)
    this.attendant = this.buildAttendant(W+30);

    // Sequence
    this.time.delayedCall(180, ()=>{
      this.tweens.add({targets:this.resultBanner, y:H-58, duration:440, ease:'Back.easeOut'});
      this.time.delayedCall(560, ()=>{
        this.tweens.add({targets:this.payLine, alpha:1, duration:320});
        this.runAttendantSequence();
      });
    });

    this.input.keyboard.on('keydown-SPACE',()=>{ if(this.readyToContinue) this.continueGame(); });
    this.input.keyboard.on('keydown-R',()=>{ this.registry.remove('gd'); this.scene.start('GameScene'); });
  }

  buildAttendant(startX){
    const rows = GOLFER_ROSTER.length;
    const midY = 46 + rows*28/2;
    const c = this.add.container(startX, midY);
    c.add([
      this.add.ellipse(0,3,18,5,0x000000,0.4),
      this.add.rectangle(0,-10,5,24,0x1a1a1a),
      this.add.rectangle(0,-28,10,10,0x1a1a1a),
      this.add.rectangle(0,-34,13,4,0x333333),
      this.add.rectangle(-4,-14,3,14,0x1a1a1a),
      this.add.rectangle( 4,-14,3,14,0x1a1a1a),
    ]);
    return c;
  }

  runAttendantSequence(){
    if(!this.playerRow) return;
    const pr = this.playerRow;
    // Walk in from right side to card area
    this.tweens.add({targets:this.attendant, x:W-58, y:pr.ry, duration:700, ease:'Linear',
      onComplete:()=>{
        this.time.delayedCall(250, ()=>{
          // Card swap: squish out
          this.tweens.add({targets:pr.cardBg, scaleX:0, duration:130,
            onComplete:()=>{
              pr.cardBg.fillColor = C.lbHi;
              Sound.playLeaderboardUpdate();
              // squish back in
              this.tweens.add({targets:pr.cardBg, scaleX:1, duration:130,
                onComplete:()=>{
                  // Walk off left
                  this.tweens.add({targets:this.attendant, x:-40, duration:700, ease:'Linear'});
                  this.time.delayedCall(500, ()=> this.showContinuePrompt());
                }
              });
            }
          });
        });
      }
    });
  }

  showContinuePrompt(){
    const isLast = this.gd.hole >= this.gd.maxHoles;
    this.promptLb.setText(isLast ? 'SPACE — final results' : 'SPACE — next hole').setAlpha(1);
    this.tweens.add({targets:this.promptLb, alpha:0.4, duration:600, yoyo:true, repeat:-1});
    this.readyToContinue = true;
  }

  continueGame(){
    this.scene.start('GameScene');
  }
}

// ═══════════════════════════════════════════════════════════════
//  BOOT
// ═══════════════════════════════════════════════════════════════
new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: W, height: H,
  pixelArt: true,
  backgroundColor: '#050508',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [TitleScene, GameScene, LeaderboardScene],
});
