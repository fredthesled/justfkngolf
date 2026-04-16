/* ================================================================
 *  Just F'kn Golf — v0.3
 *  You're the caddy. Sabotage your golfer. Collect your wager.
 *  Don't get caught. Don't push him over the edge.
 *
 *  TIMING ZONES:
 *    Outside window  → MISS   : +30 suspicion, combo reset, no payout
 *    Orange GOOD zone → GOOD  : +8 suspicion,  combo +1,   $200×combo
 *    Yellow CRIT sliver → CRIT: +0 suspicion,  combo +1,   $500×combo
 *    No heckle → IDLE         : -15 suspicion, combo kept, no payout
 *
 *  RAGE-QUIT: 3 consecutive criticals → golfer withdraws → game over
 *  EJECTION:  suspicion hits 100     → you're thrown out  → game over
 *  SURVIVAL:  finish all 9 holes     → +$2000 bonus
 * ================================================================ */

const W = 480, H = 270;

const C = {
  skyT:0x1a2a4a, skyB:0x5a90d0, hill:0x2a6040,
  rough:0x1a5020, fair:0x3aa040, fairDk:0x28782e,
  sand:0xe0c060, flag:0xe02828, green:0x58c858,
  gShirt:0xf0f0f0, gPants:0x1828b0, gSkin:0xe8b888, gHat:0xb01818, gClub:0xd0d0d0,
  cBib:0x28882a, cShirt:0xe8e8d0, cPants:0xb09060, cSkin:0xe8c090, cCap:0xf0f0e0, cBag:0x805030,
  cr:[0xb83030,0x2850b0,0xb09030,0x704090,0x408060],
  uBg:0x0f0f0f, uGood:0x30e030, uWarn:0xf0a020, uCrit:0xffff30, uBad:0xe02020,
  sLow:0x30e030, sMid:0xf0a020, sHi:0xe02020,
  white:0xffffff, black:0x000000,
  lbBg:0x162814, lbWood:0x2e1a0a, lbRow:0x221408, lbRowAlt:0x1a1006,
  lbGold:0xd4a820, lbText:0xf0e8d0, lbCard:0xf0e0a0, lbHi:0xffe050,
};

const SUSP_D   = { CRITICAL:0,   GOOD:8,   MISS:30,  IDLE:-15 };
const PAYOUT   = { CRITICAL:500, GOOD:200, MISS:0,   IDLE:0   };
const MAX_COMBO = 4;
const CRIT_FRAC = 0.22;
const SURVIVAL_BONUS = 2000;
const MAX_SUSP = 100;
const RAGE_THRESHOLD = 3; // consecutive crits before rage-quit

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

const HOLE_LABELS = ['1st','2nd','3rd','4th','5th','6th','7th','8th','9th'];

function relPar(n){
  if(n<=-2) return 'EAGLE!';
  if(n===-1) return 'BIRDIE';
  if(n===0)  return 'PAR';
  if(n===1)  return 'BOGEY';
  if(n===2)  return 'DBL BOGEY';
  return `+${n}`;
}
function relParColor(n){
  if(n<0)  return '#ffe050';
  if(n===0)return '#ffffff';
  if(n===1)return '#ff9040';
  return '#ff4040';
}
function scoreDisplay(n){
  if(n===0) return ' E';
  return (n>0?'+':'')+n;
}

// ═══════════════════════════════════════════════════════════════
//  GAME SCENE
// ═══════════════════════════════════════════════════════════════
class GameScene extends Phaser.Scene {
  constructor(){ super({ key:'GameScene' }); }

  // ── init ──────────────────────────────────────────────────────
  create(){
    const saved = this.registry.get('gd');
    if(saved){
      this.gd = saved;
      this.gd.hole++;               // advance after leaderboard
      if(this.gd.hole > this.gd.maxHoles){ this.showVictory(); return; }
    } else {
      this.gd = {
        hole:1, maxHoles:9, suspicion:0,
        combo:1, totalPayout:0, consecutiveCrits:0,
        golferScores: GOLFER_ROSTER.map(()=>0),
      };
      this.registry.set('gd', this.gd);
    }

    this.swingState = 'idle';
    this.swingT = 0;
    this.heckled = false;
    this.holeResult = null;

    this.buildCourse();
    this.buildCrowd();
    this.buildGolfer();
    this.buildCaddy();
    this.buildBall();
    this.buildTimingBar();
    this.buildSuspicionMeter();
    this.buildHUD();

    this.input.keyboard.on('keydown-SPACE', ()=> this.onHeckle());
    this.input.keyboard.on('keydown-R', ()=>{
      this.registry.remove('gd');
      this.scene.start('GameScene');
    });

    this.time.delayedCall(700, ()=> this.beginSwing());
  }

