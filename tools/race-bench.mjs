// NEON RUSH race benchmark — measures bot driving quality headlessly.
//
//   bun build.mjs && npx playwright install chromium   (once)
//   node tools/race-bench.mjs [url] [difficulties] [tracks]
//   node tools/race-bench.mjs                      # dist/index.html, all difficulties, all tracks
//   node tools/race-bench.mjs "" 1,2 0,1           # normal+hard on the first two tracks
//
// Each run: 7 bots + the player car driven by the hard AI ("skilled player"), 3 laps, items on.
// Prints one JSON line per race: lap times, wall/car hits per lap, respawns, spin-outs,
// pack spread (m), average bot speed, the player's finishing place.
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const FILE = process.argv[2] || pathToFileURL(resolve('dist/index.html')).href;
const diffs = (process.argv[3] || '0,1,2').split(',').map(Number);
const tracks = (process.argv[4] || '0,1,2,3').split(',').map(Number);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
page.on('pageerror', (e) => console.log('PAGEERR', e.message));
await page.goto(FILE);
await page.waitForTimeout(1500);
const rows = [];
for (const d of diffs) for (const t of tracks) {
  const r = await page.evaluate(async ({ d, t }) => {
    const G = __GAME__, S = __GAME_STATE__, E = __EVENTS__, B = __EVENT_BUS__;
    Object.assign(S.settings, { mode: 'race', players: 1, bots: 7, difficulty: d, track: t, laps: 3, items: true, mirror: false, quality: 'low' });
    G.render.setQuality('low');
    G.startRace({ newGP: true });
    const race = G.race;
    race.setAutopilot(0, true); // "skilled player" = hard AI line, normal speed
    const me = race.humans[0];
    const stats = new Map(race.cars.map((c) => [c, { wall: 0, bigWall: 0, carHit: 0, spin: 0, respawn: 0, minSpeedEvents: 0 }]));
    const offs = [];
    offs.push(B.on(E.CAR_WALL_HIT, ({ car, impact }) => { const s = stats.get(car); if (s) { s.wall++; if (impact > 10) s.bigWall++; } }));
    offs.push(B.on(E.CAR_CAR_HIT, ({ a, b }) => { stats.get(a) && stats.get(a).carHit++; stats.get(b) && stats.get(b).carHit++; }));
    offs.push(B.on(E.CAR_SPINOUT, ({ car }) => { const s = stats.get(car); if (s) s.spin++; }));
    for (const c of race.cars) { const orig = c.respawn.bind(c); c.respawn = () => { stats.get(c).respawn++; orig(); }; }
    const dt = 1 / 60;
    let t0 = 0, gapSamples = [], speedSamples = [];
    for (let i = 0; i < 60 * 260; i++) {
      G.step(dt, false);
      if (race.phase === 'racing' && i % 60 === 0) {
        const ai = race.cars.filter((c) => !c.human);
        const prog = ai.map((c) => c.progress);
        gapSamples.push({ meVsBestAI: me.progress - Math.max(...prog), spread: Math.max(...prog) - Math.min(...prog) });
        speedSamples.push(ai.reduce((a, c) => a + c.kmh, 0) / ai.length);
      }
      if (race.cars.every((c) => c.finished || c.eliminated) ) break;
      if (me.finished && !t0) t0 = race.raceTime;
      if (t0 && race.raceTime - t0 > 25) break;
    }
    offs.forEach((f) => f());
    const ai = race.cars.filter((c) => !c.human);
    const sum = (k) => ai.reduce((a, c) => a + stats.get(c)[k], 0);
    const laps = ai.flatMap((c) => c.lapTimes);
    const res = {
      d, t, track: race.def.name,
      myPlace: me.place, myTime: me.finishTime ? +me.finishTime.toFixed(1) : null,
      aiFinished: ai.filter((c) => c.finished).length,
      aiBestLap: laps.length ? +Math.min(...laps).toFixed(2) : null,
      aiAvgLap: laps.length ? +(laps.reduce((a, b) => a + b, 0) / laps.length).toFixed(2) : null,
      myBestLap: isFinite(me.bestLap) ? +me.bestLap.toFixed(2) : null,
      aiWallPerLap: +(sum('wall') / (ai.length * 3)).toFixed(2),
      aiBigWallPerLap: +(sum('bigWall') / (ai.length * 3)).toFixed(2),
      aiCarHitsPerLap: +(sum('carHit') / (ai.length * 3)).toFixed(2),
      aiRespawns: sum('respawn'), aiSpins: sum('spin'),
      meWall: stats.get(me).wall,
      avgSpread: +(gapSamples.reduce((a, g) => a + g.spread, 0) / gapSamples.length).toFixed(0),
      meAheadOfBestAI: +(gapSamples.reduce((a, g) => a + g.meVsBestAI, 0) / gapSamples.length).toFixed(0),
      aiAvgKmh: +(speedSamples.reduce((a, b) => a + b, 0) / speedSamples.length).toFixed(0),
    };
    G.quit();
    return res;
  }, { d, t });
  console.log(JSON.stringify(r));
  rows.push(r);
}
await browser.close();
