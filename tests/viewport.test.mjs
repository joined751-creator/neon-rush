import test from 'node:test';
import assert from 'node:assert/strict';
import { viewportSize, fitAppViewport, renderPixelRatio } from '../src/systems/Viewport.js';
import { RenderSystem } from '../src/systems/RenderSystem.js';

test('Safari visible viewport wins over stale innerHeight; CSS follows toolbar changes', () => {
  const win={innerWidth:844,innerHeight:334,visualViewport:{width:844,height:390,scale:1,offsetTop:0}};
  const app={style:{}};
  fitAppViewport(app,viewportSize(win));assert.equal(app.style.height,'390px');
  win.visualViewport.height=320;fitAppViewport(app,viewportSize(win));assert.equal(app.style.height,'320px');
  win.visualViewport.width=390;win.visualViewport.height=844;
  assert.deepEqual(viewportSize(win),{W:390,H:844,x:0,y:0});
});
test('fallback viewport and pinch zoom do not shrink the game render buffer', () => {
  assert.deepEqual(viewportSize({innerWidth:1280,innerHeight:720}),{W:1280,H:720,x:0,y:0});
  assert.equal(viewportSize({innerWidth:844,innerHeight:390,visualViewport:{width:422,height:195,scale:2}}).W,844);
});
test('retina resolution retains its clarity floor, desktop never falls below native 1x', () => {
  for(const scale of [1,.95,.85,.5]) {
    assert.ok(renderPixelRatio(3,'medium',scale)>=1.5);
    assert.ok(renderPixelRatio(1,'medium',scale)>=1);
  }
  assert.equal(renderPixelRatio(3,'medium'),1.75);
  assert.equal(renderPixelRatio(3,'high'),2);
  assert.equal(renderPixelRatio(3,'low'),1.25);
});
test('FXAA stays on in every quality; low keeps cheap postprocessing instead of bypassing smoothing', () => {
  globalThis.matchMedia=()=>({matches:true});
  const r=Object.create(RenderSystem.prototype);
  const target=()=>({samples:0,dispose(){}});
  Object.assign(r,{renderer:{capabilities:{maxSamples:4}},composer:{renderTarget1:target(),renderTarget2:target()},fxaa:{},bloom:{},cine:{},speedPass:{},resize(){}});
  for(const q of ['low','medium','high']) {
    r.setQuality(q);assert.equal(r.fxaa.enabled,true);
    assert.equal(r.composer.renderTarget1.samples,q==='low'?0:2);
    assert.equal(r.bloom.enabled,q!=='low');
  }
  r.renderer.capabilities.maxSamples=0;r.setQuality('high');assert.equal(r.composer.renderTarget1.samples,0);assert.equal(r.fxaa.enabled,true);
  delete globalThis.matchMedia;
});
test('event-driven viewport resize still tells the game to relayout HUD on the next frame', () => {
  globalThis.window={innerWidth:844,innerHeight:390};
  const r=Object.create(RenderSystem.prototype);
  Object.assign(r,{size:{W:844,H:390},viewportX:0,viewportY:0,layoutDirty:true});
  assert.equal(r.checkSize(),true);assert.equal(r.checkSize(),false);
  delete globalThis.window;
});
