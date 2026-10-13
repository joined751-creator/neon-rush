import { CAR_TYPES, CAR_COLORS } from './Constants.js';

function loadJSON(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

class GameState {
  constructor() {
    // Persistent settings (survive restarts)
    this.settings = loadJSON('neonrush.settings', {
      mode: 'race', players: 1, track: 0, mirror: false, laps: 3, bots: 5,
      difficulty: 1, items: true, quality: 'medium', split: 'vertical', muted: false,
    });
    this.garage = loadJSON('neonrush.garage', [
      { type: 0, color: 0 },
      { type: 1, color: 1 },
    ]);
    this.records = loadJSON('neonrush.records', {}); // trackKey -> { bestLap, bestRace }
    this.ghosts = loadJSON('neonrush.ghosts', {}); // trackKey -> frames
    this.reset();
  }

  reset() {
    this.screen = 'title'; // title | setup | garage | countdown | racing | paused | results
    this.raceTime = 0;
    this.countdown = 0;
    this.finishedOrder = [];
    this.eliminationTimer = 0;
    this.raceOver = false;
  }

  trackKey() { return `${this.settings.track}${this.settings.mirror ? 'm' : ''}`; }

  saveSettings() { saveJSON('neonrush.settings', this.settings); saveJSON('neonrush.garage', this.garage); }
  saveRecords() { saveJSON('neonrush.records', this.records); }
  saveGhost(key, frames) { this.ghosts[key] = frames; saveJSON('neonrush.ghosts', this.ghosts); }

  carTypeOf(p) { return CAR_TYPES[this.garage[p].type]; }
  carColorOf(p) { return CAR_COLORS[this.garage[p].color]; }
}

export const gameState = new GameState();