  // ── course ───────────────────────────────────────────────────
  buildCourse(){
    const g = this.add.graphics();
    g.fillStyle(C.skyT); g.fillRect(0,0,W,55);
    g.fillStyle(C.skyB); g.fillRect(0,55,W,95);
    g.fillStyle(C.hill);
    g.fillTriangle(0,150,130,85,255,150);
    g.fillTriangle(200,150,340,95,480,150);
    g.fillStyle(C.rough);  g.fillRect(0,148,W,H-148);
    g.fillStyle(C.fair);   g.fillEllipse(W/2,218,470,130);
    g.fillStyle(C.fairDk);
    for(let i=0;i<22;i++) g.fillRect(14+i*21,168+((i*11)%38),9,2);
    g.fillStyle(C.sand);   g.fillEllipse(368,212,72,24);
    g.fillStyle(C.green);  g.fillEllipse(92,144,34,10);
    g.fillStyle(0x666666); g.fillRect(91,116,2,28);
    g.fillStyle(C.flag);   g.fillTriangle(93,116,104,121,93,126);
    // hole number sign
    g.fillStyle(0x2a1a08); g.fillRect(8,200,46,22);
    g.fillStyle(C.lbGold); g.fillRect(9,201,44,20);
    this.add.text(31,211, HOLE_LABELS[(this.gd.hole-1)%9]+' HOLE', {
      fontFamily:'Courier New', fontSize:'7px', color:'#1a0a00',
    }).setOrigin(0.5);
  }

  // ── crowd ────────────────────────────────────────────────────
  buildCrowd(){
    const g = this.add.graphics();
    g.fillStyle(0x3a2510); g.fillRect(0,156,W,2);
    this.crowdHeads=[];
    for(let row=0;row<2;row++){
      for(let i=0;i<27;i++){
        const x=8+i*17+row*9, y=147-row*9;
        const col=C.cr[(i+row*3)%C.cr.length];
        const h=this.add.rectangle(x,y,10,10,col);
        const f=this.add.rectangle(x,y+2,6,4,C.gSkin);
        this.crowdHeads.push({h,f,by:y,ph:i*0.38+row});
      }
    }
    this.crowdT=0; this.crowdExcite=0;
  }

  // ── golfer ───────────────────────────────────────────────────
  buildGolfer(){
    const gx=252,gy=220;
    this.gc = this.add.container(gx,gy);
    this.gShadow=this.add.ellipse(0,2,28,6,0,0.3);
    this.gLL=this.add.rectangle(-4,-10,5,20,C.gPants);
    this.gRL=this.add.rectangle( 4,-10,5,20,C.gPants);
    this.gTo=this.add.rectangle(0,-28,14,18,C.gShirt);
    this.gHd=this.add.rectangle(0,-42,10,10,C.gSkin);
    this.gHt=this.add.rectangle(0,-48,12, 4,C.gHat);
    this.gBr=this.add.rectangle(4,-46, 6, 2,C.gHat);
    this.gEB=this.add.rectangle(0,-45, 8, 2,C.black).setAlpha(0); // angry brow
    this.gAr=this.add.container(0,-32);
    this.gAr.add([this.add.rectangle(-2,6,4,14,C.gSkin),this.add.rectangle(2,6,4,14,C.gSkin)]);
    this.gCl=this.add.container(0,-32);
    this.gCl.add([this.add.rectangle(0,22,2,46,C.gClub),this.add.rectangle(-3,46,8,4,C.gClub)]);
    this.gCl.setRotation(-0.3);
    this.gc.add([this.gShadow,this.gLL,this.gRL,this.gTo,this.gHd,this.gHt,this.gBr,this.gEB,this.gAr,this.gCl]);
    this.gReact=this.add.text(gx+12,gy-55,'',{fontFamily:'Courier New',fontSize:'10px',color:'#ff6060',stroke:'#000',strokeThickness:2}).setAlpha(0);
    // tilt shake overlay (rage warning)
    this.tiltWarning=this.add.text(W/2,80,'⚠ TILTING ⚠',{fontFamily:'Courier New',fontSize:'13px',color:'#ff4400',stroke:'#000',strokeThickness:3}).setOrigin(0.5).setAlpha(0);
  }

