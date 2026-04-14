/* Just F'kn Golf — v0.1
 * Phaser 3 prototype. All art drawn in code with retro NES/Genesis-era palette.
 * Core loop: golfer winds up through a 4-phase swing. Press SPACE to heckle.
 * Hit the "FLINCH WINDOW" (the red zone on the timing bar) and the golfer shanks.
 * Miss it — clean shot, golfer keeps his composure, you lose crowd morale.
 */

const W = 480, H = 270; // 16:9 low-res, scales up crisp

const PAL = {
  sky:       0x6ab0ff,
  skyDark:   0x3a70c0,
  fairway:   0x4aa84a,
  fairwayDk: 0x2a7830,
  rough:     0x1f5a20,
  sand:      0xe8c46a,
  flag:      0xe03030,
  shirt:     0xe8e8e8,
  pants:     0x2030c0,
  skin:      0xe8b890,
  hat:       0xc02020,
  club:      0xd8d8d8,
  crowd1:    0xc04040,
  crowd2:    0x4060c0,
  crowd3:    0xc0a040,
  meterBg:   0x202020,
  meterGood: 0x40ff40,
  meterBad:  0xff4040,
  meterWarn: 0xffc040,
  text:      0xffffff,
};

class MainScene extends Phaser.Scene {
  constructor(){ super('main'); }

  create(){
    this.score = { ruined: 0, clean: 0, hole: 1, maxHoles: 9 };
    this.state = 'ready'; // ready -> swinging -> result
    this.swingT = 0;
    this.swingDuration = 2200; // ms, gets faster each hole
    this.flinchWindow = { start: 0.62, end: 0.78 }; // normalized t
    this.heckled = false;
    this.result = null;

    this.drawBackground();
    this.drawCrowd();
    this.drawGolfer();
    this.drawBall();
    this.drawHUD();
    this.drawTimingBar();

    this.input.keyboard.on('keydown-SPACE', () => this.onHeckle());
    this.input.keyboard.on('keydown-R', () => this.scene.restart());

    this.time.delayedCall(800, () => this.startSwing());
  }

  // -------- drawing --------
  drawBackground(){
    const g = this.add.graphics();
    // sky gradient (two bands)
    g.fillStyle(PAL.skyDark); g.fillRect(0, 0, W, 60);
    g.fillStyle(PAL.sky);     g.fillRect(0, 60, W, 90);
    // distant hills
    g.fillStyle(0x2a7040);
    g.fillTriangle(-20, 150, 120, 90, 240, 150);
    g.fillTriangle(180, 150, 320, 100, 460, 150);
    // fairway
    g.fillStyle(PAL.rough);   g.fillRect(0, 150, W, H-150);
    g.fillStyle(PAL.fairway); g.fillEllipse(W/2, 220, 460, 120);
    g.fillStyle(PAL.fairwayDk);
    for (let i=0;i<20;i++){
      g.fillRect(20+i*22, 170+((i*13)%40), 8, 2);
    }
    // sand trap
    g.fillStyle(PAL.sand); g.fillEllipse(360, 210, 70, 22);
    // distant flag
    g.fillStyle(0x5a5a5a); g.fillRect(90, 120, 1, 20);
    g.fillStyle(PAL.flag); g.fillTriangle(91, 120, 101, 124, 91, 128);
    // green circle in distance
    g.fillStyle(0x66d066); g.fillEllipse(95, 142, 30, 8);
  }

  drawCrowd(){
    const g = this.add.graphics();
    g.fillStyle(0x3a2a1a);
    g.fillRect(0, 155, W, 2); // rope line
    const colors = [PAL.crowd1, PAL.crowd2, PAL.crowd3, 0x8040a0, 0x60a060];
    this.crowdHeads = [];
    for (let row=0; row<2; row++){
      for (let i=0; i<28; i++){
        const x = 6 + i*17 + (row*8);
        const y = 146 - row*8;
        const c = colors[(i+row)%colors.length];
        const r = this.add.rectangle(x, y, 10, 10, c);
        const f = this.add.rectangle(x, y+2, 6, 4, PAL.skin);
        this.crowdHeads.push({r, f, baseY: y});
      }
    }
    this.crowdTime = 0;
  }

