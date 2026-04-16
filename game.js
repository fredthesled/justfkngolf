/* Just F'kn Golf — v0.2
 *
 * You are the caddy. The golfer trusts you completely. Use that.
 *
 * TIMING BAR ZONES (left to right sweep):
 *   [ === green progress === | GOOD ZONE | [CRIT SLIVER] | GOOD ZONE | === ]
 *   CRITICAL sliver  → golfer flinches badly, +0 suspicion (too smooth to catch)
 *   GOOD zone        → golfer flinches, +8 suspicion (he's getting suspicious)
 *   Outside window   → nothing happens, +28 suspicion (he knows it was you)
 *   No heckle at all → golfer plays clean, -15 suspicion (good caddy, nothing to see)
 *
 * SCORING: Total strokes the golfer takes over 9 holes. More = better.
 *   Critical heckle → +3 strokes (massive shank, penalty drop, re-tee)
 *   Good heckle     → +1 stroke  (flinch, flubbed shot, one more try)
 *   Suspicion full  → GAME OVER (you've been ejected from the course)
 */

const W = 480, H = 270;

const PAL = {
  skyTop:    0x1a2a4a,
  skyBot:    0x5a90d0,
  hill:      0x2a6040,
  rough:     0x1a5020,
  fairway:   0x3aa040,
  fairwayDk: 0x28782e,
  sand:      0xe0c060,
  flag:      0xe02828,
  green:     0x58c858,
  // golfer
  gShirt:    0xf0f0f0,
  gPants:    0x1828b0,
  gSkin:     0xe8b888,
  gHat:      0xb01818,
  gClub:     0xd0d0d0,
  // caddy
  cBib:      0x28882a,
  cShirt:    0xe8e8d0,
  cPants:    0xb09060,
  cSkin:     0xe8c090,
  cCap:      0xf0f0e0,
  cBag:      0x805030,
  // crowd
  cr1: 0xb83030, cr2: 0x2850b0, cr3: 0xb09030, cr4: 0x704090, cr5: 0x408060,
  // UI
  mBg:       0x0f0f0f,
  mGood:     0x30e030,
  mWarn:     0xf0a020,
  mCrit:     0xffff30,
  mBad:      0xe02020,
  suspLow:   0x30e030,
  suspMid:   0xf0a020,
  suspHi:    0xe02020,
  white:     0xffffff,
  black:     0x000000,
};

// Suspicion delta per heckle result
const SUSP = { CRITICAL: 0, GOOD: 8, MISS: 28, IDLE: -15 };
// Extra strokes per heckle result
const STROKE_BONUS = { CRITICAL: 3, GOOD: 1, MISS: 0, IDLE: 0 };
// Crit sliver is this fraction of the flinch window width
const CRIT_FRACTION = 0.22;

// ──────────────────────────────────────────────────────────────────────────────
class MainScene extends Phaser.Scene {
  constructor() { super('main'); }

  // ── SETUP ──────────────────────────────────────────────────────────────────
  create() {
    this.gameData = {
      hole:        1,
      maxHoles:    9,
      totalStrokes:0,
      suspicion:   0,      // 0–100
      maxSuspicion:100,
    };
    this.swingState = 'idle'; // idle | swinging | result
    this.swingT       = 0;
    this.swingDur     = 2400;
    this.heckled      = false;
    this.holeResult   = null; // CRITICAL | GOOD | MISS | IDLE

    this.buildCourse();
    this.buildCrowd();
    this.buildGolfer();
    this.buildCaddy();
    this.buildBall();
    this.buildTimingBar();
    this.buildSuspicionMeter();
    this.buildHUD();

    this.input.keyboard.on('keydown-SPACE', () => this.onHeckle());
    this.input.keyboard.on('keydown-R',     () => this.scene.restart());

    this.time.delayedCall(900, () => this.beginSwing());
  }