  // ── caddy ────────────────────────────────────────────────────
  buildCaddy(){
    const cx=200,cy=220;
    this.cX=cx; this.cY=cy;
    this.cc=this.add.container(cx,cy);
    this.cSh=this.add.ellipse(0,2,22,5,0,0.3);
    this.cLL=this.add.rectangle(-3,-9,4,18,C.cPants);
    this.cRL=this.add.rectangle( 3,-9,4,18,C.cPants);
    this.cTo=this.add.rectangle(0,-26,12,16,C.cShirt);
    this.cBi=this.add.rectangle(0,-26, 9,14,C.cBib);
    this.cHd=this.add.rectangle(0,-40, 9, 9,C.cSkin);
    this.cCp=this.add.rectangle(0,-46,11, 3,C.cCap);
    this.cVi=this.add.rectangle(-4,-44,5,2,C.cCap);
    this.cAL=this.add.container(-6,-30); this.cAL.add(this.add.rectangle(0,5,3,12,C.cSkin));
    this.cAR=this.add.container( 6,-30); this.cAR.add(this.add.rectangle(0,5,3,12,C.cSkin));
    const bag=this.add.container(14,-8);
    bag.add([this.add.rectangle(0,0,8,22,C.cBag),this.add.rectangle(0,-14,9,4,0x604020),
             this.add.rectangle(-2,-18,2,8,C.gClub),this.add.rectangle(1,-17,2,7,C.gClub),this.add.rectangle(3,-16,2,6,C.gClub)]);
    this.cc.add([this.cSh,this.cLL,this.cRL,this.cTo,this.cBi,this.cHd,this.cCp,this.cVi,this.cAL,this.cAR,bag]);
    this.hTxt=this.add.text(cx-10,cy-65,'',{fontFamily:'Courier New',fontSize:'13px',color:'#ffff55',stroke:'#000',strokeThickness:3}).setOrigin(0.5).setAlpha(0);
    this.catchTxt=this.add.text(cx,cy-72,'!!',{fontFamily:'Courier New',fontSize:'16px',color:'#ff3030',stroke:'#000',strokeThickness:3}).setOrigin(0.5).setAlpha(0);
  }

  // ── ball ─────────────────────────────────────────────────────
  buildBall(){
    this.ball=this.add.circle(272,221,2.5,C.white);
    this.ballSh=this.add.ellipse(272,223,6,2,0,0.35);
  }

  // ── timing bar ───────────────────────────────────────────────
  buildTimingBar(){
    this.tb={x:70,y:H-28,w:W-140,h:11};
    this.tbBg    =this.add.rectangle(this.tb.x,this.tb.y,this.tb.w,this.tb.h,C.uBg).setOrigin(0,0.5).setStrokeStyle(1,C.white);
    this.tbFill  =this.add.rectangle(this.tb.x,this.tb.y,0,this.tb.h-2,C.uGood).setOrigin(0,0.5);
    this.tbGood  =this.add.rectangle(this.tb.x,this.tb.y,0,this.tb.h-2,C.uBad,0.45).setOrigin(0,0.5);
    this.tbCrit  =this.add.rectangle(this.tb.x,this.tb.y,0,this.tb.h,C.uCrit,0.85).setOrigin(0,0.5);
    this.tbHead  =this.add.rectangle(this.tb.x,this.tb.y,2,this.tb.h+7,C.white).setOrigin(0.5);
    this.tbLG    =this.add.text(0,this.tb.y+9,'HECKLE',{fontFamily:'Courier New',fontSize:'8px',color:'#ff8040'}).setOrigin(0.5).setAlpha(0);
    this.tbLC    =this.add.text(0,this.tb.y+9,'PERFECT',{fontFamily:'Courier New',fontSize:'8px',color:'#ffff30'}).setOrigin(0.5).setAlpha(0);
    [this.tbBg,this.tbFill,this.tbGood,this.tbCrit,this.tbHead,this.tbLG,this.tbLC].forEach(o=>o.setVisible(false));
  }

  // ── suspicion meter ──────────────────────────────────────────
  buildSuspicionMeter(){
    const sx=W-8,sy=24,sw=88,sh=7;
    this.sbData={x:sx-sw,y:sy,w:sw};
    this.add.text(sx-sw-2,sy,'SUSPICION',{fontFamily:'Courier New',fontSize:'8px',color:'#dddddd',stroke:'#000',strokeThickness:1}).setOrigin(1,0.5);
    this.sbBg  =this.add.rectangle(sx-sw,sy,sw,sh,C.uBg).setOrigin(0,0.5).setStrokeStyle(1,0x888888);
    this.sbFill=this.add.rectangle(sx-sw,sy,0,sh-2,C.sLow).setOrigin(0,0.5);
    this.sbFlash=this.add.rectangle(sx-sw,sy,sw,sh,0xff0000,0).setOrigin(0,0.5);
    this.sbLbl =this.add.text(sx,sy+6,'CLUELESS',{fontFamily:'Courier New',fontSize:'8px',color:'#30ff30'}).setOrigin(1,0);
  }

  // ── hud ──────────────────────────────────────────────────────
  buildHUD(){
    this.holeTxt  =this.add.text(8,8,'',{fontFamily:'Courier New',fontSize:'11px',color:'#ffffff',stroke:'#000',strokeThickness:2});
    this.payTxt   =this.add.text(8,20,'',{fontFamily:'Courier New',fontSize:'11px',color:'#ffe050',stroke:'#000',strokeThickness:2});
    this.comboTxt =this.add.text(8,32,'',{fontFamily:'Courier New',fontSize:'10px',color:'#ff9040',stroke:'#000',strokeThickness:2});
    this.promptTxt=this.add.text(W/2,H-12,'',{fontFamily:'Courier New',fontSize:'10px',color:'#9cff9c',stroke:'#000',strokeThickness:2}).setOrigin(0.5);
    this.refreshHUD();
  }