  drawGolfer(){
    const gx = 240, gy = 220;
    this.golfer = this.add.container(gx, gy);

    this.shadow = this.add.ellipse(0, 2, 26, 6, 0x000000, 0.35);
    this.golfer.add(this.shadow);

    this.legL = this.add.rectangle(-4, -10, 5, 20, PAL.pants);
    this.legR = this.add.rectangle(3,  -10, 5, 20, PAL.pants);
    this.torso = this.add.rectangle(0, -28, 14, 18, PAL.shirt);
    this.head  = this.add.rectangle(0, -42, 10, 10, PAL.skin);
    this.hat   = this.add.rectangle(0, -48, 12, 4,  PAL.hat);
    this.brim  = this.add.rectangle(4, -46, 6,  2,  PAL.hat);

    this.arms = this.add.container(0, -32);
    this.armL = this.add.rectangle(-2, 6, 4, 14, PAL.skin);
    this.armR = this.add.rectangle(2,  6, 4, 14, PAL.skin);
    this.arms.add([this.armL, this.armR]);

    this.club = this.add.container(0, -32);
    const shaft = this.add.rectangle(0, 22, 2, 46, PAL.club);
    const head  = this.add.rectangle(-3, 46, 8, 4, PAL.club);
    this.club.add([shaft, head]);
    this.club.setRotation(-0.3);

    this.golfer.add([this.legL, this.legR, this.torso, this.head, this.hat, this.brim, this.arms, this.club]);

    this.sweat = this.add.text(gx+8, gy-50, '💦', { fontSize: '12px' }).setAlpha(0);

    this.heckleText = this.add.text(W/2, 40, '', {
      fontFamily: 'Courier New', fontSize: '14px', color: '#ffff66',
      stroke: '#000', strokeThickness: 3
    }).setOrigin(0.5).setAlpha(0);
  }

  drawBall(){
    this.ball = this.add.circle(260, 221, 2.5, 0xffffff);
    this.ballShadow = this.add.ellipse(260, 223, 5, 2, 0x000000, 0.4);
  }

  drawHUD(){
    this.holeText = this.add.text(8, 8, '', {
      fontFamily: 'Courier New', fontSize: '12px', color: '#ffffff',
      stroke: '#000', strokeThickness: 2
    });
    this.scoreText = this.add.text(W-8, 8, '', {
      fontFamily: 'Courier New', fontSize: '12px', color: '#ffffff',
      stroke: '#000', strokeThickness: 2
    }).setOrigin(1, 0);
    this.promptText = this.add.text(W/2, H-14, 'SPACE = HECKLE', {
      fontFamily: 'Courier New', fontSize: '11px', color: '#9cff9c',
      stroke: '#000', strokeThickness: 2
    }).setOrigin(0.5);
    this.updateHUD();
  }

  updateHUD(){
    this.holeText.setText(`HOLE ${this.score.hole}/${this.score.maxHoles}`);
    this.scoreText.setText(`RUINED ${this.score.ruined}  CLEAN ${this.score.clean}`);
  }

  drawTimingBar(){
    this.bar = { x: 80, y: H-32, w: W-160, h: 10 };
    this.barBg = this.add.rectangle(this.bar.x, this.bar.y, this.bar.w, this.bar.h, PAL.meterBg)
      .setOrigin(0, 0.5).setStrokeStyle(1, 0xffffff);
    this.barFill = this.add.rectangle(this.bar.x, this.bar.y, 0, this.bar.h-2, PAL.meterGood)
      .setOrigin(0, 0.5);
    this.flinchMarker = this.add.rectangle(
      this.bar.x + this.bar.w * this.flinchWindow.start,
      this.bar.y,
      this.bar.w * (this.flinchWindow.end - this.flinchWindow.start),
      this.bar.h-2,
      PAL.meterBad, 0.55
    ).setOrigin(0, 0.5);
    this.playhead = this.add.rectangle(this.bar.x, this.bar.y, 2, this.bar.h+6, 0xffffff).setOrigin(0.5);
    this.barBg.setVisible(false); this.barFill.setVisible(false);
    this.flinchMarker.setVisible(false); this.playhead.setVisible(false);
  }

  // -------- game flow --------
  startSwing(){
    this.state = 'swinging';
    this.swingT = 0;
    this.heckled = false;
    this.result = null;
    const tight = Math.max(0.08, 0.18 - this.score.hole*0.012);
    const start = Phaser.Math.FloatBetween(0.45, 0.80 - tight);
    this.flinchWindow = { start, end: start + tight };
    this.flinchMarker.x = this.bar.x + this.bar.w * this.flinchWindow.start;
    this.flinchMarker.width = this.bar.w * (this.flinchWindow.end - this.flinchWindow.start);
    this.swingDuration = Math.max(1100, 2200 - this.score.hole*130);

    [this.barBg, this.barFill, this.flinchMarker, this.playhead].forEach(o => o.setVisible(true));
    this.promptText.setText('SPACE = HECKLE');
  }

  onHeckle(){
    if (this.state !== 'swinging' || this.heckled) return;
    this.heckled = true;
    const t = this.swingT / this.swingDuration;
    const inWindow = (t >= this.flinchWindow.start && t <= this.flinchWindow.end);
    const lines = inWindow
      ? ['*COUGH*', '"MISS IT!"', '"YOU\'RE A BUM!"', '"NOONAN!"', '*AIR HORN*']
      : ['"uh..."', '"um"', '*weak cough*', '"...go?"'];
    const line = Phaser.Utils.Array.GetRandom(lines);
    this.heckleText.setText(line).setAlpha(1);
    this.tweens.add({ targets: this.heckleText, y: 30, alpha: 0, duration: 900, onComplete: ()=> this.heckleText.y = 40 });
    if (inWindow){
      this.triggerFlinch();
    } else {
      this.cameras.main.shake(80, 0.002);
    }
  }

