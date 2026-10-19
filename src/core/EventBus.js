export const Events = {
  // Flow
  GAME_STATE: 'game:state',
  RACE_SETUP: 'race:setup',
  RACE_COUNTDOWN: 'race:countdown',
  RACE_GO: 'race:go',
  RACE_FINISHED: 'race:finished',
  RACE_PAUSE: 'race:pause',
  RACE_RESUME: 'race:resume',
  RACE_RESTART: 'race:restart',
  RACE_QUIT: 'race:quit',

  // Car
  CAR_LAP: 'car:lap',
  CAR_FINISH: 'car:finish',
  CAR_WALL_HIT: 'car:wallHit',
  CAR_CAR_HIT: 'car:carHit',
  CAR_DRIFT_LEVEL: 'car:driftLevel',
  CAR_BOOST: 'car:boost',
  CAR_SPINOUT: 'car:spinout',
  CAR_JUMP: 'car:jump',
  CAR_LAND: 'car:land',
  CAR_ELIMINATED: 'car:eliminated',
  CAR_SLIPSTREAM: 'car:slipstream',
  CAR_NEARMISS: 'car:nearMiss',
  CAR_OVERTAKE: 'car:overtake',
  CAR_OVERDRIVE: 'car:overdrive',

  // Items
  ITEM_PICKUP: 'item:pickup',
  ITEM_USE: 'item:use',
  ITEM_HIT: 'item:hit',
  SHIELD_BLOCK: 'item:shieldBlock',

  // UI / FX
  UI_POPUP: 'ui:popup',
  UI_ACTION: 'ui:action',
  GARAGE_CHANGED: 'garage:changed',
  UI_CLICK: 'ui:click',
  UI_HOVER: 'ui:hover',
  CAMERA_SHAKE: 'camera:shake',
  FIREWORK: 'fx:firework',
  THUNDER: 'fx:thunder',
  CAR_BACKFIRE: 'car:backfire',

  // Audio
  AUDIO_INIT: 'audio:init',
  AUDIO_TOGGLE: 'audio:toggle',
  MUSIC_MENU: 'music:menu',
  MUSIC_RACE: 'music:race',
  MUSIC_STOP: 'music:stop',
};

class EventBus {
  constructor() { this.listeners = {}; }
  on(event, cb) { (this.listeners[event] ||= []).push(cb); return () => this.off(event, cb); }
  off(event, cb) {
    if (!this.listeners[event]) return this;
    this.listeners[event] = this.listeners[event].filter((c) => c !== cb);
    return this;
  }
  emit(event, data = {}) {
    const list = this.listeners[event];
    if (!list) return this;
    for (const cb of list.slice()) {
      try { cb(data); } catch (err) { console.error(`EventBus error in ${event}:`, err); }
    }
    return this;
  }
  removeAll() { this.listeners = {}; return this; }
}

export const eventBus = new EventBus();