  refreshHUD(){
    const d=this.gd;
    this.holeTxt.setText(`HOLE ${d.hole} / ${d.maxHoles}`);
    this.payTxt.setText(`WAGER: $${d.totalPayout.toLocaleString()}`);
    this.comboTxt.setText(d.combo>1?`COMBO x${d.combo} 🔥`:'');
    this.promptTxt.setText('SPACE = HECKLE');
    // suspicion meter
    const pct=d.suspicion/MAX_SUSP;
    this.sbFill.width=this.sbData.w*pct;
    const col=pct<0.35?C.sLow:pct<0.65?C.sMid:C.sHi;
    const lbl=pct<0.35?'CLUELESS':pct<0.65?'UNEASY':pct<0.88?'SUSPICIOUS':'!! FURIOUS !!';
    const lc =pct<0.35?'#30ff30':pct<0.65?'#f0a020':'#ff4020';
    this.sbFill.fillColor=col;
    this.sbLbl.setText(lbl).setColor(lc);
    this.gEB.setAlpha(pct>0.6?(pct-0.6)/0.4:0);
  }

  // ── swing control ────────────────────────────────────────────
  beginSwing(){
    this.swingState='swinging';
    this.swingT=0; this.heckled=false; this.holeResult=null;
    const h=this.gd.hole;
    this.swingDur=Math.max(1100,2400-h*135);
    const ww=Math.max(0.10,0.22-h*0.013);
    const ws=Phaser.Math.FloatBetween(0.40,0.82-ww);
    const we=ws+ww, cm=(ws+we)/2, cw=ww*CRIT_FRAC;
    this.win={s:ws,e:we,cs:cm-cw/2,ce:cm+cw/2};
    this.tbGood.x=this.tb.x+this.tb.w*ws; this.tbGood.width=this.tb.w*ww;
    this.tbCrit.x=this.tb.x+this.tb.w*this.win.cs; this.tbCrit.width=this.tb.w*cw;
    this.tbLG.x=this.tb.x+this.tb.w*(ws+ww*0.2);
    this.tbLC.x=this.tb.x+this.tb.w*cm;
    [this.tbBg,this.tbFill,this.tbGood,this.tbCrit,this.tbHead,this.tbLG,this.tbLC].forEach(o=>o.setVisible(true));
    this.tbLG.setAlpha(0.9); this.tbLC.setAlpha(1);
    this.promptTxt.setText('SPACE = HECKLE');
    // rage warning
    if(this.gd.consecutiveCrits>=2){
      this.tiltWarning.setAlpha(0.9);
      this.tweens.add({targets:this.tiltWarning,alpha:0,duration:1200,delay:800});
      this.cameras.main.shake(80,0.003);
    }
  }

  onHeckle(){
    if(this.swingState!=='swinging'||this.heckled) return;
    this.heckled=true;
    const t=this.swingT/this.swingDur;
    const w=this.win;
    let res;
    if(t>=w.cs&&t<=w.ce)     res='CRITICAL';
    else if(t>=w.s&&t<=w.e)  res='GOOD';
    else                      res='MISS';
    this.holeResult=res;
    const types=res==='MISS'?['cough']:['cough','airhorn','sneeze'];
    this.animCaddyHeckle(Phaser.Utils.Array.GetRandom(types),res);
    if(res!=='MISS') this.golferFlinch(res);
    else             this.suspSpike();
  }

  // ── caddy animations ─────────────────────────────────────────
  animCaddyHeckle(type,res){
    const LINES={
      CRITICAL:['"Noonan…"','*whisper cough*','   *innocent*'],
      GOOD:    ['"MISS IT!"','*COUGH*','"YOU\'RE A BUM!"','"NOONAN!"'],
      MISS:    ['"...uh"','*weak cough*','"...nice shot?"'],
    };
    const line=Phaser.Utils.Array.GetRandom(LINES[res]);
    this.hTxt.setText(line).setX(this.cX-10).setY(this.cY-65).setAlpha(1);
    this.tweens.add({targets:this.hTxt,y:this.cY-78,alpha:0,duration:1100,ease:'Quad.easeOut'});
    if(type==='airhorn') this.animAirHorn();
    else                 this.animCough(res);
  }

  animCough(res){
    this.tweens.add({targets:this.cc,y:this.cY+3,duration:100,yoyo:true,repeat:res==='CRITICAL'?1:2,onComplete:()=>this.cc.y=this.cY});
    this.tweens.add({targets:this.cAR,rotation:-1.1,duration:80,yoyo:true,repeat:res==='CRITICAL'?1:2});
    if(res!=='MISS') this.cameras.main.shake(res==='CRITICAL'?190:110,res==='CRITICAL'?0.005:0.003);
  }