  triggerFlinch(){
    this.result = 'ruined';
    this.sweat.setAlpha(1);
    this.tweens.add({ targets: this.sweat, y: this.sweat.y+8, alpha: 0, duration: 500 });
    this.tweens.add({ targets: this.club, rotation: '+=0.4', duration: 80, yoyo: true });
    this.cameras.main.shake(140, 0.004);
  }

  update(time, delta){
    this.crowdTime += delta;
    if (this.crowdHeads){
      for (let i=0; i<this.crowdHeads.length; i++){
        const h = this.crowdHeads[i];
        const off = Math.sin((this.crowdTime + i*60)/300) * 0.8;
        h.r.y = h.baseY + off;
        h.f.y = h.baseY + 2 + off;
      }
    }

    if (this.state === 'swinging'){
      this.swingT += delta;
      const t = Math.min(1, this.swingT / this.swingDuration);
      this.animateSwing(t);
      this.barFill.width = this.bar.w * t;
      this.playhead.x = this.bar.x + this.bar.w * t;
      if (t >= this.flinchWindow.start && t <= this.flinchWindow.end){
        this.barFill.fillColor = PAL.meterWarn;
      }
      if (t >= 1){
        this.finishSwing();
      }
    }
  }

  animateSwing(t){
    let clubRot, armRot, torsoY;
    if (t < 0.4){
      clubRot = -0.3; armRot = 0; torsoY = -28;
    } else if (t < 0.75){
      const k = (t-0.4)/0.35;
      clubRot = -0.3 - k*2.2;
      armRot = -k*0.8;
      torsoY = -28 - Math.sin(k*Math.PI)*1;
    } else if (t < 0.82){
      clubRot = -2.5; armRot = -0.8; torsoY = -29;
    } else {
      const k = (t-0.82)/0.18;
      clubRot = -2.5 + k*4.0;
      armRot = -0.8 + k*1.4;
      torsoY = -28;
    }
    this.club.setRotation(clubRot);
    this.arms.setRotation(armRot);
    this.torso.y = torsoY;
  }

  finishSwing(){
    this.state = 'result';
    [this.barBg, this.barFill, this.flinchMarker, this.playhead].forEach(o => o.setVisible(false));

    if (this.result === 'ruined'){
      this.score.ruined++;
      this.promptText.setText('SHANKED! 😬  press SPACE to continue');
      this.tweens.add({
        targets: [this.ball, this.ballShadow],
        x: '+=30', y: '+=-20',
        duration: 400, ease: 'Quad.easeOut',
        onComplete: ()=>{
          this.tweens.add({ targets: [this.ball, this.ballShadow], y: '+=22', duration: 300, ease: 'Bounce.easeOut' });
        }
      });
    } else {
      this.score.clean++;
      this.promptText.setText('CLEAN SHOT — try again  press SPACE');
      this.tweens.add({
        targets: [this.ball, this.ballShadow],
        x: 95, y: 142, scale: 0.5,
        duration: 900, ease: 'Quad.easeOut'
      });
    }

    this.updateHUD();
    this.input.keyboard.once('keydown-SPACE', () => this.nextHole());
  }

  nextHole(){
    this.score.hole++;
    if (this.score.hole > this.score.maxHoles){
      this.showGameOver();
      return;
    }
    this.ball.setPosition(260, 221).setScale(1);
    this.ballShadow.setPosition(260, 223).setScale(1);
    this.time.delayedCall(300, () => this.startSwing());
  }

  showGameOver(){
    this.state = 'done';
    const grade =
      this.score.ruined >= 7 ? 'LEGENDARY HECKLER' :
      this.score.ruined >= 5 ? 'SEASONED JEERER'   :
      this.score.ruined >= 3 ? 'AMATEUR AGITATOR'  :
                               'POLITE FAN';
    this.add.rectangle(W/2, H/2, W, H, 0x000000, 0.75);
    this.add.text(W/2, H/2-30, 'ROUND COMPLETE', {
      fontFamily:'Courier New', fontSize:'18px', color:'#ffff66'
    }).setOrigin(0.5);
    this.add.text(W/2, H/2, `Ruined ${this.score.ruined} / ${this.score.maxHoles}`, {
      fontFamily:'Courier New', fontSize:'14px', color:'#ffffff'
    }).setOrigin(0.5);
    this.add.text(W/2, H/2+22, grade, {
      fontFamily:'Courier New', fontSize:'14px', color:'#9cff9c'
    }).setOrigin(0.5);
    this.add.text(W/2, H/2+50, 'press R to play again', {
      fontFamily:'Courier New', fontSize:'11px', color:'#aaaaaa'
    }).setOrigin(0.5);
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: W, height: H,
  pixelArt: true,
  backgroundColor: '#000',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, zoom: 2 },
  scene: [MainScene],
});
