import test from 'node:test';
import assert from 'node:assert/strict';
import { ContractRun } from '../src/gameplay/RaceContracts.js';
const car = () => ({ kmh: 180, drifting: true, driftLevel: 2, boosting: true });
const step = (run, c, seconds) => { const done = []; for (let i=0;i<seconds*60;i++) done.push(...run.update(1/60,c)); return done; };
test('contracts complete once, remain capped, and reach S rank', () => {
  const run = new ContractRun();
  assert.equal(step(run, car(), 11).length, 3);
  assert.equal(run.rank, 'S');
  assert.equal(step(run, car(), 11).length, 0);
  assert.deepEqual(run.goals.map(g => g.value), [10,6,5]);
});
test('clean line resets on an impact and slow driving; completed goals survive', () => {
  const run = new ContractRun();
  step(run, car(), 5); run.impact();
  assert.equal(run.goals[0].value, 0);
  step(run, car(), 5); step(run, {kmh: 50}, 1);
  assert.equal(run.goals[0].value, 0);
  step(run, car(), 10); run.impact();
  assert.equal(run.goals[0].done, true);
  assert.equal(run.goals[0].value, 10);
});
test('finish, elimination and closed reports freeze stats and rewards', () => {
  for (const flag of ['finished','eliminated']) {
    const run = new ContractRun();
    assert.equal(step(run, {...car(), [flag]:true}, 12).length, 0);
    assert.equal(run.stats.time, 0);
  }
  const run = new ContractRun(); run.closed = true;
  step(run, car(), 12); run.impact();
  assert.equal(run.stats.time, 0); assert.equal(run.stats.impacts, 0);
});
test('airborne drift and low-speed boost do not farm contracts', () => {
  const run = new ContractRun();
  step(run, {...car(), airborne:true, kmh:30}, 12);
  assert.equal(run.completed, 0);
});