  animAirHorn(){
    this.tweens.add({targets:this.cAR,rotation:-2.2,duration:90,yoyo:true,repeat:1});
    const horn=this.add.rectangle(this.cX+8,this.cY-40,12,5,0xffaa00);
    this.tweens.add({targets:horn,x:this.cX+22,alpha:0,duration:420,ease:'Quad.easeOut',onComplete:()=>horn.destroy()});
    this.cameras.main.shake(200,0.007);
  }

  golferFlinch(res){
    const jerk=res==='CRITICAL'?0.65:0.35;
    this.tweens.add({targets:this.gCl,rotation:`+=${jerk}`,duration:70,yoyo:true});
    this.tweens.add({targets:this.gTo,x:'+=2',duration:60,yoyo:true});
    const sw=this.add.text(this.gc.x+10,this.gc.y-52,'💦',{fontSize:'11px'});
    this.tweens.add({targets:sw,y:sw.y+10,alpha:0,duration:500,onComplete:()=>sw.destroy()});
    const rs=res==='CRITICAL'?['SHANK!!','OH NO—','FORE!!!!!']:['\"Wha—\"','\"AUGH!\"','\"Not again!\"'];
    this.gReact.setText(Phaser.Utils.Array.GetRandom(rs)).setAlpha(1).y=this.gc.y-55;
    this.tweens.add({targets:this.gReact,y:this.gc.y-68,alpha:0,duration:900,onComplete:()=>this.gReact.y=this.gc.y-55});
  }

  suspSpike(){
    this.tweens.add({targets:this.cc,x:this.cX-3,duration:60,yoyo:true,repeat:3,onComplete:()=>this.cc.x=this.cX});
    this.catchTxt.setAlpha(1).setX(this.cX).setY(this.cY-68);
    this.tweens.add({targets:this.catchTxt,y:this.cY-82,alpha:0,duration:700});
    this.gReact.setText('"Hey…"').setAlpha(1).y=this.gc.y-55;
    this.tweens.add({targets:this.gReact,alpha:0,delay:500,duration:600,onComplete:()=>this.gReact.y=this.gc.y-55});
    this.cameras.main.shake(80,0.003);
  }

  // ── swing animation ──────────────────────────────────────────
  animSwing(t){
    let cr,ar,ty;
    if(t<0.38){       cr=-0.3;          ar=0;         ty=-28; }
    else if(t<0.73){  const k=(t-0.38)/0.35; cr=-0.3-k*2.3; ar=-k*0.8; ty=-28-Math.sin(k*Math.PI)*1.2; }
    else if(t<0.80){  cr=-2.6;          ar=-0.8;      ty=-29.2; }
    else{             const k=(t-0.80)/0.20; cr=-2.6+k*4.2; ar=-0.8+k*1.5; ty=-28; }
    this.gCl.setRotation(cr); this.gAr.setRotation(ar); this.gTo.y=ty;
  }

  // ── update ───────────────────────────────────────────────────
  update(time,delta){
    this.crowdT+=delta;
    const exc=this.crowdExcite||0;
    if(this.crowdHeads) for(const h of this.crowdHeads){
      const b=Math.sin((this.crowdT+h.ph*180)/280)*(0.7+exc*2.5);
      h.h.y=h.by+b; h.f.y=h.by+2+b;
    }
    if(exc>0) this.crowdExcite=Math.max(0,exc-delta*0.001);
    const pct=this.gd.suspicion/MAX_SUSP;
    this.sbFlash.setAlpha(pct>0.8?(Math.sin(time*0.012)+1)*0.09:0);
    if(this.swingState!=='swinging') return;
    this.swingT+=delta;
    const t=Math.min(1,this.swingT/this.swingDur);
    this.animSwing(t);
    // caddy idle sway
    this.cc.y=this.cY+Math.sin(this.swingT*0.0015)*0.8;
    this.cAL.rotation=Math.sin(this.swingT*0.001)*0.12;
    // bar
    this.tbFill.width=this.tb.w*t;
    this.tbHead.x=this.tb.x+this.tb.w*t;
    const w=this.win;
    this.tbFill.fillColor=t>=w.cs&&t<=w.ce?C.uCrit:t>=w.s&&t<=w.e?C.uWarn:C.uGood;
    if(t>=1) this.resolveSwing();
  }

