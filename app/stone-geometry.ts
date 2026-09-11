import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';

/* The object is a machined obsidian disc: a superellipse of revolution, so the
   faces read flat and the rim rolls over softly. One implicit function describes
   it, which gives us three things for free - a smooth high-resolution mesh for the
   intact shot, an exact surface normal for every fractured shard so the shards keep
   the polish of the original, and a convex body the fracture can be carved out of. */

export const DISC = { radius: 1.72, half: 0.44, power: 4.2 };

/** Radius of the profile at height parameter s in [-1, 1]. */
export function profileRadius(s: number): number {
  const t = Math.min(1, Math.abs(s));
  return DISC.radius * Math.pow(Math.max(0, 1 - Math.pow(t, DISC.power)), 1 / DISC.power);
}

/** Analytic outward normal of the disc surface at a point on (or near) it. */
export function surfaceNormal(x: number, y: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
  const r = Math.hypot(x, z);
  const n = DISC.power;
  if (r < 1e-5) return out.set(0, Math.sign(y) || 1, 0);
  const dr = n * Math.pow(r, n - 1) / Math.pow(DISC.radius, n);
  const dy = n * Math.pow(Math.abs(y), n - 1) * Math.sign(y) / Math.pow(DISC.half, n);
  return out.set(dr * x / r, dy, dr * z / r).normalize();
}

/** The implicit value of the disc: 1 exactly on the surface, below inside. */
export function surfaceValue(x: number, y: number, z: number): number {
  const r = Math.hypot(x, z), n = DISC.power;
  return Math.pow(r / DISC.radius, n) + Math.pow(Math.abs(y) / DISC.half, n);
}

/** Slide a point radially onto the surface. */
export function projectToSurface(p: THREE.Vector3): THREE.Vector3 {
  const f = surfaceValue(p.x, p.y, p.z);
  return f > 1e-6 ? p.multiplyScalar(Math.pow(f, -1 / DISC.power)) : p;
}