  // ── COURSE ─────────────────────────────────────────────────────────────────
  buildCourse() {
    const g = this.add.graphics();
    // sky
    g.fillStyle(PAL.skyTop);  g.fillRect(0, 0,   W, 55);
    g.fillStyle(PAL.skyBot);  g.fillRect(0, 55,  W, 95);
    // distant hills
    g.fillStyle(PAL.hill);
    g.fillTriangle(0, 150, 130, 85, 255, 150);
    g.fillTriangle(200, 150, 340, 95, 480, 150);
    // rough base
    g.fillStyle(PAL.rough);   g.fillRect(0, 148, W, H - 148);
    // fairway ellipse
    g.fillStyle(PAL.fairway); g.fillEllipse(W/2, 218, 470, 130);
    // fairway stripes
    g.fillStyle(PAL.fairwayDk);
    for (let i = 0; i < 22; i++) g.fillRect(14 + i*21, 168 + ((i*11)%38), 9, 2);
    // sand trap
    g.fillStyle(PAL.sand);    g.fillEllipse(368, 212, 72, 24);
    // distant green
    g.fillStyle(PAL.green);   g.fillEllipse(92, 144, 34, 10);
    // flag pole + pennant
    g.fillStyle(0x666666);    g.fillRect(91, 116, 2, 28);
    g.fillStyle(PAL.flag);    g.fillTriangle(93, 116, 104, 121, 93, 126);
  }

