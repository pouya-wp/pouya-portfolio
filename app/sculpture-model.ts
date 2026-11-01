import * as THREE from 'three';

interface GlbNode {
  mesh?: number;
  matrix?: number[];
  translation?: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
}

interface GlbAccessor {
  bufferView: number;
  byteOffset?: number;
  componentType: number;
  count: number;
  type: string;
}

interface GlbBufferView {
  buffer: number;
  byteOffset?: number;
  byteLength: number;
}

interface GlbPrimitive {
  attributes: Record<string, number>;
  indices: number;
}

interface GlbMesh {
  primitives: GlbPrimitive[];
}

interface GlbManifest {
  nodes?: GlbNode[];
  meshes: GlbMesh[];
  accessors: GlbAccessor[];
  bufferViews: GlbBufferView[];
}


/* The supplied sculpture, and the fracture that breaks it.

   A plaster cast is hollow, so it does not break into solid chunks: it breaks into
   curved shell shards with a chalky inner face and a rough rim. That is exactly what
   this builds. Triangles of the original mesh are sorted into Voronoi cells, the few
   that straddle a boundary are clipped exactly against the bisector, and each cell is
   then given thickness by offsetting inward along the surface normal and stitching a
   rim between the two skins. The rim edges are also the crack lines, which is where
   the gold goes afterwards.

   The same code runs in the browser and in the offline physics bake, so the shards a
   visitor sees are the shards that were simulated. */

export type SourceMesh = {
  position: Float32Array;
  normal: Float32Array;
  index: Uint32Array;
};

/* ------------------------------------------------------------------ glb ---- */

/** Reads the first mesh primitive out of a .glb, with its node transform applied. */
export function parseGlb(buffer: ArrayBuffer): SourceMesh {
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error('not a glb');

  let json: GlbManifest | null = null;
  let bin: Uint8Array | null = null;
  let offset = 12;
  while (offset < view.byteLength) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const body = new Uint8Array(buffer, offset + 8, length);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(body));
    else if (type === 0x004e4942) bin = body;
    offset += 8 + length + ((4 - (length % 4)) % 4);
  }
  if (!json || !bin) throw new Error('glb is missing a chunk');

  const read = (accessorIndex: number) => {
    const accessor = json.accessors[accessorIndex];
    const bufferView = json.bufferViews[accessor.bufferView];
    const start = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[accessor.type as string]!;
    const count = accessor.count * components;
    const base = bin!.byteOffset + start;
    switch (accessor.componentType) {
      case 5126: return new Float32Array(buffer, base, count);
      case 5125: return new Uint32Array(buffer, base, count);
      case 5123: return new Uint16Array(buffer, base, count);
      case 5121: return new Uint8Array(buffer, base, count);
      default: throw new Error(`unsupported component type ${accessor.componentType}`);
    }
  };

  const primitive = json.meshes[0].primitives[0];
  const position = Float32Array.from(read(primitive.attributes.POSITION));
  const normal = primitive.attributes.NORMAL !== undefined
    ? Float32Array.from(read(primitive.attributes.NORMAL))
    : new Float32Array(position.length);
  const index = Uint32Array.from(read(primitive.indices));

  // apply whichever node points at this mesh
  const node = (json.nodes ?? []).find((n: GlbNode) => n.mesh === 0);
  if (node) {
    const matrix = new THREE.Matrix4();
    if (node.matrix) matrix.fromArray(node.matrix);
    else {
      matrix.compose(
        new THREE.Vector3().fromArray(node.translation ?? [0, 0, 0]),
        new THREE.Quaternion().fromArray(node.rotation ?? [0, 0, 0, 1]),
        new THREE.Vector3().fromArray(node.scale ?? [1, 1, 1]));
    }
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
    const p = new THREE.Vector3(), n = new THREE.Vector3();
    for (let i = 0; i < position.length; i += 3) {
      p.fromArray(position, i).applyMatrix4(matrix).toArray(position, i);
      n.fromArray(normal, i).applyMatrix3(normalMatrix).normalize().toArray(normal, i);
    }
  }
  return { position, normal, index };
}

