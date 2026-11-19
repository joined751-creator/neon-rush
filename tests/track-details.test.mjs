import test from 'node:test';
import assert from 'node:assert/strict';
import { Track } from '../src/level/Track.js';
import { TRACKS } from '../src/level/TrackDefs.js';
import { buildTrackDetails } from '../src/level/TrackDetails.js';
import { THEMES } from '../src/core/Constants.js';
import * as THREE from 'three';

test('detail batches stay bounded and transforms are finite for every track and direction', () => {
 for(const def of TRACKS) for(const mirror of [false,true]) {
  const track=new Track(def,mirror);
  const group=buildTrackDetails(track,THEMES[def.theme],'high');
  assert.equal(group.children.length,2);
  for(const mesh of group.children) {
   assert.ok(mesh.count>0 && mesh.count<500);
   assert.ok([...mesh.instanceMatrix.array].every(Number.isFinite));
   assert.ok(Number.isFinite(mesh.boundingSphere.radius));
   assert.equal(mesh.castShadow,false);
   mesh.geometry.dispose();mesh.material.dispose();mesh.dispose();
  }
 }
});
test('low quality reduces detail and omits sector arches', () => {
 const track=new Track(TRACKS[0]);
 const low=buildTrackDetails(track,THEMES.sunset,'low');
 const high=buildTrackDetails(track,THEMES.sunset,'high');
 assert.ok(low.children[0].count<high.children[0].count);
 const m=new THREE.Matrix4(), scale=new THREE.Vector3(),pos=new THREE.Vector3(),q=new THREE.Quaternion();
 for(let i=0;i<low.children[0].count;i++) { low.children[0].getMatrixAt(i,m); m.decompose(pos,q,scale); assert.ok(scale.y<2); }
 for(const g of [low,high])for(const mesh of g.children){mesh.geometry.dispose();mesh.material.dispose();mesh.dispose();}
});