  // ── CROWD ──────────────────────────────────────────────────────────────────
  buildCrowd() {
    const g = this.add.graphics();
    g.fillStyle(0x3a2510); g.fillRect(0, 156, W, 2); // rope
    const cols = [PAL.cr1, PAL.cr2, PAL.cr3, PAL.cr4, PAL.cr5];
    this.crowdHeads = [];
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < 27; i++) {
        const x = 8 + i*17 + row*9;
        const y = 147 - row*9;
        const c = cols[(i + row * 3) % cols.length];
        const head = this.add.rectangle(x, y, 10, 10, c);
        const face = this.add.rectangle(x, y+2, 6, 4, PAL.gSkin);
        this.crowdHeads.push({ head, face, baseY: y, phase: i * 0.38 + row });
      }
    }
    this.crowdT = 0;
    this.crowdExcited = 0; // 0=calm, 1=excited, lerps
  }

  // ── GOLFER ─────────────────────────────────────────────────────────────────
  buildGolfer() {
    const gx = 252, gy = 220;
    this.golferContainer = this.add.container(gx, gy);

    this.gShadow = this.add.ellipse(0, 2, 28, 6, 0, 0.3);
    this.gLegL   = this.add.rectangle(-4, -10, 5, 20, PAL.gPants);
    this.gLegR   = this.add.rectangle( 4, -10, 5, 20, PAL.gPants);
    this.gTorso  = this.add.rectangle( 0, -28, 14, 18, PAL.gShirt);
    this.gHead   = this.add.rectangle( 0, -42, 10, 10, PAL.gSkin);
    this.gHat    = this.add.rectangle( 0, -48, 12,  4, PAL.gHat);
    this.gBrim   = this.add.rectangle( 4, -46,  6,  2, PAL.gHat);

    // angry eyebrow (hidden until suspicion > 60)
    this.gBrow = this.add.rectangle(0, -45, 8, 2, 0x000000).setAlpha(0);

    this.gArms = this.add.container(0, -32);
    this.gArms.add([
      this.add.rectangle(-2, 6, 4, 14, PAL.gSkin),
      this.add.rectangle( 2, 6, 4, 14, PAL.gSkin),
    ]);
    this.gClub = this.add.container(0, -32);
    this.gClub.add([
      this.add.rectangle(0,  22, 2, 46, PAL.gClub),
      this.add.rectangle(-3, 46, 8,  4, PAL.gClub),
    ]);
    this.gClub.setRotation(-0.3);

    this.golferContainer.add([
      this.gShadow, this.gLegL, this.gLegR, this.gTorso,
      this.gHead, this.gHat, this.gBrim, this.gBrow, this.gArms, this.gClub,
    ]);

    // floating reaction text
    this.golferReaction = this.add.text(gx + 12, gy - 55, '', {
      fontFamily: 'Courier New', fontSize: '10px', color: '#ff6060',
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(0).setAlpha(0);
  }

  // ── CADDY ──────────────────────────────────────────────────────────────────
  buildCaddy() {
    const cx = 200, cy = 220;
    this.caddyX = cx; this.caddyY = cy;
    this.caddyContainer = this.add.container(cx, cy);

    this.cShadow = this.add.ellipse(0, 2, 22, 5, 0, 0.3);
    this.cLegL   = this.add.rectangle(-3, -9,  4, 18, PAL.cPants);
    this.cLegR   = this.add.rectangle( 3, -9,  4, 18, PAL.cPants);
    this.cTorso  = this.add.rectangle( 0, -26, 12, 16, PAL.cShirt);
    // green caddy bib
    this.cBib    = this.add.rectangle( 0, -26,  9, 14, PAL.cBib);
    this.cHead   = this.add.rectangle( 0, -40,  9,  9, PAL.cSkin);
    this.cCap    = this.add.rectangle( 0, -46, 11,  3, PAL.cCap);
    this.cVisor  = this.add.rectangle(-4, -44,  5,  2, PAL.cCap);

    // arms as separate containers so we can animate them independently
    this.cArmL = this.add.container(-6, -30);
    this.cArmL.add(this.add.rectangle(0, 5, 3, 12, PAL.cSkin));
    this.cArmR = this.add.container( 6, -30);
    this.cArmR.add(this.add.rectangle(0, 5, 3, 12, PAL.cSkin));

    // hand object for props (air horn, phone)
    this.cProp = this.add.rectangle(0, 0, 0, 0, 0xffff00).setAlpha(0);

    // golf bag (to the right of caddy)
    const bag = this.add.container(14, -8);
    bag.add([
      this.add.rectangle(0, 0,   8, 22, PAL.cBag),       // bag body
      this.add.rectangle(0, -14, 9,  4, 0x604020),        // bag top rim
      this.add.rectangle(-2, -18, 2, 8, PAL.gClub),       // club handle 1
      this.add.rectangle( 1, -17, 2, 7, PAL.gClub),       // club handle 2
      this.add.rectangle( 3, -16, 2, 6, PAL.gClub),       // club handle 3
    ]);

    this.caddyContainer.add([
      this.cShadow, this.cLegL, this.cLegR, this.cTorso, this.cBib,
      this.cHead, this.cCap, this.cVisor, this.cArmL, this.cArmR, bag,
    ]);

    // heckle speech bubble (floats above caddy)
    this.heckleText = this.add.text(cx - 10, cy - 62, '', {
      fontFamily: 'Courier New', fontSize: '13px', color: '#ffff55',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setAlpha(0);

    // "caught!" exclamation
    this.caughtText = this.add.text(cx, cy - 70, '!!', {
      fontFamily: 'Courier New', fontSize: '16px', color: '#ff3030',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setAlpha(0);
  }

  // ── BALL ───────────────────────────────────────────────────────────────────
  buildBall() {
    this.ball       = this.add.circle(272, 221, 2.5, PAL.white);
    this.ballShadow = this.add.ellipse(272, 223, 6, 2, 0, 0.35);
  }

  // ── TIMING BAR ─────────────────────────────────────────────────────────────
  buildTimingBar() {
    this.tbar = { x: 70, y: H - 28, w: W - 140, h: 11 };

    this.tBarBg = this.add.rectangle(
      this.tbar.x, this.tbar.y, this.tbar.w, this.tbar.h, PAL.mBg
    ).setOrigin(0, 0.5).setStrokeStyle(1, PAL.white);

    this.tBarFill = this.add.rectangle(
      this.tbar.x, this.tbar.y, 0, this.tbar.h - 2, PAL.mGood
    ).setOrigin(0, 0.5);

    // GOOD zone (flinch window)
    this.tGoodZone = this.add.rectangle(
      this.tbar.x, this.tbar.y, 0, this.tbar.h - 2, PAL.mBad, 0.45
    ).setOrigin(0, 0.5);

    // CRIT sliver
    this.tCritZone = this.add.rectangle(
      this.tbar.x, this.tbar.y, 0, this.tbar.h, PAL.mCrit, 0.85
    ).setOrigin(0, 0.5);

    // sweeping playhead
    this.tPlayhead = this.add.rectangle(
      this.tbar.x, this.tbar.y, 2, this.tbar.h + 7, PAL.white
    ).setOrigin(0.5);

    // zone labels
    this.tLabelGood = this.add.text(0, this.tbar.y + 9, 'HECKLE', {
      fontFamily: 'Courier New', fontSize: '8px', color: '#ff8040',
    }).setOrigin(0.5).setAlpha(0);
    this.tLabelCrit = this.add.text(0, this.tbar.y + 9, 'PERFECT', {
      fontFamily: 'Courier New', fontSize: '8px', color: '#ffff30',
    }).setOrigin(0.5).setAlpha(0);

    [this.tBarBg, this.tBarFill, this.tGoodZone, this.tCritZone,
     this.tPlayhead, this.tLabelGood, this.tLabelCrit].forEach(o => o.setVisible(false));
  }

  // ── SUSPICION METER ────────────────────────────────────────────────────────
  buildSuspicionMeter() {
    const sx = W - 8, sy = 24, sw = 88, sh = 7;
    this.suspBar = { x: sx - sw, y: sy, w: sw, h: sh };

    this.add.text(sx - sw - 2, sy, 'SUSPICION', {
      fontFamily: 'Courier New', fontSize: '8px', color: '#dddddd',
      stroke: '#000', strokeThickness: 1,
    }).setOrigin(1, 0.5);

    this.suspBg = this.add.rectangle(
      sx - sw, sy, sw, sh, PAL.mBg
    ).setOrigin(0, 0.5).setStrokeStyle(1, 0x888888);

    this.suspFill = this.add.rectangle(
      sx - sw, sy, 0, sh - 2, PAL.suspLow
    ).setOrigin(0, 0.5);

    // flashing danger overlay
    this.suspDanger = this.add.rectangle(
      sx - sw, sy, sw, sh, 0xff0000, 0
    ).setOrigin(0, 0.5);

    this.suspLabel = this.add.text(sx, sy + 6, 'CLUELESS', {
      fontFamily: 'Courier New', fontSize: '8px', color: '#30ff30',
    }).setOrigin(1, 0);
  }

  // ── HUD ────────────────────────────────────────────────────────────────────
  buildHUD() {
    this.holeText = this.add.text(8, 8, '', {
      fontFamily: 'Courier New', fontSize: '11px', color: '#ffffff',
      stroke: '#000', strokeThickness: 2,
    });
    this.strokeText = this.add.text(8, 20, '', {
      fontFamily: 'Courier New', fontSize: '11px', color: '#ffff60',
      stroke: '#000', strokeThickness: 2,
    });
    this.promptText = this.add.text(W/2, H - 12, '', {
      fontFamily: 'Courier New', fontSize: '10px', color: '#9cff9c',
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5);
    this.updateHUD();
  }

  updateHUD() {
    const d = this.gameData;
    this.holeText.setText(`HOLE ${d.hole} / ${d.maxHoles}`);
    this.strokeText.setText(`STROKES: ${d.totalStrokes}`);
    this.promptText.setText('SPACE = HECKLE');
    this.updateSuspicionMeter();
  }

  updateSuspicionMeter() {
    const pct = this.gameData.suspicion / this.gameData.maxSuspicion;
    const bw  = this.suspBar.w * pct;
    this.suspFill.width = bw;

    // color shift low→mid→high
    let col, labelText, labelCol;
    if (pct < 0.35) {
      col = PAL.suspLow;   labelText = 'CLUELESS';    labelCol = '#30ff30';
    } else if (pct < 0.65) {
      col = PAL.suspMid;   labelText = 'UNEASY';      labelCol = '#f0a020';
    } else if (pct < 0.88) {
      col = PAL.suspHi;    labelText = 'SUSPICIOUS';  labelCol = '#ff6020';
    } else {
      col = 0xff2020;      labelText = '!! FURIOUS !!'; labelCol = '#ff2020';
    }
    this.suspFill.fillColor = col;
    this.suspLabel.setText(labelText).setColor(labelCol);
    this.gBrow.setAlpha(pct > 0.6 ? (pct - 0.6) / 0.4 : 0);
  }

  // ── GAME FLOW ──────────────────────────────────────────────────────────────
  beginSwing() {
    if (this.swingState === 'over') return;
    this.swingState = 'swinging';
    this.swingT     = 0;
    this.heckled    = false;
    this.holeResult = null;

    // Scale difficulty with hole
    const hole = this.gameData.hole;
    this.swingDur = Math.max(1150, 2400 - hole * 135);

    // flinch window: narrows over 9 holes
    const winWidth = Math.max(0.10, 0.22 - hole * 0.013);
    const winStart = Phaser.Math.FloatBetween(0.40, 0.82 - winWidth);
    const winEnd   = winStart + winWidth;

    // crit sliver: centered within the window
    const critW   = winWidth * CRIT_FRACTION;
    const critMid = winStart + winWidth / 2;
    this.window = { start: winStart, end: winEnd, critStart: critMid - critW/2, critEnd: critMid + critW/2 };

    // position good-zone marker
    this.tGoodZone.x = this.tbar.x + this.tbar.w * winStart;
    this.tGoodZone.width = this.tbar.w * winWidth;
    this.tCritZone.x = this.tbar.x + this.tbar.w * this.window.critStart;
    this.tCritZone.width = this.tbar.w * critW;

    const midX = this.tbar.x + this.tbar.w * critMid;
    const goodMidX = this.tbar.x + this.tbar.w * (winStart + winWidth * 0.25);
    this.tLabelCrit.x = midX;
    this.tLabelGood.x = goodMidX;

    [this.tBarBg, this.tBarFill, this.tGoodZone, this.tCritZone,
     this.tPlayhead, this.tLabelGood, this.tLabelCrit].forEach(o => o.setVisible(true));

    this.promptText.setText('SPACE = HECKLE');
    this.tLabelGood.setAlpha(0.8);
    this.tLabelCrit.setAlpha(1.0);
  }

  onHeckle() {
    if (this.swingState !== 'swinging' || this.heckled) return;
    this.heckled = true;

    const t = this.swingT / this.swingDur;
    const w = this.window;

    let result;
    if (t >= w.critStart && t <= w.critEnd) {
      result = 'CRITICAL';
    } else if (t >= w.start && t <= w.end) {
      result = 'GOOD';
    } else {
      result = 'MISS';
    }

    this.holeResult = result;

    // pick a heckle type and animate the caddy
    const types = result === 'MISS'
      ? ['cough'] // whiffed — weak attempt
      : ['cough', 'airhorn', 'cough', 'sneeze'];
    const heckleType = Phaser.Utils.Array.GetRandom(types);
    this.animateCaddyHeckle(heckleType, result);

    if (result === 'CRITICAL' || result === 'GOOD') {
      this.triggerGolferFlinch(result);
    } else {
      // bad timing — golfer catches you looking suspicious
      this.triggerSuspicionSpike();
    }
  }

  // ── CADDY ANIMATIONS ───────────────────────────────────────────────────────
  animateCaddyHeckle(type, result) {
    const lines = {
      CRITICAL: ['"Noonan…"', '*barely audible cough*', '   *innocent whistle*'],
      GOOD:     ['"MISS IT!"', '*COUGH*', '"YOU\'RE A BUM!"', '"NOONAN!"'],
      MISS:     ['"...uh"', '*weak cough*', '"…nice day?"'],
    };
    const line = Phaser.Utils.Array.GetRandom(lines[result]);
    this.heckleText.setText(line)
      .setX(this.caddyX - 10)
      .setY(this.caddyY - 62)
      .setAlpha(1);
    this.tweens.add({
      targets: this.heckleText, y: this.caddyY - 75, alpha: 0,
      duration: 1100, ease: 'Quad.easeOut',
    });

    if (type === 'cough') {
      this.animateCaddyCough(result);
    } else if (type === 'airhorn') {
      this.animateCaddyAirHorn();
    } else {
      this.animateCaddyCough(result); // sneeze = same rig for now
    }
  }

  animateCaddyCough(result) {
    // lean forward, hand to mouth
    this.tweens.add({
      targets: this.caddyContainer,
      y: this.caddyY + 3, duration: 100,
      yoyo: true, repeat: result === 'CRITICAL' ? 1 : 2,
      onComplete: () => this.caddyContainer.y = this.caddyY,
    });
    this.tweens.add({
      targets: this.cArmR, rotation: -1.1, duration: 80,
      yoyo: true, repeat: result === 'CRITICAL' ? 1 : 2,
    });
    if (result === 'GOOD' || result === 'CRITICAL') {
      this.cameras.main.shake(result === 'CRITICAL' ? 180 : 100,
                               result === 'CRITICAL' ? 0.005 : 0.003);
    }
  }

  animateCaddyAirHorn() {
    // arm shoots up; a small horn rect appears
    this.tweens.add({
      targets: this.cArmR, rotation: -2.2, duration: 90, yoyo: true, repeat: 1,
    });
    // horn prop
    const horn = this.add.rectangle(this.caddyX + 8, this.caddyY - 42, 12, 5, 0xffaa00);
    this.tweens.add({
      targets: horn, x: this.caddyX + 20, alpha: 0,
      duration: 400, ease: 'Quad.easeOut',
      onComplete: () => horn.destroy(),
    });
    this.cameras.main.shake(180, 0.006);
  }

  triggerGolferFlinch(result) {
    // jerk the club, wobble the body
    const jerk = result === 'CRITICAL' ? 0.6 : 0.35;
    this.tweens.add({ targets: this.gClub, rotation: `+=${jerk}`, duration: 70, yoyo: true });
    this.tweens.add({ targets: this.gTorso, x: '+=2', duration: 60, yoyo: true });

    // sweat drop
    const sweat = this.add.text(
      this.golferContainer.x + 10, this.golferContainer.y - 50, '💦',
      { fontSize: '11px' }
    );
    this.tweens.add({ targets: sweat, y: sweat.y + 10, alpha: 0, duration: 500,
      onComplete: () => sweat.destroy() });

    // golfer reaction
    const reacts = result === 'CRITICAL'
      ? ['SHANK!!', 'OH NO—', 'FORE!!!']
      : ['"Wha—"', '"AUGH!"', '"Not again!"'];
    this.golferReaction.setText(Phaser.Utils.Array.GetRandom(reacts)).setAlpha(1);
    this.tweens.add({ targets: this.golferReaction, y: this.golferContainer.y - 65, alpha: 0,
      duration: 900, onComplete: () => this.golferReaction.y = this.golferContainer.y - 55 });
  }

  triggerSuspicionSpike() {
    // caddy freezes, does guilty look
    this.tweens.add({ targets: this.caddyContainer, x: this.caddyX - 3, duration: 60, yoyo: true, repeat: 3 });
    this.caughtText.setAlpha(1).setX(this.caddyX).setY(this.caddyY - 68);
    this.tweens.add({ targets: this.caughtText, y: this.caddyY - 80, alpha: 0, duration: 700 });
    this.cameras.main.shake(90, 0.003);

    // golfer glare
    this.golferReaction.setText('"Hey…"').setAlpha(1);
    this.tweens.add({ targets: this.golferReaction, alpha: 0, delay: 500, duration: 600,
      onComplete: () => this.golferReaction.y = this.golferContainer.y - 55 });
  }

  // ── SWING ANIMATION ────────────────────────────────────────────────────────
  animateGolferSwing(t) {
    let clubRot, armRot, torsoY;
    if (t < 0.38) {
      clubRot = -0.3; armRot = 0; torsoY = -28;
    } else if (t < 0.73) {
      const k = (t - 0.38) / 0.35;
      clubRot = -0.3 - k * 2.3;
      armRot  = -k * 0.8;
      torsoY  = -28 - Math.sin(k * Math.PI) * 1.2;
    } else if (t < 0.80) {
      clubRot = -2.6; armRot = -0.8; torsoY = -29.2;
    } else {
      const k = (t - 0.80) / 0.20;
      clubRot = -2.6 + k * 4.2;
      armRot  = -0.8 + k * 1.5;
      torsoY  = -28;
    }
    this.gClub.setRotation(clubRot);
    this.gArms.setRotation(armRot);
    this.gTorso.y = torsoY;
  }

  animateCaddyIdle(t) {
    // subtle weight shift
    const sway = Math.sin(t * 0.0015) * 0.8;
    this.caddyContainer.y = this.caddyY + sway;
    // casual arm swing
    this.cArmL.rotation = Math.sin(t * 0.001) * 0.12;
  }

  // ── UPDATE LOOP ────────────────────────────────────────────────────────────
  update(time, delta) {
    // crowd idle bob
    this.crowdT += delta;
    if (this.crowdHeads) {
      const excBonus = this.crowdExcited * 2.5;
      for (let i = 0; i < this.crowdHeads.length; i++) {
        const h = this.crowdHeads[i];
        const bob = Math.sin((this.crowdT + h.phase * 180) / 280) * (0.7 + excBonus);
        h.head.y = h.baseY + bob;
        h.face.y = h.baseY + 2 + bob;
      }
    }
    if (this.crowdExcited > 0) this.crowdExcited -= delta * 0.001;

    // suspicion meter flicker at high levels
    if (this.gameData.suspicion > 80) {
      this.suspDanger.setAlpha((Math.sin(time * 0.012) + 1) * 0.08);
    } else {
      this.suspDanger.setAlpha(0);
    }

    if (this.swingState !== 'swinging') return;

    this.swingT += delta;
    const t = Math.min(1, this.swingT / this.swingDur);

    this.animateGolferSwing(t);
    this.animateCaddyIdle(this.swingT);

    // bar fill
    this.tBarFill.width = this.tbar.w * t;
    this.tPlayhead.x    = this.tbar.x + this.tbar.w * t;

    // color cues
    const w = this.window;
    if (t >= w.critStart && t <= w.critEnd) {
      this.tBarFill.fillColor = PAL.mCrit;
    } else if (t >= w.start && t <= w.end) {
      this.tBarFill.fillColor = PAL.mWarn;
    } else {
      this.tBarFill.fillColor = PAL.mGood;
    }

    if (t >= 1) this.resolveSwing();
  }

  // ── RESOLVE ────────────────────────────────────────────────────────────────
  resolveSwing() {
    this.swingState = 'result';
    [this.tBarBg, this.tBarFill, this.tGoodZone, this.tCritZone,
     this.tPlayhead, this.tLabelGood, this.tLabelCrit].forEach(o => o.setVisible(false));

    const result = this.holeResult || 'IDLE';

    // apply suspicion change (clamped 0–100)
    const d = this.gameData;
    d.suspicion = Phaser.Math.Clamp(d.suspicion + SUSP[result], 0, d.maxSuspicion);

    // apply stroke bonus
    const bonus = STROKE_BONUS[result];
    d.totalStrokes += bonus;

    this.updateHUD();

    // crowd reaction
    if (result === 'CRITICAL' || result === 'GOOD') {
      this.crowdExcited = 1;
    }

    // animate ball
    if (result === 'CRITICAL') {
      // massive shank — ball squirts way offline
      this.tweens.add({
        targets: [this.ball, this.ballShadow], x: '+=55', y: '+=-30', duration: 350, ease: 'Quad.easeOut',
        onComplete: () => this.tweens.add({ targets: [this.ball, this.ballShadow], y: '+=32', duration: 280, ease: 'Bounce.easeOut' }),
      });
      this.promptText.setText(`MASSIVE SHANK! +${bonus} strokes 😬  [SPACE]`);
    } else if (result === 'GOOD') {
      this.tweens.add({
        targets: [this.ball, this.ballShadow], x: '+=22', y: '+=-14', duration: 300, ease: 'Quad.easeOut',
        onComplete: () => this.tweens.add({ targets: [this.ball, this.ballShadow], y: '+=16', duration: 240, ease: 'Bounce.easeOut' }),
      });
      this.promptText.setText(`Flinched! +${bonus} stroke  [SPACE]`);
    } else if (result === 'MISS') {
      this.promptText.setText('Poor timing — he\'s suspicious!  [SPACE]');
      this.animateSuspicionWarning();
    } else {
      // IDLE — let it ride
      this.promptText.setText('Clean shot. Suspicion eased.  [SPACE]');
      this.tweens.add({ targets: [this.ball, this.ballShadow], x: 92, y: 144, scale: 0.5, duration: 1000, ease: 'Quad.easeOut' });
    }

    // check game over FIRST
    if (d.suspicion >= d.maxSuspicion) {
      this.time.delayedCall(1200, () => this.triggerGameOver());
      return;
    }

    this.input.keyboard.once('keydown-SPACE', () => this.advanceHole());
  }

  animateSuspicionWarning() {
    // flash the suspicion bar
    this.tweens.add({
      targets: this.suspBg, alpha: 0.2, duration: 120, yoyo: true, repeat: 4,
      onComplete: () => this.suspBg.setAlpha(1),
    });
  }

  advanceHole() {
    const d = this.gameData;
    d.hole++;
    if (d.hole > d.maxHoles) {
      this.showVictory();
      return;
    }
    // reset ball
    this.ball.setPosition(272, 221).setScale(1);
    this.ballShadow.setPosition(272, 223).setScale(1);
    this.updateHUD();
    this.time.delayedCall(350, () => this.beginSwing());
  }

  // ── GAME OVER ──────────────────────────────────────────────────────────────
  triggerGameOver() {
    this.swingState = 'over';
    this.promptText.setText('');

    // caddy does "hands up, wasn't me" animation
    this.tweens.add({ targets: this.cArmL, rotation: -2.0, duration: 200 });
    this.tweens.add({ targets: this.cArmR, rotation:  2.0, duration: 200 });

    this.time.delayedCall(600, () => this.showGameOver());
  }

  showGameOver() {
    const d = this.gameData;
    const overlay = this.add.rectangle(W/2, H/2, W, H, 0x000000, 0.82);
    this.add.text(W/2, H/2 - 40, '⛳ EJECTED FROM THE COURSE', {
      fontFamily: 'Courier New', fontSize: '13px', color: '#ff3030',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5);
    this.add.text(W/2, H/2 - 18, `"Get that caddy out of here!"`, {
      fontFamily: 'Courier New', fontSize: '10px', color: '#ffaa40',
    }).setOrigin(0.5);
    this.add.text(W/2, H/2 + 4, `Holes played: ${d.hole - 1} / ${d.maxHoles}`, {
      fontFamily: 'Courier New', fontSize: '12px', color: '#ffffff',
    }).setOrigin(0.5);
    this.add.text(W/2, H/2 + 20, `Total strokes inflicted: ${d.totalStrokes}`, {
      fontFamily: 'Courier New', fontSize: '12px', color: '#ffff60',
    }).setOrigin(0.5);
    this.add.text(W/2, H/2 + 50, 'press R to try again', {
      fontFamily: 'Courier New', fontSize: '10px', color: '#888888',
    }).setOrigin(0.5);
  }

  showVictory() {
    this.swingState = 'over';
    const d = this.gameData;
    const par = 36; // par 4 × 9 holes
    const over = d.totalStrokes;
    const grade =
      over >= 14 ? '🏆 LEGENDARY SABOTEUR'  :
      over >= 10 ? '🎖  SEASONED AGITATOR'  :
      over >=  6 ? '😏 COMPETENT HECKLER'   :
      over >=  3 ? '🙄 AMATEUR DISTRACTOR'  :
                   '😇 SUSPICIOUSLY POLITE';

    this.add.rectangle(W/2, H/2, W, H, 0x000000, 0.82);
    this.add.text(W/2, H/2 - 44, '— ROUND COMPLETE —', {
      fontFamily: 'Courier New', fontSize: '14px', color: '#ffff60',
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5);
    this.add.text(W/2, H/2 - 22, `Golfer finished with ${over + par} total strokes`, {
      fontFamily: 'Courier New', fontSize: '11px', color: '#ffffff',
    }).setOrigin(0.5);
    this.add.text(W/2, H/2 - 8, `(${over} over par thanks to you)`, {
      fontFamily: 'Courier New', fontSize: '10px', color: '#9cff9c',
    }).setOrigin(0.5);
    this.add.text(W/2, H/2 + 10, grade, {
      fontFamily: 'Courier New', fontSize: '13px', color: '#ffcc00',
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5);
    this.add.text(W/2, H/2 + 38, `Final suspicion: ${Math.round(d.suspicion)}%`, {
      fontFamily: 'Courier New', fontSize: '10px', color: d.suspicion > 60 ? '#ff8040' : '#30ff30',
    }).setOrigin(0.5);
    this.add.text(W/2, H/2 + 55, 'press R to play again', {
      fontFamily: 'Courier New', fontSize: '10px', color: '#666666',
    }).setOrigin(0.5);
  }
}

// ── BOOT ───────────────────────────────────────────────────────────────────────
new Phaser.Game({
  type:            Phaser.AUTO,
  parent:          'game',
  width:           W,
  height:          H,
  pixelArt:        true,
  backgroundColor: '#050508',
  scale: {
    mode:        Phaser.Scale.FIT,
    autoCenter:  Phaser.Scale.CENTER_BOTH,
    zoom:        2,
  },
  scene: [MainScene],
});