/** Centres the mesh on its base and scales it to a given height. */
export function normaliseMesh(mesh: SourceMesh, height: number): SourceMesh {
  const box = new THREE.Box3();
  const p = new THREE.Vector3();
  for (let i = 0; i < mesh.position.length; i += 3) box.expandByPoint(p.fromArray(mesh.position, i));
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const scale = height / Math.max(size.y, 1e-6);
  const position = new Float32Array(mesh.position.length);
  for (let i = 0; i < mesh.position.length; i += 3) {
    position[i] = (mesh.position[i] - centre.x) * scale;
    position[i + 1] = (mesh.position[i + 1] - centre.y) * scale;
    position[i + 2] = (mesh.position[i + 2] - centre.z) * scale;
  }
  return { position, normal: mesh.normal, index: mesh.index };
}

export function meshToGeometry(mesh: SourceMesh): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(mesh.position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(mesh.normal, 3));
  geometry.setIndex(new THREE.BufferAttribute(mesh.index, 1));
  return geometry;
}

/* ------------------------------------------------------------- the seeds ---- */

/** Seeds sit just under the surface, so the cells come out as plate-shaped shards
    rather than the radial wedges you get from seeding the middle. */
export function shardSeeds(mesh: SourceMesh, count: number, random: () => number): THREE.Vector3[] {
  const areas: number[] = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3();
  let total = 0;
  for (let t = 0; t < mesh.index.length; t += 3) {
    a.fromArray(mesh.position, mesh.index[t] * 3);
    b.fromArray(mesh.position, mesh.index[t + 1] * 3);
    c.fromArray(mesh.position, mesh.index[t + 2] * 3);
    const area = ab.subVectors(b, a).cross(ac.subVectors(c, a)).length() * .5;
    total += area;
    areas.push(total);
  }

  const seeds: THREE.Vector3[] = [];
  const normal = new THREE.Vector3();
  let guard = 0;
  while (seeds.length < count && guard++ < count * 60) {
    // area-weighted triangle pick, so big flat regions get their share
    const target = random() * total;
    let lo = 0, hi = areas.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (areas[mid] < target) lo = mid + 1; else hi = mid; }
    const t = lo * 3;
    const i0 = mesh.index[t], i1 = mesh.index[t + 1], i2 = mesh.index[t + 2];
    a.fromArray(mesh.position, i0 * 3);
    b.fromArray(mesh.position, i1 * 3);
    c.fromArray(mesh.position, i2 * 3);
    let u = random(), v = random();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    const point = a.clone()
      .addScaledVector(ab.subVectors(b, a), u)
      .addScaledVector(ac.subVectors(c, a), v);
    normal.fromArray(mesh.normal, i0 * 3).normalize();
    point.addScaledVector(normal, -(.06 + random() * .3));

    // keep them apart, otherwise a cluster of seeds shatters one region to crumbs
    if (seeds.some(s => s.distanceToSquared(point) < .105)) continue;
    seeds.push(point);
  }
  return seeds;
}

/* ---------------------------------------------------------- the fracture ---- */

type Corner = { p: THREE.Vector3; n: THREE.Vector3 };

/** Sutherland-Hodgman against one half-space, carrying the normals through. */
function clipPolygon(poly: Corner[], planeNormal: THREE.Vector3, offset: number): Corner[] {
  const out: Corner[] = [];
  for (let i = 0; i < poly.length; i++) {
    const current = poly[i], next = poly[(i + 1) % poly.length];
    const dc = current.p.dot(planeNormal) - offset;
    const dn = next.p.dot(planeNormal) - offset;
    if (dc <= 0) out.push(current);
    if ((dc < 0 && dn > 0) || (dc > 0 && dn < 0)) {
      const t = dc / (dc - dn);
      out.push({
        p: current.p.clone().lerp(next.p, t),
        n: current.n.clone().lerp(next.n, t).normalize(),
      });
    }
  }
  return out;
}

const key = (p: THREE.Vector3) => `${Math.round(p.x * 1e4)},${Math.round(p.y * 1e4)},${Math.round(p.z * 1e4)}`;

export type Shard = {
  geometry: THREE.BufferGeometry;
  centre: THREE.Vector3;
  /** the crack line of this shard, in assembled space */
  seam: { a: THREE.Vector3; b: THREE.Vector3; n: THREE.Vector3 }[];
};

