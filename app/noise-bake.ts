/* The plaster, precomputed.

   WHAT THIS REPLACES

   The cast's material builds its whole surface out of value noise evaluated live. Per
   fragment it calls fbm thirteen times - grain, blotching, dust, roughness, and four
   more just to difference a gradient for the bump - and each fbm is three octaves, and
   each octave is eight corner hashes, and each hash is a sin(). That is on the order of
   three hundred transcendental calls for every pixel of plaster, every frame.

   At a thousand pixels square of cast on screen that is seventy million sines a frame
   for a surface that never changes. The noise is a function of position in the model's
   own space; the model does not deform. It is the same answer every time it is asked.

   WHAT IT DOES INSTEAD

   Bakes the field once, into a 3D texture, and lets the sampler do the work. Four
   channels, four frequencies, one fetch each:

     R  the fine grain          (was fbm(p * 120))
     G  the slow blotching      (was fbm(p * (.9, 1.7, .9)))
     B  the dust and roughness  (was fbm(p * (.7, 3.4, .7)) and fbm(p * 9))
     A  the bump base           (was fbm(p * 105), four times over)

   A 3D texture is the right shape for this and a 2D atlas is not: the field is
   genuinely three dimensional, the geometry has no useful UVs, and trilinear filtering
   between voxels is the same interpolation the noise function was doing by hand.

   THE COST OF THE BAKE ITSELF

   64 cubed is 262,144 voxels and each wants four fbm evaluations, which is around ten
   million hashes in JavaScript. That is a few hundred milliseconds, once, and it is
   spent behind the preloader while nothing is on screen - the one moment in this piece
   where the main thread is genuinely free. It is also why the hash below is integer
   mixing rather than the sin() the shader used: at ten million calls the difference is
   most of a second. */

import * as THREE from 'three';

const SIZE = 64;

/* A cheap integer hash. The sin(dot()) trick in the shader is convenient and slow, and
   it is also not especially uniform - which is why fbm built on it tends to streak
   along the axes. This is the standard triple-shift mix, and for a field that is being
   sampled rather than recomputed there is no reason to prefer the old one. */
function hash3(x: number, y: number, z: number): number {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

const fade = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** trilinear value noise, matching the shape of the vnoise the shader used */
function vnoise(x: number, y: number, z: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = fade(x - ix), fy = fade(y - iy), fz = fade(z - iz);

  const c000 = hash3(ix, iy, iz), c100 = hash3(ix + 1, iy, iz);
  const c010 = hash3(ix, iy + 1, iz), c110 = hash3(ix + 1, iy + 1, iz);
  const c001 = hash3(ix, iy, iz + 1), c101 = hash3(ix + 1, iy, iz + 1);
  const c011 = hash3(ix, iy + 1, iz + 1), c111 = hash3(ix + 1, iy + 1, iz + 1);

  return lerp(
    lerp(lerp(c000, c100, fx), lerp(c010, c110, fx), fy),
    lerp(lerp(c001, c101, fx), lerp(c011, c111, fx), fy),
    fz);
}

/** the same three-octave weighting the shader's fbm used, so the look does not move */
function fbm(x: number, y: number, z: number): number {
  return vnoise(x, y, z) * .55
    + vnoise(x * 2.13, y * 2.13, z * 2.13) * .28
    + vnoise(x * 4.71, y * 4.71, z * 4.71) * .17;
}

export type BakedNoise = { texture: THREE.Data3DTexture; dispose(): void };

/* The frequencies are folded into the bake rather than left to the sampler.

   Each channel is baked at the frequency it is going to be read at, and the shader then
   samples all four at one shared, low rate. That is what makes a single fetch able to
   stand in for four different scales - and it is why the fine grain does not tile
   visibly, which a naive "bake one field and sample it four ways" would. */
export function bakePlasterNoise(): BakedNoise {
  const data = new Uint8Array(SIZE * SIZE * SIZE * 4);
  const step = 1 / SIZE;

  for (let z = 0; z < SIZE; z++) {
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        /* Sampled over exactly one period in each axis so the texture tiles seamlessly
           with RepeatWrapping - the shader multiplies the coordinate up, so any seam
           would print sixty times across the cast. */
        const u = x * step, v = y * step, w = z * step;
        const i = (z * SIZE * SIZE + y * SIZE + x) * 4;

        // R: the fine grain, an order of magnitude above everything else
        data[i] = fbm(u * 16, v * 16, w * 16) * 255;
        // G: the slow blotching, stretched on Y the way the original was
        data[i + 1] = fbm(u * 2, v * 3.8, w * 2) * 255;
        // B: dust and roughness
        data[i + 2] = fbm(u * 3, v * 7, w * 3) * 255;
        // A: the base the bump is differenced from
        data[i + 3] = fbm(u * 13, v * 13, w * 13) * 255;
      }
    }
  }

  const texture = new THREE.Data3DTexture(data, SIZE, SIZE, SIZE);
  texture.format = THREE.RGBAFormat;
  texture.type = THREE.UnsignedByteType;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = texture.wrapR = THREE.RepeatWrapping;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;

  return { texture, dispose: () => texture.dispose() };
}
