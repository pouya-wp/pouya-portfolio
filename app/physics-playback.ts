import * as THREE from 'three';
import baked from '../public/physics-baked.json';
type Pose={position:THREE.Vector3;quaternion:THREE.Quaternion};
export function sampleBaked(kind:'explosion'|'drop',t:number,index:number,out:Pose){const frames=baked[kind],f=Math.max(0,Math.min(frames.length-1,t*(frames.length-1))),a=Math.floor(f),b=Math.min(a+1,frames.length-1),k=index*7,blend=f-a;out.position.set(THREE.MathUtils.lerp(frames[a][k],frames[b][k],blend),THREE.MathUtils.lerp(frames[a][k+1],frames[b][k+1],blend),THREE.MathUtils.lerp(frames[a][k+2],frames[b][k+2],blend));out.quaternion.set(frames[a][k+3],frames[a][k+4],frames[a][k+5],frames[a][k+6]);out.quaternion.slerp(new THREE.Quaternion(frames[b][k+3],frames[b][k+4],frames[b][k+5],frames[b][k+6]),blend);}
