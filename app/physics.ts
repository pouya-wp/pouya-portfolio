import * as THREE from 'three';
import {ConvexGeometry} from 'three/addons/geometries/ConvexGeometry.js';
import * as CANNON from '../public/vendor/cannon-es.js';
export type Pose={position:THREE.Vector3;quaternion:THREE.Quaternion};
export type Fragment={geometry:THREE.BufferGeometry;center:THREE.Vector3};
/* A collider is not a render mesh. Hulling every vertex of a shard would give
   Cannon a polyhedron with hundreds of faces, and SAT between two of those is
   quadratic - the bake never finishes. Forty-odd well spread points describe the
   shape closely enough for a fall onto a flat mat. */
const COLLIDER_POINTS = 44;

function shapeFor(geometry: THREE.BufferGeometry) {
  const attribute = geometry.getAttribute('position');
  const cloud: THREE.Vector3[] = [];
  const extremes = new Map<string, THREE.Vector3>();
  const axes: [keyof THREE.Vector3, number][] = [['x', 1], ['x', -1], ['y', 1], ['y', -1], ['z', 1], ['z', -1]];
  const point = new THREE.Vector3();

  const stride = Math.max(1, Math.floor(attribute.count / COLLIDER_POINTS));
  for (let i = 0; i < attribute.count; i++) {
    point.fromBufferAttribute(attribute, i);
    // keep the six extremes so the hull never shrinks inside the real shard
    for (const [axis, sign] of axes) {
      const key = `${String(axis)}${sign}`;
      const best = extremes.get(key);
      if (!best || (point[axis] as number) * sign > (best[axis] as number) * sign) extremes.set(key, point.clone());
    }
    if (i % stride === 0) cloud.push(point.clone());
  }
  cloud.push(...extremes.values());

  const hull = new ConvexGeometry(cloud);
  const attr = hull.getAttribute('position');
  const vertices: any[] = [];
  const faces: number[][] = [];
  const lookup = new Map<string, number>();
  for (let i = 0; i < attr.count; i += 3) {
    const face: number[] = [];
    for (let k = 0; k < 3; k++) {
      const x = attr.getX(i + k), y = attr.getY(i + k), z = attr.getZ(i + k);
      const key = [x, y, z].map(n => n.toFixed(6)).join(',');
      let index = lookup.get(key);
      if (index === undefined) {
        index = vertices.length;
        vertices.push(new CANNON.Vec3(x, y, z));
        lookup.set(key, index);
      }
      face.push(index);
    }
    if (face[0] !== face[1] && face[1] !== face[2] && face[0] !== face[2]) faces.push(face);
  }
  hull.dispose();
  return new CANNON.ConvexPolyhedron({ vertices, faces });
}

export function bakePhysics(fragments:Fragment[]){
 const world=new CANNON.World({gravity:new CANNON.Vec3(0,0,0)});world.solver.iterations=16;world.broadphase=new CANNON.SAPBroadphase(world);
 const material=new CANNON.Material('stone');world.defaultContactMaterial.friction=.62;world.defaultContactMaterial.restitution=.27;
 const bodies=fragments.map(({geometry,center},i)=>{geometry.computeBoundingBox();const size=geometry.boundingBox!.getSize(new THREE.Vector3()),mass=Math.max(.15,size.x*size.y*size.z*2);const body=new CANNON.Body({mass,material,shape:shapeFor(geometry),position:new CANNON.Vec3(center.x,center.y,center.z),linearDamping:.46,angularDamping:.4});body.collisionResponse=false;const direction=center.clone().sub(new THREE.Vector3(-.13,.45,-.4)).normalize(),speed=2.1+1.6/Math.sqrt(mass+1);body.velocity.set(direction.x*speed*.92,direction.y*speed*.4+.95,direction.z*speed*.62);body.angularVelocity.set(Math.sin(i*2.31)*1.4/Math.sqrt(mass+1),Math.cos(i*1.7)*1.1,Math.sin(i*.91)*1.3);world.addBody(body);return body;});
 const capture=()=>bodies.map(b=>({position:new THREE.Vector3(b.position.x,b.position.y,b.position.z),quaternion:new THREE.Quaternion(b.quaternion.x,b.quaternion.y,b.quaternion.z,b.quaternion.w)}));
 const explosion:Pose[][]=[fragments.map(f=>({position:f.center.clone(),quaternion:new THREE.Quaternion()}))];
 // there is no floor yet, so the cloud is held above the height the mat will occupy;
 // without this a shard can drift under the table before gravity is handed back
 const CEILING_FOR_THE_FLOOR=-1.85;
 for(let frame=0;frame<100;frame++){world.step(1/120);bodies.forEach(b=>{if(b.position.y<CEILING_FOR_THE_FLOOR){b.position.y=CEILING_FOR_THE_FLOOR;if(b.velocity.y<0)b.velocity.y*=-.22;}});explosion.push(capture());}
 const floor=new CANNON.Body({mass:0,material,shape:new CANNON.Plane()});floor.quaternion.setFromEuler(-Math.PI/2,0,0);floor.position.y=-2.65;world.addBody(floor);world.gravity.set(0,-9.81,0);bodies.forEach(b=>{b.collisionResponse=true;b.velocity.set(0,0,0);b.angularVelocity.scale(.3,b.angularVelocity);b.linearDamping=.18;b.angularDamping=.3;});
 const drop:Pose[][]=[capture()];for(let frame=0;frame<360;frame++){world.step(1/120);if(frame%2===1)drop.push(capture());}
 return {explosion,drop};
}
export function samplePose(frames:Pose[][],t:number,index:number,out:Pose){const f=Math.max(0,Math.min(frames.length-1,t*(frames.length-1))),i=Math.floor(f),a=frames[i][index],b=frames[Math.min(i+1,frames.length-1)][index];out.position.copy(a.position).lerp(b.position,f-i);out.quaternion.copy(a.quaternion).slerp(b.quaternion,f-i);}