  // ── resolve ──────────────────────────────────────────────────
  resolveSwing(){
    this.swingState='result';
    [this.tbBg,this.tbFill,this.tbGood,this.tbCrit,this.tbHead,this.tbLG,this.tbLC].forEach(o=>o.setVisible(false));
    const res=this.holeResult||'IDLE';
    const d=this.gd;

    // suspicion
    d.suspicion=Phaser.Math.Clamp(d.suspicion+SUSP_D[res],0,MAX_SUSP);

    // combo
    if(res==='MISS')       d.combo=1;
    else if(res!=='IDLE')  d.combo=Math.min(d.combo+1,MAX_COMBO);
    // (IDLE keeps combo)

    // payout
    const earned=PAYOUT[res]*d.combo;
    d.totalPayout+=earned;

    // consecutive crits
    if(res==='CRITICAL') d.consecutiveCrits++;
    else                 d.consecutiveCrits=0;

    // hole score for the golfer
    let holeScore;
    if(res==='CRITICAL')     holeScore=+2;
    else if(res==='GOOD')    holeScore=+1;
    else                     holeScore=Phaser.Math.Between(-1,0);
    // +1 for other golfers (random slightly good, slight bad)
    d.golferScores=d.golferScores.map((s,i)=>{
      if(GOLFER_ROSTER[i].player) return s+holeScore;
      // rival (index 1) trends good
      const bias=i===1?-1:0;
      return s+Phaser.Math.Between(-1+bias,1+bias);
    });

    this.refreshHUD();
    if(res==='CRITICAL'||res==='GOOD') this.crowdExcite=1;

    // ball animation
    if(res==='CRITICAL'){
      this.tweens.add({targets:[this.ball,this.ballSh],x:'+=58',y:'+=-32',duration:360,ease:'Quad.easeOut',
        onComplete:()=>this.tweens.add({targets:[this.ball,this.ballSh],y:'+=34',duration:300,ease:'Bounce.easeOut'})});
      this.promptTxt.setText(`MASSIVE SHANK!${earned?'  +$'+earned:''}  [SPACE]`);
    } else if(res==='GOOD'){
      this.tweens.add({targets:[this.ball,this.ballSh],x:'+=20',y:'+=-12',duration:280,ease:'Quad.easeOut',
        onComplete:()=>this.tweens.add({targets:[this.ball,this.ballSh],y:'+=14',duration:220,ease:'Bounce.easeOut'})});
      this.promptTxt.setText(`Flinched! +$${earned}  [SPACE]`);
    } else if(res==='MISS'){
      this.promptTxt.setText('He noticed…  [SPACE]');
    } else {
      this.tweens.add({targets:[this.ball,this.ballSh],x:92,y:144,scale:0.5,duration:1000,ease:'Quad.easeOut'});
      this.promptTxt.setText('Clean shot. Suspicion fades.  [SPACE]');
    }

    // game over checks
    if(d.suspicion>=MAX_SUSP){
      this.time.delayedCall(1100,()=>this.gameOverEjected()); return;
    }
    if(d.consecutiveCrits>=RAGE_THRESHOLD){
      this.time.delayedCall(900,()=>this.gameOverRageQuit()); return;
    }

    this.input.keyboard.once('keydown-SPACE',()=>this.goToLeaderboard(res,holeScore,earned));
  }

  goToLeaderboard(res,holeScore,earned){
    this.registry.set('gd',this.gd);
    this.registry.set('lastHole',{res,holeScore,earned,holeNum:this.gd.hole});
    this.scene.start('LeaderboardScene');
  }

  // ── game overs ───────────────────────────────────────────────
  gameOverEjected(){
    this.swingState='over';
    this.tweens.add({targets:this.cAL,rotation:-2,duration:200});
    this.tweens.add({targets:this.cAR,rotation: 2,duration:200});
    this.time.delayedCall(500,()=>{
      this.showOverlay('⛳ EJECTED FROM THE COURSE',
        '"That caddy is out of here!"',
        `Holes: ${this.gd.hole}/9  |  Wager: $${this.gd.totalPayout.toLocaleString()}`,
        '#ff3030');
    });
  }

  gameOverRageQuit(){
    this.swingState='over';
    // golfer slams club
    this.tweens.add({targets:this.gCl,rotation:1.5,duration:150,onComplete:()=>{
      const slam=this.add.rectangle(this.gc.x+10,this.gc.y+2,4,30,C.gClub).setRotation(0.4);
      this.tweens.add({targets:slam,y:this.gc.y+18,alpha:0,duration:600,ease:'Bounce.easeOut',onComplete:()=>slam.destroy()});
    }});
    this.tweens.add({targets:this.gc,x:this.gc.x+60,duration:1200,ease:'Quad.easeIn'});
    this.time.delayedCall(1200,()=>{
      this.showOverlay('🏌️ GOLFER HAS WITHDRAWN',
        '"I QUIT! I KNOW IT WAS YOU!"',
        `Wager voided. You\'re fired.   $0`,
        '#ff8800');
    });
  }

  showOverlay(title,sub,stat,col){
    this.add.rectangle(W/2,H/2,W,H,0,0.84);
    this.add.text(W/2,H/2-38,title,{fontFamily:'Courier New',fontSize:'13px',color:col,stroke:'#000',strokeThickness:3}).setOrigin(0.5);
    this.add.text(W/2,H/2-16,sub,  {fontFamily:'Courier New',fontSize:'10px',color:'#ffaa40'}).setOrigin(0.5);
    this.add.text(W/2,H/2+ 4,stat, {fontFamily:'Courier New',fontSize:'11px',color:'#ffffff'}).setOrigin(0.5);
    this.add.text(W/2,H/2+40,'press R to try again',{fontFamily:'Courier New',fontSize:'10px',color:'#666666'}).setOrigin(0.5);
  }

