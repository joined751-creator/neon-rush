import test from 'node:test';
import assert from 'node:assert/strict';
import { Track } from '../src/level/Track.js';
import { TRACKS } from '../src/level/TrackDefs.js';
import { THEMES } from '../src/core/Constants.js';
import '../src/level/GridWorld.js';
import { metropolisLayout, buildMetropolis, facadeTexture } from '../src/level/Metropolis.js';
import { createPaintFinish } from '../src/gameplay/PaintFinish.js';
import { disposeTree } from '../src/level/Environment.js';

test('all tracks and mirror directions have repeatable architecture clear of the full road',()=>{
 for(const def of TRACKS)for(const mirror of [false,true]) {
  const tr=new Track(def,mirror), layout=metropolisLayout(tr,'high');
  assert.ok(layout.length>0 && layout.length<=56);
  assert.deepEqual(layout,metropolisLayout(tr,'high'));
  for(const b of layout)for(let i=0;i<tr.n;i++)assert.ok(Math.hypot(tr.px[i]-b.x,tr.pz[i]-b.z)>=tr.half+12+Math.hypot(b.w,b.d)/2-1e-5);
 }
});
test('architecture is three bounded instanced draws and can be disposed repeatedly',()=>{
 const tr=new Track(TRACKS[0]);
 for(const quality of ['low','medium','high']) {
  const g=buildMetropolis(tr,THEMES.sunset,quality);
  assert.equal(g.children.length,3);
  let disposed=0;g.children[0].material.emissiveMap.addEventListener('dispose',()=>disposed++);
  for(const m of g.children){assert.ok(m.isInstancedMesh);assert.ok(m.count<=300);assert.ok([...m.instanceMatrix.array].every(Number.isFinite));assert.ok(Number.isFinite(m.boundingSphere.radius));assert.equal(m.castShadow,false);}
  disposeTree(g);assert.equal(disposed,1);
 }
 assert.ok(metropolisLayout(tr,'low').length<metropolisLayout(tr,'high').length);
});
test('procedural materials contain opaque pixels and mipmaps for distance filtering',()=>{
 for(const texture of [facadeTexture(),createPaintFinish()]) {
  assert.equal(texture.generateMipmaps,true);
  const data=texture.image.data;
  for(let i=3;i<data.length;i+=4)assert.equal(data[i],255);
  texture.dispose();
 }
});
