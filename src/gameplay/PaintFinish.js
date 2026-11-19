import * as THREE from 'three';

/** Subtle tiled clear-coat variation, mipmapped to avoid distant sparkle. */
export function createPaintFinish() {
  const size=64, data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const i=(y*size+x)*4;
    const wave=Math.sin(x/size*Math.PI*8)*Math.sin(y/size*Math.PI*6);
    const v=Math.round(232+wave*16);
    data[i]=data[i+1]=data[i+2]=v;data[i+3]=255;
  }
  const texture=new THREE.DataTexture(data,size,size);
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;
  texture.generateMipmaps=true;texture.repeat.set(4,4);texture.needsUpdate=true;
  return texture;
}