  showVictory(){
    // called when hole advances past 9
    const d=this.gd;
    const total=d.totalPayout+SURVIVAL_BONUS;
    const grade=
      total>=6000?'🏆 LEGENDARY SABOTEUR':
      total>=4000?'🎖  CUNNING CONSPIRATOR':
      total>=2500?'😏 CRAFTY CADDY':
      total>=1500?'🙄 SHAKY BEGINNER':
                  '😇 SUSPICIOUSLY POLITE';
    this.add.rectangle(W/2,H/2,W,H,0,0.84);
    this.add.text(W/2,H/2-48,'— ROUND COMPLETE —',{fontFamily:'Courier New',fontSize:'14px',color:'#ffe050',stroke:'#000',strokeThickness:2}).setOrigin(0.5);
    this.add.text(W/2,H/2-26,`Wager collected: $${d.totalPayout.toLocaleString()}`,{fontFamily:'Courier New',fontSize:'11px',color:'#9cff9c'}).setOrigin(0.5);
    this.add.text(W/2,H/2-12,`Survival bonus:  +$${SURVIVAL_BONUS.toLocaleString()}`,{fontFamily:'Courier New',fontSize:'11px',color:'#9cff9c'}).setOrigin(0.5);
    this.add.text(W/2,H/2+ 4,`TOTAL: $${total.toLocaleString()}`,{fontFamily:'Courier New',fontSize:'14px',color:'#ffe050',stroke:'#000',strokeThickness:2}).setOrigin(0.5);
    this.add.text(W/2,H/2+22,grade,{fontFamily:'Courier New',fontSize:'13px',color:'#ffcc00',stroke:'#000',strokeThickness:2}).setOrigin(0.5);
    this.add.text(W/2,H/2+44,`Suspicion at finish: ${Math.round(d.suspicion)}%`,{fontFamily:'Courier New',fontSize:'9px',color:d.suspicion>60?'#ff8040':'#30ff30'}).setOrigin(0.5);
    this.add.text(W/2,H/2+58,'press R to play again',{fontFamily:'Courier New',fontSize:'10px',color:'#555555'}).setOrigin(0.5);
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
    const d=this.gd, lh=this.last;

    // background — dark canvas tent feel
    this.add.rectangle(W/2,H/2,W,H,C.lbBg);
    // wood grain stripes
    const g=this.add.graphics();
    g.fillStyle(0x1e0e04,0.4);
    for(let i=0;i<8;i++) g.fillRect(0,i*34,W,17);

    // title bar
    this.add.rectangle(W/2,14,W,28,C.lbWood);
    this.add.text(W/2,14,'GREENWOOD INVITATIONAL',{fontFamily:'Courier New',fontSize:'12px',color:'#d4a820',stroke:'#000',strokeThickness:2}).setOrigin(0.5);
    this.add.text(W-8,14,`AFTER ${lh.holeNum} HOLES`,{fontFamily:'Courier New',fontSize:'8px',color:'#a08040'}).setOrigin(1,0.5);

    // build leaderboard (sorted by running total, lowest=best in golf)
    const entries=GOLFER_ROSTER.map((r,i)=>({...r,score:d.golferScores[i]}));
    entries.sort((a,b)=>a.score-b.score);

    const boardX=12, boardY=34, rowH=22, boardW=W-24;
    this.add.rectangle(boardX+boardW/2,boardY+entries.length*rowH/2,boardW,entries.length*rowH,C.lbWood);

    this.playerRow=null;
    entries.forEach((e,rank)=>{
      const ry=boardY+rank*rowH;
      const isP=e.player;
      const bg=this.add.rectangle(boardX+boardW/2,ry+rowH/2,boardW,rowH-1,isP?0x2a2000:rank%2===0?C.lbRow:C.lbRowAlt);
      if(isP){ bg.setStrokeStyle(1,C.lbGold); }
      // pos
      this.add.text(boardX+8,ry+rowH/2,`${rank+1}`,{fontFamily:'Courier New',fontSize:'10px',color:isP?C.lbHi:C.lbText}).setOrigin(0,0.5);
      // name
      this.add.text(boardX+22,ry+rowH/2,e.name,{fontFamily:'Courier New',fontSize:'10px',color:isP?'#ffe050':C.lbText}).setOrigin(0,0.5);
      // score card
      const sdStr=scoreDisplay(e.score);
      const cardX=boardX+boardW-10, cardY=ry+rowH/2;
      const cardBg=this.add.rectangle(cardX,cardY,28,rowH-4,isP?C.lbCard:0x404040).setOrigin(1,0.5);
      const cardTxt=this.add.text(cardX-14,cardY,sdStr,{fontFamily:'Courier New',fontSize:'10px',
        color:e.score<0?'#ffe050':e.score===0?'#ffffff':'#ff6040'}).setOrigin(0.5);
      if(isP) this.playerRow={ry,cardBg,cardTxt,rank,ry:ry+rowH/2};
    });

    // attendant silhouette (small figure, starts off to the right)
    this.attendant=this.buildAttendant(W+20, 0);

    // hole result banner (slides up from bottom)
    const hlabel=relPar(lh.holeScore);
    const hcol=relParColor(lh.holeScore);
    this.resultBanner=this.add.container(W/2,H+30);
    const rb=this.add.rectangle(0,0,200,26,C.lbWood).setStrokeStyle(1,C.lbGold);
    const rt=this.add.text(0,0,`${lh.holeNum===1?'1ST':'HOLE '+lh.holeNum}: ${hlabel}`,
      {fontFamily:'Courier New',fontSize:'13px',color:hcol,stroke:'#000',strokeThickness:2}).setOrigin(0.5);
    this.resultBanner.add([rb,rt]);

    // payout info
    this.payInfo=this.add.text(W/2,H-8,
      lh.earned>0?`+$${lh.earned.toLocaleString()} (x${this.gd.combo} combo)  |  Total: $${this.gd.totalPayout.toLocaleString()}`
                 :`Total: $${this.gd.totalPayout.toLocaleString()}`,
      {fontFamily:'Courier New',fontSize:'9px',color:'#ffe050'}).setOrigin(0.5).setAlpha(0);

    this.promptLb=this.add.text(W/2,H-22,'',{fontFamily:'Courier New',fontSize:'9px',color:'#888888'}).setOrigin(0.5).setAlpha(0);

    // sequence
    this.time.delayedCall(200,()=>{
      // slide banner in
      this.tweens.add({targets:this.resultBanner,y:H-50,duration:400,ease:'Back.easeOut'});
      this.time.delayedCall(600,()=>{
        this.tweens.add({targets:this.payInfo,alpha:1,duration:300});
        this.runAttendantSequence();
      });
    });

    this.input.keyboard.on('keydown-SPACE',()=>{
      if(this.readyToContinue) this.continueGame();
    });
    this.input.keyboard.on('keydown-R',()=>{
      this.registry.remove('gd');
      this.scene.start('GameScene');
    });
    this.readyToContinue=false;
  }

