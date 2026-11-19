import test from 'node:test';
import assert from 'node:assert/strict';
import { visualLook } from '../src/systems/VisualLook.js';
import { THEMES } from '../src/core/Constants.js';
import '../src/level/GridWorld.js';
test('all world themes receive bounded highlights without mutating their source', () => {
 for(const theme of Object.values(THEMES)) {
  const before=JSON.stringify(theme);
  const fx=visualLook(theme.fx);
  assert.ok(fx.bloom.strength>0 && fx.bloom.strength<=0.5);
  assert.ok(fx.flare<=0.4 && fx.streak<=0.22 && fx.grade.sat<=1.05);
  assert.equal(fx.godCol,theme.fx.godCol);
  assert.equal(JSON.stringify(theme),before);
 }
 assert.equal(visualLook(null),null);
 assert.equal(visualLook(THEMES.city.fx).bloom.strength,0.46);
});
