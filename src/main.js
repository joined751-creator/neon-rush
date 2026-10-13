import { Game } from './core/Game.js';
import { eventBus, Events } from './core/EventBus.js';
import { gameState } from './core/GameState.js';

function start() {
  const game = new Game();

  // Expose for automated testing (game-creator QA contract)
  window.__GAME__ = game;
  window.__GAME_STATE__ = gameState;
  window.__EVENT_BUS__ = eventBus;
  window.__EVENTS__ = Events;

  /** AI-readable snapshot of the game without interpreting pixels. */
  window.render_game_to_text = () => {
    const race = game.race;
    const payload = {
      coords: 'x:right y:up z:forward; heading 0 = +z',
      state: game.state,
      screen: game.menus.current,
      settings: gameState.settings,
    };
    if (race) {
      payload.race = {
        demo: race.demo, mode: race.mode, phase: race.phase, time: +race.raceTime.toFixed(2),
        track: race.def.name, length: Math.round(race.track.length), laps: race.laps,
        cars: race.cars.map((c) => ({
          name: c.name, human: c.human, place: c.place, lap: c.lap, kmh: Math.round(c.kmh),
          x: +c.x.toFixed(1), z: +c.z.toFixed(1), item: c.item, nitro: Math.round(c.nitro),
          drifting: c.drifting, finished: c.finished, eliminated: c.eliminated,
        })),
      };
    }
    return JSON.stringify(payload);
  };

  /** Deterministic stepping for test scripts: advances simulation by ms in fixed steps. */
  window.advanceTime = (ms) => new Promise((resolve) => {
    const steps = Math.max(1, Math.round(ms / (1000 / 60)));
    for (let i = 0; i < steps; i++) game.step(1 / 60, i === steps - 1);
    requestAnimationFrame(() => resolve());
  });
}

const boot = window.claude?.hot?.ready ? (fn) => window.claude.hot.ready(fn) : (fn) => fn();
boot(start);
