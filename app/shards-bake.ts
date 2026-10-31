import * as THREE from 'three';

export type BakedShards = {
  points: Float32Array;
  wholeGeometry: THREE.BufferGeometry;
  seamGeometry: THREE.BufferGeometry;
  shards: { geometry: THREE.BufferGeometry; centre: THREE.Vector3 }[];
};

export function unpackBakedShards(buffer: ArrayBuffer): BakedShards {
  const view = new DataView(buffer);
  let offset = 0;

  const readF32 = (): Float32Array => {
    const len = view.getUint32(offset, true); offset += 4;
    const slice = new Float32Array(buffer, offset, len);
    const arr = new Float32Array(slice);
    offset += len * 4;
    return arr;
  };

  const readU32 = (): Uint32Array => {
    const len = view.getUint32(offset, true); offset += 4;
    const slice = new Uint32Array(buffer, offset, len);
    const arr = new Uint32Array(slice);
    offset += len * 4;
    return arr;
  };

  // 1. points (11000 * 3)
  const points = readF32();

  // 2. whole
  const wholePos = readF32();
  const wholeNorm = readF32();
  const wholeIdx = readU32();
  const wholeGeometry = new THREE.BufferGeometry();
  wholeGeometry.setAttribute('position', new THREE.BufferAttribute(wholePos, 3));
  wholeGeometry.setAttribute('normal', new THREE.BufferAttribute(wholeNorm, 3));
  wholeGeometry.setIndex(new THREE.BufferAttribute(wholeIdx, 1));

  // 3. seams
  const seamPos = readF32();
  const seamNorm = readF32();
  const seamAcross = readF32();
  const seamSide = readF32();
  const seamGeometry = new THREE.BufferGeometry();
  seamGeometry.setAttribute('position', new THREE.BufferAttribute(seamPos, 3));
  seamGeometry.setAttribute('normal', new THREE.BufferAttribute(seamNorm, 3));
  seamGeometry.setAttribute('aAcross', new THREE.BufferAttribute(seamAcross, 1));
  seamGeometry.setAttribute('aSide', new THREE.BufferAttribute(seamSide, 3));

  // 4. shards
  const shardCount = view.getUint32(offset, true); offset += 4;
  const shards: { geometry: THREE.BufferGeometry; centre: THREE.Vector3 }[] = [];

  for (let i = 0; i < shardCount; i++) {
    const cx = view.getFloat32(offset, true); offset += 4;
    const cy = view.getFloat32(offset, true); offset += 4;
    const cz = view.getFloat32(offset, true); offset += 4;
    const centre = new THREE.Vector3(cx, cy, cz);

    const groupCount = view.getUint32(offset, true); offset += 4;
    const groups: { start: number; count: number; materialIndex: number }[] = [];
    for (let g = 0; g < groupCount; g++) {
      const gStart = view.getUint32(offset, true); offset += 4;
      const gCount = view.getUint32(offset, true); offset += 4;
      const gMat = view.getUint32(offset, true); offset += 4;
      groups.push({ start: gStart, count: gCount, materialIndex: gMat });
    }

    const pos = readF32();
    const norm = readF32();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
    groups.forEach(g => geometry.addGroup(g.start, g.count, g.materialIndex));

    shards.push({ geometry, centre });
  }

  return { points, wholeGeometry, seamGeometry, shards };
}