export function fractureShell(mesh: SourceMesh, seeds: THREE.Vector3[], thickness = .055): Shard[] {
  const vertexCount = mesh.position.length / 3;
  const owner = new Int32Array(vertexCount);
  const point = new THREE.Vector3();
  for (let i = 0; i < vertexCount; i++) {
    point.fromArray(mesh.position, i * 3);
    let best = 0, bestDistance = Infinity;
    for (let s = 0; s < seeds.length; s++) {
      const d = seeds[s].distanceToSquared(point);
      if (d < bestDistance) { bestDistance = d; best = s; }
    }
    owner[i] = best;
  }

  // every cell collects a list of triangles, as raw corner triples
  const cells: Corner[][][] = seeds.map(() => []);
  const corner = (index: number): Corner => ({
    p: new THREE.Vector3().fromArray(mesh.position, index * 3),
    n: new THREE.Vector3().fromArray(mesh.normal, index * 3),
  });

  const planeNormal = new THREE.Vector3(), midpoint = new THREE.Vector3();
  for (let t = 0; t < mesh.index.length; t += 3) {
    const i0 = mesh.index[t], i1 = mesh.index[t + 1], i2 = mesh.index[t + 2];
    const c0 = owner[i0], c1 = owner[i1], c2 = owner[i2];
    const triangle = [corner(i0), corner(i1), corner(i2)];

    if (c0 === c1 && c1 === c2) { cells[c0].push(triangle); continue; }

    // it straddles: hand each involved cell only the part that belongs to it
    const involved = Array.from(new Set([c0, c1, c2]));
    for (const cell of involved) {
      let poly: Corner[] = triangle.map(v => ({ p: v.p.clone(), n: v.n.clone() }));
      for (const other of involved) {
        if (other === cell) continue;
        planeNormal.subVectors(seeds[other], seeds[cell]).normalize();
        midpoint.addVectors(seeds[other], seeds[cell]).multiplyScalar(.5);
        poly = clipPolygon(poly, planeNormal, planeNormal.dot(midpoint));
        if (poly.length < 3) break;
      }
      for (let f = 1; f < poly.length - 1; f++) cells[cell].push([poly[0], poly[f], poly[f + 1]]);
    }
  }

  /* ---- give every cell a back and a rim ---------------------------------- */
  const shards: Shard[] = [];
  for (const triangles of cells) {
    if (triangles.length < 2) continue;

    const lookup = new Map<string, number>();
    const positions: THREE.Vector3[] = [];
    const normals: THREE.Vector3[] = [];
    const faces: number[][] = [];
    for (const triangle of triangles) {
      const face: number[] = [];
      for (const v of triangle) {
        const k = key(v.p);
        let index = lookup.get(k);
        if (index === undefined) {
          index = positions.length;
          lookup.set(k, index);
          positions.push(v.p);
          normals.push(v.n.clone());
        } else normals[index].add(v.n);
        face.push(index);
      }
      if (face[0] !== face[1] && face[1] !== face[2] && face[0] !== face[2]) faces.push(face);
    }
    if (!faces.length) continue;
    normals.forEach(n => n.normalize());

    // an edge used once is on the break
    const edgeUse = new Map<string, { a: number; b: number; count: number }>();
    for (const [a, b, c] of faces) {
      for (const [x, y] of [[a, b], [b, c], [c, a]]) {
        const k = x < y ? `${x}_${y}` : `${y}_${x}`;
        const found = edgeUse.get(k);
        if (found) found.count++;
        else edgeUse.set(k, { a: x, b: y, count: 1 });
      }
    }
    const border = [...edgeUse.values()].filter(e => e.count === 1);

    const outerCount = positions.length;
    const position: number[] = [], normal: number[] = [];
    const push = (p: THREE.Vector3, n: THREE.Vector3) => {
      position.push(p.x, p.y, p.z);
      normal.push(n.x, n.y, n.z);
    };
    const groups: { start: number; count: number; materialIndex: number }[] = [];

    // group 0: the cast surface, exactly as it was modelled
    let start = 0;
    for (const [a, b, c] of faces) {
      push(positions[a], normals[a]);
      push(positions[b], normals[b]);
      push(positions[c], normals[c]);
    }
    groups.push({ start, count: position.length / 3 - start, materialIndex: 0 });

    // group 1: the inside of the shell and the rim, which are freshly broken plaster
    start = position.length / 3;
    const inner = positions.map((p, i) => p.clone().addScaledVector(normals[i], -thickness));
    const flipped = normals.map(n => n.clone().negate());
    for (const [a, b, c] of faces) {
      push(inner[a], flipped[a]);
      push(inner[c], flipped[c]);
      push(inner[b], flipped[b]);
    }
    const edgeDirection = new THREE.Vector3(), rimNormal = new THREE.Vector3(), average = new THREE.Vector3();
    for (const edge of border) {
      const a = positions[edge.a], b = positions[edge.b];
      average.copy(normals[edge.a]).add(normals[edge.b]).normalize();
      edgeDirection.subVectors(b, a).normalize();
      rimNormal.crossVectors(edgeDirection, average).normalize();
      push(a, rimNormal); push(inner[edge.a], rimNormal); push(inner[edge.b], rimNormal);
      push(a, rimNormal); push(inner[edge.b], rimNormal); push(b, rimNormal);
    }
    groups.push({ start, count: position.length / 3 - start, materialIndex: 1 });

    const centre = new THREE.Vector3();
    for (let i = 0; i < position.length; i += 3) {
      centre.x += position[i];
      centre.y += position[i + 1];
      centre.z += position[i + 2];
    }
    centre.multiplyScalar(3 / position.length);
    for (let i = 0; i < position.length; i += 3) {
      position[i] -= centre.x; position[i + 1] -= centre.y; position[i + 2] -= centre.z;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
    groups.forEach(g => geometry.addGroup(g.start, g.count, g.materialIndex));

    shards.push({
      geometry,
      centre,
      seam: border.map(e => ({
        a: positions[e.a].clone(),
        b: positions[e.b].clone(),
        n: normals[e.a].clone().add(normals[e.b]).normalize(),
      })),
      // the outer skin is the first `outerCount` welded vertices; kept for reference
    });
    void outerCount;
  }
  return shards;
}

/* ------------------------------------------------------------- the seams ---- */

/* The crack lines, poured.

   Sweeping each edge separately gives you a row of disconnected tubes, which is
   what plumbing looks like, not what kintsugi looks like. So the boundary edges are
   first chained into continuous runs, then a single ribbon is swept along each run
   with a mitred join, a width that swells in the middle and thins at the ends, and
   a little irregularity so no two millimetres of it are identical. It sits in the
   crack rather than on top of it. */
export function seamRibbons(shards: Shard[], width = .058, lift = .004): THREE.BufferGeometry {
  type Node = { p: THREE.Vector3; n: THREE.Vector3; links: number[] };
  const nodes: Node[] = [];
  const lookup = new Map<string, number>();
  const nodeKey = (p: THREE.Vector3) => `${Math.round(p.x * 2e3)},${Math.round(p.y * 2e3)},${Math.round(p.z * 2e3)}`;

  const nodeFor = (p: THREE.Vector3, n: THREE.Vector3) => {
    const k = nodeKey(p);
    let index = lookup.get(k);
    if (index === undefined) {
      index = nodes.length;
      lookup.set(k, index);
      nodes.push({ p: p.clone(), n: n.clone(), links: [] });
    } else nodes[index].n.add(n);
    return index;
  };

  const edges = new Set<string>();
  for (const shard of shards) {
    for (const edge of shard.seam) {
      const a = nodeFor(edge.a, edge.n), b = nodeFor(edge.b, edge.n);
      if (a === b) continue;
      const k = a < b ? `${a}_${b}` : `${b}_${a}`;
      if (edges.has(k)) continue;
      edges.add(k);
      nodes[a].links.push(b);
      nodes[b].links.push(a);
    }
  }
  nodes.forEach(node => node.n.normalize());

  /* chain the edges into runs, breaking wherever three or more cracks meet */
  const used = new Set<string>();
  const runs: number[][] = [];
  const edgeKey = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`);

  const walk = (start: number, first: number) => {
    const run = [start, first];
    used.add(edgeKey(start, first));
    let previous = start, current = first;
    // follow while the crack keeps going straight through, i.e. degree two
    while (nodes[current].links.length === 2) {
      const next = nodes[current].links.find(n => n !== previous);
      if (next === undefined || used.has(edgeKey(current, next))) break;
      used.add(edgeKey(current, next));
      run.push(next);
      previous = current; current = next;
    }
    return run;
  };

  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].links.length === 2) continue;             // start at junctions and ends
    for (const link of nodes[i].links) {
      if (used.has(edgeKey(i, link))) continue;
      runs.push(walk(i, link));
    }
  }
  // whatever is left is a closed loop
  for (let i = 0; i < nodes.length; i++) {
    for (const link of nodes[i].links) {
      if (used.has(edgeKey(i, link))) continue;
      runs.push(walk(i, link));
    }
  }

  const position: number[] = [], normal: number[] = [], across: number[] = [], side: number[] = [];
  const tangent = new THREE.Vector3(), sideways = new THREE.Vector3();
  const before = new THREE.Vector3(), after = new THREE.Vector3();
  const left: THREE.Vector3[] = [], right: THREE.Vector3[] = [], unit: THREE.Vector3[] = [];

  const wobble = (i: number) => .78 + .22 * Math.sin(i * 12.9898) * Math.sin(i * 4.1414 + 1.7);

  for (const run of runs) {
    if (run.length < 2) continue;
    const open = run[0] !== run[run.length - 1];
    left.length = right.length = unit.length = 0;

    for (let i = 0; i < run.length; i++) {
      const node = nodes[run[i]];
      // the mitre: average the direction coming in and the direction going out
      tangent.set(0, 0, 0);
      if (i > 0) tangent.add(before.subVectors(node.p, nodes[run[i - 1]].p).normalize());
      if (i < run.length - 1) tangent.add(after.subVectors(nodes[run[i + 1]].p, node.p).normalize());
      if (tangent.lengthSq() < 1e-10) tangent.set(1, 0, 0);
      tangent.normalize();

      sideways.crossVectors(node.n, tangent);
      if (sideways.lengthSq() < 1e-10) sideways.set(0, 1, 0);
      sideways.normalize();
      unit.push(sideways.clone());

      // a run of metal swells where it was poured and thins where it ran out
      const t = run.length > 1 ? i / (run.length - 1) : .5;
      const taper = open ? .45 + .55 * Math.pow(Math.sin(Math.PI * t), .45) : 1;
      const half = width * .5 * taper * wobble(run[i]);
      const centre = node.p.clone().addScaledVector(node.n, lift);
      left.push(centre.clone().addScaledVector(sideways, half));
      right.push(centre.clone().addScaledVector(sideways, -half));
    }

    for (let i = 0; i < run.length - 1; i++) {
      const n0 = nodes[run[i]].n, n1 = nodes[run[i + 1]].n;
      const quad = [left[i], right[i], right[i + 1], left[i + 1]];
      const norms = [n0, n0, n1, n1];
      const sides = [unit[i], unit[i], unit[i + 1], unit[i + 1]];
      const t = [1, -1, -1, 1];
      for (const [x, y, z] of [[0, 1, 2], [0, 2, 3]] as const) {
        for (const index of [x, y, z]) {
          const p = quad[index], n = norms[index], u = sides[index];
          position.push(p.x, p.y, p.z);
          normal.push(n.x, n.y, n.z);
          across.push(t[index]);
          side.push(u.x, u.y, u.z);
        }
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  geometry.setAttribute('aAcross', new THREE.Float32BufferAttribute(across, 1));
  geometry.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 3));
  return geometry;
}

/** Points scattered evenly over the cast, for the manifesto cloud. */
export function surfacePoints(mesh: SourceMesh, count: number, random: () => number): Float32Array {
  const out = new Float32Array(count * 3);
  const a = new THREE.Vector3(), ab = new THREE.Vector3(), ac = new THREE.Vector3();
  const b = new THREE.Vector3(), c = new THREE.Vector3();
  const triangles = mesh.index.length / 3;
  for (let i = 0; i < count; i++) {
    const t = Math.floor(random() * triangles) * 3;
    a.fromArray(mesh.position, mesh.index[t] * 3);
    b.fromArray(mesh.position, mesh.index[t + 1] * 3);
    c.fromArray(mesh.position, mesh.index[t + 2] * 3);
    let u = random(), v = random();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    ab.subVectors(b, a); ac.subVectors(c, a);
    out[i * 3] = a.x + ab.x * u + ac.x * v;
    out[i * 3 + 1] = a.y + ab.y * u + ac.y * v;
    out[i * 3 + 2] = a.z + ab.z * u + ac.z * v;
  }
  return out;
}
