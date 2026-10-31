import { writeFileSync } from 'node:fs';

const SIZE = 64;

function hash3(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

const fade = t => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

function vnoise(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = fade(x - ix), fy = fade(y - iy), fz = fade(z - iz);

  const c000 = hash3(ix, iy, iz), c100 = hash3(ix + 1, iy, iz);
  const c010 = hash3(ix, iy + 1, iz), c110 = hash3(ix + 1, iy + 1, iz);
  const c001 = hash3(ix, iy, iz + 1), c101 = hash3(ix + 1, iy, iz + 1);
  const c011 = hash3(ix, iy + 1, iz + 1), c111 = hash3(ix + 1, iy + 1, iz + 1);

  return lerp(
    lerp(lerp(c000, c100, fx), lerp(c010, c110, fx), fy),
    lerp(lerp(c001, c101, fx), lerp(c010, c110, fx), fy),
    fz);
}

function fbm(x, y, z) {
  return vnoise(x, y, z) * .55
    + vnoise(x * 2.13, y * 2.13, z * 2.13) * .28
    + vnoise(x * 4.71, y * 4.71, z * 4.71) * .17;
}

console.log('Baking plaster noise texture (64^3 RGBA)...');
const start = performance.now();
const data = new Uint8Array(SIZE * SIZE * SIZE * 4);
const step = 1 / SIZE;

for (let z = 0; z < SIZE; z++) {
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const u = x * step, v = y * step, w = z * step;
      const i = (z * SIZE * SIZE + y * SIZE + x) * 4;

      data[i] = fbm(u * 16, v * 16, w * 16) * 255;
      data[i + 1] = fbm(u * 2, v * 3.8, w * 2) * 255;
      data[i + 2] = fbm(u * 3, v * 7, w * 3) * 255;
      data[i + 3] = fbm(u * 13, v * 13, w * 13) * 255;
    }
  }
}

writeFileSync('public/plaster-noise.bin', data);
console.log(`Baked in ${(performance.now() - start).toFixed(1)}ms -> public/plaster-noise.bin (${data.byteLength} bytes)`);
