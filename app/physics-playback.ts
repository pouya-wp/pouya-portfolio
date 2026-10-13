import * as THREE from 'three';

/* The offline solve, fetched rather than bundled. As an import it was 700 KB of
   object literal inside app.js that the browser had to parse before the first frame;
   as a fetch it downloads beside the sculpture and goes through JSON.parse, which is
   several times faster than evaluating the same data as script. */
type Baked = { explosion: number[][]; drop: number[][] };
let baked: Baked | null = null;

export async function loadBaked(url = '/physics-baked.json') {
  if (baked) return;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Physics bake request failed: ${response.status}`);
  baked = await response.json() as Baked;
}

type Pose = { position: THREE.Vector3; quaternion: THREE.Quaternion };
const next = new THREE.Quaternion();

export function sampleBaked(kind: 'explosion' | 'drop', t: number, index: number, out: Pose) {
  if (!baked) return;
  const frames = baked[kind];
  const f = Math.max(0, Math.min(frames.length - 1, t * (frames.length - 1)));
  const a = Math.floor(f), b = Math.min(a + 1, frames.length - 1), k = index * 7, blend = f - a;
  out.position.set(
    THREE.MathUtils.lerp(frames[a][k], frames[b][k], blend),
    THREE.MathUtils.lerp(frames[a][k + 1], frames[b][k + 1], blend),
    THREE.MathUtils.lerp(frames[a][k + 2], frames[b][k + 2], blend));
  out.quaternion.set(frames[a][k + 3], frames[a][k + 4], frames[a][k + 5], frames[a][k + 6]);
  out.quaternion.slerp(next.set(frames[b][k + 3], frames[b][k + 4], frames[b][k + 5], frames[b][k + 6]), blend);
}
