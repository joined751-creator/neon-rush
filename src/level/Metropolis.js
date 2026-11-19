import * as THREE from 'three';
import { rng, hashStr } from './WorldKit.js';

/** Seeded architectural composition, with clearance against the ENTIRE circuit. */
export function metropolisLayout(track, quality = 'medium') {
  const random = rng(hashStr(`${track.def.id}:architecture`));
  const budget = quality === 'low' ? 12 : quality === 'high' ? 56 : 32;
  const result = [];
  for (let attempt = 0; attempt < budget * 12 && result.length < budget; attempt++) {
    const s = random() * track.length;
    const side = random() > 0.5 ? 1 : -1;
    const layer = attempt % 3;
    const w = 7 + random() * 8;
    const d = 7 + random() * 8;
    const p = track.pointAt(s, side * (track.half + 32 + layer * 36 + random() * 20));
    const clearance = track.half + 12 + Math.hypot(w, d) / 2;
    let clear = true;
    for (let i = 0; i < track.n; i++) {
      if ((track.px[i] - p.x) ** 2 + (track.pz[i] - p.z) ** 2 < clearance ** 2) { clear = false; break; }
    }
    if (!clear || result.some((b) => Math.hypot(b.x - p.x, b.z - p.z) < (Math.hypot(w,d) + Math.hypot(b.w,b.d)) / 2 + 4)) continue;
    const height = 18 + random() * 42 + layer * 15;
    result.push({ x:p.x, y:p.y - 2, z:p.z, h:height, w, d, yaw:p.heading, tier:layer, style:Math.floor(random() * 3) });
  }
  return result;
}

/** Small facade texture: dark mullions, lit offices, warm/cool window variation. */
export function facadeTexture() {
  const width = 64, height = 128, pixels = new Uint8Array(width * height * 4);
  const random = rng(6084);
  const cells = Array.from({length:128}, () => ({ on:random() > 0.35, warm:random() > 0.7, dim:0.3 + random() * 0.65 }));
  for (let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const cell=cells[Math.floor(y/8)*8+Math.floor(x/8)];
    const lit=x%8>=2 && x%8<=5 && y%8>=2 && y%8<=5 && cell.on;
    const k=lit ? cell.dim : 0;
    const i=(y*width+x)*4;
    pixels[i]=Math.round((cell.warm?255:135)*k);
    pixels[i+1]=Math.round((cell.warm?184:218)*k);
    pixels[i+2]=Math.round((cell.warm?110:255)*k);
    pixels[i+3]=255;
  }
  const t=new THREE.DataTexture(pixels,width,height);
  t.colorSpace=THREE.SRGBColorSpace; t.generateMipmaps=true;
  t.minFilter=THREE.LinearMipmapLinearFilter; t.magFilter=THREE.LinearFilter;
  t.wrapS=t.wrapT=THREE.RepeatWrapping; t.needsUpdate=true;
  return t;
}

/** Three instanced draws: facades, plinths/crowns and restrained illuminated trim. */
export function buildMetropolis(track, theme, quality) {
  const group=new THREE.Group(); group.name='metropolis';
  const layout=metropolisLayout(track,quality);
  if (!layout.length) return group;
  const transform=new THREE.Object3D();
  const solid=[], luminous=[];
  const primary=new THREE.Color(theme.roadLine ?? 0x00e5ff);
  const accent=new THREE.Color(theme.kerbA ?? 0xffad64);
  const facade=facadeTexture();
  const geometry=new THREE.BoxGeometry(1,1,1);
  // Roof/underside UVs point to a dark mullion, instead of drawing windows on the roof.
  for(let i=0;i<geometry.attributes.normal.count;i++) if(Math.abs(geometry.attributes.normal.getY(i))>0.5) geometry.attributes.uv.setXY(i,0,0);
  const buildings=new THREE.InstancedMesh(geometry,new THREE.MeshStandardMaterial({color:0x132535,metalness:0.38,roughness:0.38,emissive:0xffffff,emissiveMap:facade,emissiveIntensity:0.65}),layout.length);
  const add=(list,b,x,y,z,w,h,d,color=null)=> {
    transform.position.set(b.x+Math.cos(b.yaw)*x+Math.sin(b.yaw)*z,b.y+y,b.z-Math.sin(b.yaw)*x+Math.cos(b.yaw)*z);
    transform.rotation.set(0,b.yaw,0);transform.scale.set(w,h,d);transform.updateMatrix();
    list.push({m:transform.matrix.clone(),color});
  };
  layout.forEach((b,i)=>{
    transform.position.set(b.x,b.y+b.h/2,b.z);transform.rotation.set(0,b.yaw,0);transform.scale.set(b.w,b.h,b.d);transform.updateMatrix();buildings.setMatrixAt(i,transform.matrix);
    add(solid,b,0,1.5,0,b.w+3,3,b.d+3);
    add(solid,b,0,b.h+1,0,b.w+0.7,2,b.d+0.7);
    const color=b.style===1?accent:primary;
    // Architectural light blades on opposite corners, with clear dark facade between them.
    for(const side of [-1,1]) add(luminous,b,side*(b.w/2+0.05),b.h/2,side*(b.d/2+0.05),0.09,b.h,0.09,color);
    if(b.style===0) {
      add(solid,b,0,b.h+5,0,b.w*0.55,8,b.d*0.55);
      add(luminous,b,0,b.h+9.1,0,b.w*0.55+0.1,0.12,b.d*0.55+0.1,color);
    } else if(b.style===1) {
      add(solid,b,0,b.h+5,0,0.25,8,0.25);
      add(luminous,b,0,b.h+9.3,0,0.45,0.45,0.45,accent);
    } else {
      add(solid,b,0,b.h+3,0,b.w*0.75,4,b.d*0.75);
    }
  });
  const batch=(entries,mat,name)=>{
    const m=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),mat,entries.length);m.name=name;
    entries.forEach((e,i)=>{m.setMatrixAt(i,e.m);if(e.color)m.setColorAt(i,e.color);});
    m.instanceMatrix.needsUpdate=true;if(m.instanceColor)m.instanceColor.needsUpdate=true;m.computeBoundingSphere();group.add(m);
  };
  buildings.name='layered-facades';buildings.instanceMatrix.needsUpdate=true;buildings.computeBoundingSphere();group.add(buildings);
  batch(solid,new THREE.MeshStandardMaterial({color:0x182b39,roughness:0.48,metalness:0.55}),'architectural-structure');
  batch(luminous,new THREE.MeshBasicMaterial({color:0xffffff}),'architectural-light');
  return group;
}
