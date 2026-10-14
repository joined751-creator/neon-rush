import * as THREE from 'three';
import { GAME, GP } from './Constants.js';
import { eventBus, Events } from './EventBus.js';
import { gameState } from './GameState.js';
import { RenderSystem } from '../systems/RenderSystem.js';
import { InputSystem } from '../systems/InputSystem.js';
import { AudioBridge } from '../audio/AudioBridge.js';
import { Race } from '../gameplay/Race.js';
import { Garage } from '../level/Garage.js';
import { Menus } from '../ui/Menus.js';
import { HUD } from '../ui/HUD.js';
import { TRACKS } from '../level/TrackDefs.js';
import { MobileControls } from '../systems/MobileControls.js';
import { setupPWA } from '../systems/PWA.js';

/** Orchestrator: owns systems, game flow (title → setup → garage → race → results) and the loop. */
export class Game {
  constructor() {
    this.gs = gameState;
    this.scene = new THREE.Scene();
    this.render = new RenderSystem(this.scene);
    this.render.setQuality(this.gs.settings.quality);
    this.input = new InputSystem();
    this.audio = new AudioBridge(this.gs);
    this.menus = new Menus(this.gs);
    this.hud = new HUD();
    this.garage = null;
    this.race = null;
    this.state = 'menu'; // menu | garage | race | paused | results
    this.clock = new THREE.Clock();
    this.time = 0;

    eventBus.on(Events.UI_ACTION, ({ action }) => this.onAction(action));
    eventBus.on(Events.GARAGE_CHANGED, ({ p }) => this.garage?.refresh(p, this.gs.garage[p]));
    eventBus.on(Events.RACE_FINISHED, (res) => this.onResults(res));
    this.input.onKey((e) => this.onKey(e));

    const unlock = () => {
      const fresh = this.audio.unlock();
      if (fresh) {
        if (this.state === 'race') { this.audio.setListeners(this.race.humans); eventBus.emit(Events.MUSIC_RACE); }
        else eventBus.emit(Events.MUSIC_MENU);
      }
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'race') this.pause(); });

    this.mobile = new MobileControls(this.input, this.gs);
    this.setupMobileShell();
    setupPWA(this.menus);
    this.perf = { acc: 0, frames: 0, good: 0 };
    this.startAttract();
    this.menus.show('title');
    this.render.renderer.setAnimationLoop(() => this.loop());
  }

  // ---------------------------------------------------------------- flow
  disposeRace() {
    if (this.race) { this.race.dispose(); this.race = null; }
  }

  startAttract() {
    this.disposeRace();
    this.render.setScene(this.scene);
    const track = Math.floor(Math.random() * TRACKS.length);
    this.race = new Race({
      scene: this.scene, render: this.render, settings: { ...this.gs.settings, track, mirror: false, items: true },
      garage: this.gs.garage, gameState: this.gs, input: this.input, demo: true,
    });
    this.state = 'menu';
    this.hud.hide();
    this.audio.setListeners([]);
    document.getElementById('pause-btn').hidden = true;
    this.mobile.hide();
    this.updateRotate();
  }

  openGarage() {
    if (!this.garage) this.garage = new Garage(this.render.renderer);
    this.garage.setup(this.gs.garage, this.gs.settings.players);
    this.render.setScene(this.garage.scene);
    this.render.setViews([{ camera: this.garage.camera, x: 0, y: 0, w: 1, h: 1 }]);
    this.render.renderer.toneMappingExposure = 1.1;
    this.state = 'garage';
  }

  leaveGarage() {
    this.render.setScene(this.scene);
    if (this.race) { this.race.setupViews(); this.render.renderer.toneMappingExposure = this.race.theme.exposure; }
    this.state = 'menu';
  }

  startRace({ newGP = false } = {}) {
    this.disposeRace();
    this.gs.reset();
    this.gs.screen = 'countdown';
    this.render.setScene(this.scene);
    this.input.players = this.gs.settings.players;
    if (this.mobile.enabled && this.gs.settings.players > 1) this.gs.settings.split = 'vertical'; // each player gets a half with own buttons
    let settings = this.gs.settings;
    if (settings.mode === 'gp') {
      if (newGP || !this.gp) this.gp = { round: 0, points: {}, roster: null, lastRows: null };
      settings = { ...settings, track: GP.TRACKS[this.gp.round], mirror: false };
    } else this.gp = null;
    this.race = new Race({
      scene: this.scene, render: this.render, settings, garage: this.gs.garage,
      gameState: this.gs, input: this.input, demo: false, roster: this.gp?.roster,
    });
    if (this.gp) this.gp.roster = this.race.roster;
    this.hud.setup(this.race, this.gs.settings);
    this.menus.hideAll();
    this.audio.setListeners(this.race.humans);
    eventBus.emit(Events.MUSIC_RACE);
    this.state = 'race';
    document.getElementById('pause-btn').hidden = false;
    this.mobile.setup(this.race);
    if (this.mobile.enabled) this.goFullscreen();
    if (this.mobile.enabled && this.gs.settings.steering === 'tilt') this.mobile.requestTilt().then(() => this.mobile.calibrateTilt());
    this.perf = { acc: 0, frames: 0, good: 0 };
    this.updateRotate();
    this.flash();
  }

  pause() {
    if (this.state !== 'race') return;
    this.state = 'paused';
    this.mobile.reset();
    this.menus.show('pause');
    this.audio.setListeners([]);
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = this.race?.results ? 'results' : 'race';
    this.menus.hideAll();
    this.clock.getDelta();
    this.audio.setListeners(this.race.humans);
  }

  quit() {
    this.gp = null;
    this.startAttract();
    this.menus.show('title');
    eventBus.emit(Events.MUSIC_MENU);
  }

  onResults(res) {
    if (this.state !== 'race') return;
    this.state = 'results';
    this.mobile.hide();
    this.updateRotate();
    let gpInfo = null;
    if (this.gp) {
      this.gp.lastRows = res.rows;
      const pts = { ...this.gp.points };
      for (const r of res.rows) pts[r.name] = (pts[r.name] || 0) + (GP.POINTS[r.place - 1] || 0);
      const standings = Object.entries(pts).map(([name, p]) => {
        const row = res.rows.find((r) => r.name === name);
        return { name, pts: p, gained: GP.POINTS[(row?.place || 99) - 1] || 0, human: row?.human, color: row?.color };
      }).sort((a, b) => b.pts - a.pts);
      gpInfo = { round: this.gp.round + 1, total: GP.TRACKS.length, standings, last: this.gp.round + 1 >= GP.TRACKS.length };
    }
    this.menus.showResults(res, this.race.humans.length, gpInfo);
  }

  nextRound() {
    if (!this.gp || !this.gp.lastRows) return;
    for (const r of this.gp.lastRows) this.gp.points[r.name] = (this.gp.points[r.name] || 0) + (GP.POINTS[r.place - 1] || 0);
    this.gp.lastRows = null;
    this.gp.round++;
    if (this.gp.round >= GP.TRACKS.length) { this.startRace({ newGP: true }); return; }
    this.startRace();
  }

  onAction(a) {
    switch (a) {
      case 'garage': this.openGarage(); break;
      case 'menu': this.leaveGarage(); break;
      case 'start': if (this.state === 'garage') this.startRace({ newGP: true }); break;
      case 'nextRound': this.nextRound(); break;
      case 'restart': this.startRace(); break;
      case 'resume': this.resume(); break;
      case 'pause': this.state === 'race' ? this.pause() : this.resume(); break;
      case 'quit': this.quit(); break;
      case 'quality': this.render.setQuality(this.gs.settings.quality); break;
      case 'tiltPermission': this.mobile.requestTilt(); break;
      default: break;
    }
  }

  onKey(e) {
    if (e.code === 'KeyM') { eventBus.emit(Events.AUDIO_TOGGLE); this.menus.syncMute(); return; }
    if (this.state === 'menu' || this.state === 'garage' || this.state === 'paused' || this.state === 'results') {
      if (this.state === 'paused' && (e.code === 'Escape' || e.code === 'KeyP')) return;
      this.menus.key(e);
    }
  }

  flash() {
    const f = document.getElementById('flash');
    f.style.transition = 'none';
    f.style.opacity = '0.6';
    requestAnimationFrame(() => { f.style.transition = 'opacity 0.6s'; f.style.opacity = '0'; });
  }

  // ---------------------------------------------------------------- mobile shell
  setupMobileShell() {
    const fs = document.getElementById('fs-btn');
    const canFS = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
    if (this.mobile.enabled && canFS) {
      fs.hidden = false;
      fs.addEventListener('click', () => {
        if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
        else this.goFullscreen();
      });
    }
    this.portraitOk = false;
    document.getElementById('rotate-skip').addEventListener('click', () => { this.portraitOk = true; this.updateRotate(); this.clock.getDelta(); });
    const onResize = () => { this.updateRotate(); if (this.state === 'race') this.mobile.calibrateTilt(); };
    window.addEventListener('resize', onResize);
    screen.orientation?.addEventListener?.('change', onResize);
  }

  /** Fullscreen + landscape lock where the browser allows it (Android Chrome); silently ignored elsewhere. */
  goFullscreen() {
    const el = document.documentElement;
    if (document.fullscreenElement || document.webkitFullscreenElement) return;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req) return;
    try {
      const p = req.call(el, { navigationUI: 'hide' });
      Promise.resolve(p).then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
    } catch { /* not allowed (iframe / iOS) */ }
  }

  /** Portrait phone during a race → overlay asking to rotate; the race waits underneath. */
  updateRotate() {
    const portrait = window.innerHeight > window.innerWidth * 1.05;
    this.rotateBlock = this.mobile.enabled && portrait && !this.portraitOk && this.state === 'race';
    document.getElementById('rotate').hidden = !this.rotateBlock;
    document.body.classList.toggle('portrait', portrait);
  }

  /** Dynamic resolution: phones that can't hold ~45 fps get a lower render scale, recovered when smooth. */
  adaptPerformance(dt) {
    if (this.state !== 'race' || this.gs.settings.quality === 'low') return;
    const pf = this.perf;
    pf.acc += dt; pf.frames++;
    if (pf.acc < 2) return;
    const fps = pf.frames / pf.acc;
    pf.acc = 0; pf.frames = 0;
    const sc = this.render.scale ?? 1;
    if (fps < 42 && sc > 0.55) { this.render.setScale(sc - 0.15); pf.good = 0; }
    else if (fps > 57) { pf.good++; if (pf.good >= 3 && sc < 1) { this.render.setScale(sc + 0.1); pf.good = 0; } }
    else pf.good = 0;
  }

  // ---------------------------------------------------------------- loop
  loop() {
    const raw = this.clock.getDelta();
    const dt = Math.min(raw, GAME.MAX_DELTA);
    this.time += dt;
    this.adaptPerformance(raw);
    this.step(dt);
  }

  step(dt, draw = true) {
    this.input.poll();
    if (this.state === 'race' && this.input.pausePressed()) this.pause();
    else if (this.state === 'paused' && this.input.pausePressed()) this.resume();

    if (this.state === 'garage') this.garage.update(dt);
    else if (this.race && this.state !== 'paused' && !this.rotateBlock) this.race.update(dt);
    if (this.state === 'race') this.mobile.update(this.race);
    this.render.setSpeedFX(this.state === 'race' || this.state === 'results' ? this.race.fxStrength : [0, 0]);

    if (this.state === 'race' || this.state === 'results') this.hud.update();
    this.audio.update();
    if (draw) this.render.render();
    this.input.endFrame();
  }
}