  buildAttendant(x,_y){
    // small silhouette — same structure as caddy but dark
    const c=this.add.container(x, 0);
    const rows=GOLFER_ROSTER.length;
    const boardY=34, rowH=22;
    const baseY=boardY+rows*rowH/2; // stand at mid-board height
    c.y=baseY;
    c.add([
      this.add.rectangle(0,  2,14, 4,0x111111), // shadow
      this.add.rectangle(0,-10, 4,18,0x222222), // body
      this.add.rectangle(0,-22, 8, 8,0x222222), // head
      this.add.rectangle(-4,-28,8,3,0x333333),  // hat
    ]);
    return c;
  }

  runAttendantSequence(){
    if(!this.playerRow) return;
    const pr=this.playerRow;
    const targetX=W-48; // near the score cards

    // walk in from right
    this.tweens.add({targets:this.attendant,x:targetX,y:pr.ry,duration:600,ease:'Linear',
      onComplete:()=>{
        this.time.delayedCall(200,()=>{
          // card swap animation
          this.tweens.add({targets:pr.cardBg,scaleX:0,duration:120,
            onComplete:()=>{
              pr.cardBg.fillColor=C.lbHi;
              pr.cardTxt.setColor(this.gd.golferScores[GOLFER_ROSTER.findIndex(r=>r.player)]<0?'#1a0a00':'#1a0a00');
              this.tweens.add({targets:pr.cardBg,scaleX:1,duration:120,
                onComplete:()=>{
                  // walk attendant back off-screen
                  this.tweens.add({targets:this.attendant,x:W+30,duration:500,ease:'Linear'});
                  this.time.delayedCall(400,()=>this.showContinuePrompt());
                }
              });
            }
          });
        });
      }
    });
  }

  showContinuePrompt(){
    const isLast=this.gd.hole>=this.gd.maxHoles;
    this.promptLb.setText(isLast?'SPACE — final scores':'SPACE — next hole').setAlpha(1);
    this.tweens.add({targets:this.promptLb,alpha:0.4,duration:700,yoyo:true,repeat:-1});
    this.readyToContinue=true;
  }

  continueGame(){
    this.scene.start('GameScene');
  }
}

// ═══════════════════════════════════════════════════════════════
//  BOOT
// ═══════════════════════════════════════════════════════════════
new Phaser.Game({
  type:Phaser.AUTO, parent:'game', width:W, height:H,
  pixelArt:true, backgroundColor:'#050508',
  scale:{ mode:Phaser.Scale.FIT, autoCenter:Phaser.Scale.CENTER_BOTH, zoom:2 },
  scene:[GameScene, LeaderboardScene],
});
