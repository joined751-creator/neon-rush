import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PulseFX } from '../src/gameplay/PulseFX.js';
const car = () => ({ human:true, x:5, y:1, z:10 });
const race = (c) => ({ scene:new THREE.Scene(), phase:'racing', humans:[c] });
test('pooled pulses fade, reuse meshes, and clean up all scene resources', () => {
  const fx = new PulseFX(), c = car(), r = race(c);
  fx.attach(r);
  assert.equal(r.scene.children.length,12);
  const mesh = fx.pulses[0].mesh;
  fx.spawn(c,'boost');assert.equal(mesh.visible,true);
  fx.spawn(c,'boost');assert.equal(fx.pulses.filter(p => p.mesh.visible).length,1);
  fx.update(1);assert.equal(mesh.visible,false);
  fx.spawn(c,'land');assert.equal(fx.pulses[0].mesh,mesh);
  fx.detach();assert.equal(r.scene.children.length,0);assert.equal(fx.pulses.length,0);
});
test('countdown, bots, finished cars, stale cars and airborne boosts do not spawn', () => {
  const fx = new PulseFX(), c = car(), r = race(c);fx.attach(r);
  r.phase='countdown';fx.spawn(c,'boost');r.phase='racing';
  fx.spawn({...c,human:false},'boost');fx.spawn({...c},'boost');
  c.finished=true;fx.spawn(c,'boost');c.finished=false;
  c.airborne=true;fx.spawn(c,'boost');
  assert.equal(fx.pulses.some(p=>p.mesh.visible),false);
  fx.detach();
});
test('reduced motion and attract mode allocate no effect meshes', () => {
  const fx = new PulseFX(), c = car(), r = race(c);
  fx.reduced=true;fx.attach(r);assert.equal(r.scene.children.length,0);
  fx.reduced=false;fx.attach({...r,demo:true});assert.equal(r.scene.children.length,0);
  fx.detach();
});
