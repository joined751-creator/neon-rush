import test from 'node:test';
import assert from 'node:assert/strict';
import { THEMES } from '../src/core/Constants.js';
import '../src/level/GridWorld.js';
test('registering Grid preserves the identity of all other circuits',()=>{
 assert.equal(THEMES.sunset.props,'palms');assert.equal(THEMES.sunset.sun,true);
 assert.equal(THEMES.city.props,'city');assert.equal(THEMES.city.wet,1);assert.equal(THEMES.city.particles,'rain');
 assert.equal(THEMES.arctic.props,'ice');assert.equal(THEMES.arctic.particles,'snow');assert.ok(THEMES.arctic.frost>0);
 assert.equal(THEMES.volcano.props,'rocks');assert.equal(THEMES.volcano.smoke,true);
 assert.equal(THEMES.space.props,'space');assert.equal(THEMES.space.floating,true);
 assert.equal(THEMES.grid.props,'grid');assert.equal(THEMES.grid.digital,1);
 for(const key of ['sunset','city','arctic','volcano','space'])assert.ok(!THEMES[key].digital);
});