/** The intact disc: indexed, smooth-shaded, with a UV that follows the lathe. */
export function discGeometry(radial = 220, rings = 150): THREE.BufferGeometry {
  const position: number[] = [], normal: number[] = [], uv: number[] = [], index: number[] = [];
  const n = new THREE.Vector3();
  for (let i = 0; i <= rings; i++) {
    // bias samples toward the rim, where the curvature actually is
    const t = i / rings;
    const s = Math.sign(t - .5) * Math.pow(Math.abs(t - .5) * 2, .62);
    const r = profileRadius(s), y = DISC.half * s;
    for (let j = 0; j <= radial; j++) {
      const a = j / radial * Math.PI * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      position.push(x, y, z);
      surfaceNormal(x, y, z, n);
      normal.push(n.x, n.y, n.z);
      uv.push(j / radial, t);
    }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    index.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(index);
  return geometry;
}

/* ------------------------------------------------------------------ fracture */

type Face = { points: THREE.Vector3[]; cut: boolean };

/** Clip a closed convex cell against one Voronoi bisector, capping the opening. */
function clip(faces: Face[], normal: THREE.Vector3, offset: number): Face[] {
  const result: Face[] = [], cap: THREE.Vector3[] = [];
  for (const face of faces) {
    const out: THREE.Vector3[] = [];
    for (let i = 0; i < face.points.length; i++) {
      const a = face.points[i], b = face.points[(i + 1) % face.points.length];
      const da = a.dot(normal) - offset, db = b.dot(normal) - offset;
      if (da <= .00001) out.push(a);
      if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
        const point = a.clone().lerp(b, da / (da - db));
        out.push(point);
        if (!cap.some(p => p.distanceToSquared(point) < 1e-9)) cap.push(point);
      }
    }
    if (out.length >= 3) result.push({ points: out, cut: face.cut });
  }
  if (cap.length >= 3) {
    const center = cap.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(cap.length);
    const u = new THREE.Vector3().crossVectors(normal, Math.abs(normal.y) < .9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
    const v = new THREE.Vector3().crossVectors(normal, u);
    const angle = (p: THREE.Vector3) => Math.atan2(p.clone().sub(center).dot(v), p.clone().sub(center).dot(u));
    cap.sort((a, b) => angle(a) - angle(b));
    result.push({ points: cap, cut: true });
  }
  return result;
}

/** Shard seeds laid out like a dropped plate: rings of cells, jittered, a few
    of them splitting the disc through its thickness. */
function shardSeeds(random: () => number): THREE.Vector3[] {
  const seeds: THREE.Vector3[] = [new THREE.Vector3(0, (random() - .5) * .18, 0)];
  const rings: [number, number][] = [[.34, 6], [.63, 11], [.87, 16], [.98, 7]];
  for (const [rr, count] of rings) {
    const spin = random() * Math.PI * 2;
    for (let i = 0; i < count; i++) {
      const a = spin + (i + (random() - .5) * .55) / count * Math.PI * 2;
      const r = DISC.radius * rr * (.9 + random() * .2);
      seeds.push(new THREE.Vector3(Math.cos(a) * r, (random() - .5) * DISC.half * 1.5, Math.sin(a) * r));
    }
  }
  return seeds;
}

/* The kintsugi seams. A cut face touches the outside world only along the edges
   whose two ends sit on the disc surface; those edges, widened into ribbons that
   hug the surface normal, are the inlaid metal you see on the intact object. */
export function seamRibbons(cells: { geometry: THREE.BufferGeometry; center: THREE.Vector3 }[]): THREE.BufferGeometry {
  const width = .052, lift = 1.0022;
  const position: number[] = [], normal: number[] = [], across: number[] = [], sides: number[] = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), n = new THREE.Vector3();
  const dir = new THREE.Vector3(), side = new THREE.Vector3(), mid = new THREE.Vector3();
  const corner = new THREE.Vector3();
  const seen = new Set<string>();

  for (const cell of cells) {
    const attr = cell.geometry.getAttribute('position');
    for (const group of cell.geometry.groups) {
      if (group.materialIndex !== 1) continue;
      for (let i = group.start; i < group.start + group.count; i += 3) {
        for (let k = 0; k < 3; k++) {
          a.fromBufferAttribute(attr, i + k).add(cell.center);
          b.fromBufferAttribute(attr, i + (k + 1) % 3).add(cell.center);
          if (Math.abs(surfaceValue(a.x, a.y, a.z) - 1) > .14) continue;
          if (Math.abs(surfaceValue(b.x, b.y, b.z) - 1) > .14) continue;
          if (a.distanceToSquared(b) < 1e-5) continue;
          // each seam is shared by two cells; draw it once
          const key = [a, b].map(p => `${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}`).sort().join('|');
          if (seen.has(key)) continue;
          seen.add(key);

          projectToSurface(a); projectToSurface(b);
          mid.copy(a).add(b).multiplyScalar(.5);
          surfaceNormal(mid.x, mid.y, mid.z, n);
          dir.copy(b).sub(a).normalize();
          side.crossVectors(n, dir).normalize().multiplyScalar(width / 2);

          const unit = side.clone().normalize();
          const quad = [
            corner.copy(a).addScaledVector(side, 1).clone(),
            corner.copy(a).addScaledVector(side, -1).clone(),
            corner.copy(b).addScaledVector(side, -1).clone(),
            corner.copy(b).addScaledVector(side, 1).clone(),
          ].map(p => projectToSurface(p).multiplyScalar(lift));
          // -1 to 1 across the bead, so the shader can round it off
          const t = [1, -1, -1, 1];
          for (const [x, y, z] of [[0, 1, 2], [0, 2, 3]] as const) {
            for (const idx of [x, y, z]) {
              const p = quad[idx];
              position.push(p.x, p.y, p.z);
              surfaceNormal(p.x, p.y, p.z, n);
              normal.push(n.x, n.y, n.z);
              across.push(t[idx]);
              sides.push(unit.x, unit.y, unit.z);
            }
          }
        }
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  geometry.setAttribute('aAcross', new THREE.Float32BufferAttribute(across, 1));
  geometry.setAttribute('aSide', new THREE.Float32BufferAttribute(sides, 3));
  return geometry;
}

export function fracturedStone(random: () => number) {
  // a coarse hull is enough to carve against; the shard normals come from the
  // implicit surface afterwards, so the low sample count never shows
  const cloud: THREE.Vector3[] = [];
  for (let i = 0; i <= 16; i++) {
    const s = -1 + (i / 16) * 2, r = profileRadius(s), y = DISC.half * s;
    if (r < .002) { cloud.push(new THREE.Vector3(0, y, 0)); continue; }
    for (let j = 0; j < 30; j++) {
      const a = j / 30 * Math.PI * 2;
      cloud.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
    }
  }
  const hull = new ConvexGeometry(cloud);
  const positions = hull.getAttribute('position');
  const shell: Face[] = [];
  for (let i = 0; i < positions.count; i += 3) {
    shell.push({ points: [0, 1, 2].map(k => new THREE.Vector3().fromBufferAttribute(positions, i + k)), cut: false });
  }
  hull.dispose();

  const seeds = shardSeeds(random);
  const normal = new THREE.Vector3();

  return seeds.map((seed, index) => {
    // only nearby seeds can contribute a face, which keeps the carve cheap
    const neighbours = seeds
      .map((other, k) => ({ other, k, d: other.distanceToSquared(seed) }))
      .filter(n => n.k !== index)
      .sort((a, b) => a.d - b.d)
      .slice(0, 14);

    let faces: Face[] = shell.map(f => ({ points: f.points.map(p => p.clone()), cut: false }));
    for (const { other } of neighbours) {
      const n = other.clone().sub(seed).normalize();
      const mid = other.clone().add(seed).multiplyScalar(.5);
      faces = clip(faces, n, n.dot(mid));
    }

    const vertices = faces.flatMap(f => f.points);
    const center = vertices.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(vertices.length || 1);

    const pos: number[] = [], nor: number[] = [], rim: number[] = [];
    const groups: { start: number; count: number; materialIndex: number }[] = [];
    for (const face of faces) {
      const start = pos.length / 3;
      // a cut face is flat and razor sharp; a shell face keeps the polished curve
      const flat = new THREE.Vector3();
      if (face.cut && face.points.length >= 3) {
        flat.crossVectors(
          face.points[1].clone().sub(face.points[0]),
          face.points[2].clone().sub(face.points[0])).normalize();
      }
      for (let i = 1; i < face.points.length - 1; i++) {
        for (const p of [face.points[0], face.points[i], face.points[i + 1]]) {
          const local = p.clone().sub(center);
          pos.push(local.x, local.y, local.z);
          if (face.cut) nor.push(flat.x, flat.y, flat.z);
          else { surfaceNormal(p.x, p.y, p.z, normal); nor.push(normal.x, normal.y, normal.z); }
          // 1 where this vertex touches the outside world, 0 deep in the break:
          // the metal is poured along that boundary
          const f = surfaceValue(p.x, p.y, p.z);
          rim.push(face.cut ? Math.max(0, Math.min(1, (f - .74) / .26)) : 1);
        }
      }
      groups.push({ start, count: pos.length / 3 - start, materialIndex: face.cut ? 1 : 0 });
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geometry.setAttribute('aRim', new THREE.Float32BufferAttribute(rim, 1));
    groups.forEach(g => geometry.addGroup(g.start, g.count, g.materialIndex));
    return { geometry, center };
  });
}
