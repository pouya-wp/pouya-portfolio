/* The valley of bewilderment.

   Attar's fifth valley is the one where what you thought you knew comes apart. The
   traveller is not given a better vantage on the confusion - the confusion is total,
   and it resolves only from one station, which is not a compromise between the other
   stations and cannot be reasoned toward from them. You either stand there or you do
   not.

   HOW IT IS BUILT, WHICH IS THE WHOLE IDEA

   This is an anamorph, and the arithmetic is exact rather than approximate.

   Take a point on the surface of the cast. Draw the ray from one chosen eye position
   through that point. Put a fragment anywhere along that ray. From that eye the
   fragment covers the surface point precisely - it has to, it is on the line of sight
   - so a thousand fragments scattered along a thousand such rays reconstruct the whole
   figure from that one place and from nowhere else. Move a few degrees off and the
   depths that were hidden by the projection are suddenly the only thing you can see:
   the figure does not degrade, it stops existing.

   That is the difference between this and a cloud that happens to look better from one
   side. There is no approximation, no fitting, no threshold. Order at one station,
   noise at every other, from one line of algebra.

   The reader finds it by moving. Nothing marks it, nothing points at it, and the only
   feedback is the thing itself coming together. */

import * as THREE from 'three';

/** how many pieces the figure is scattered into */
export const SHARD_COUNT = 2600;

/* Where the fragments resolve from. It is off the centre line and slightly low, so it
   is a place the reader has to arrive at rather than the default view - a sweet spot
   at the origin would be found by doing nothing, which is the opposite of a valley. */
export const SWEET_EYE = new THREE.Vector3(2.6, .55, 9.4);
export const SWEET_LOOK = new THREE.Vector3(0, .05, 0);

export type Bewilderment = ReturnType<typeof createBewilderment>;

export function createBewilderment(surface: Float32Array, random: () => number) {
  const group = new THREE.Group();
  group.visible = false;

  const count = Math.min(SHARD_COUNT, Math.floor(surface.length / 3));

  /* Flat chips rather than boxes. Seen from the station they are a silhouette and
     their thickness is wasted; seen from anywhere else the light catching a hundred
     differently angled faces is most of what sells the confusion. */
  const geometry = new THREE.PlaneGeometry(1, 1);
  const material = new THREE.MeshStandardMaterial({
    color: 0xf2e7d6,
    roughness: .82,
    metalness: 0,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0,
  });

  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  group.add(mesh);

  /* Everything below is fixed once. The per-frame work is a matrix compose per
     fragment and nothing else - no sorting, no distance tests, no allocation. */
  const anchored = new Float32Array(count * 3);   // where it sits when it has resolved
  const scattered = new Float32Array(count * 3);  // where it sits the rest of the time
  const spin = new Float32Array(count * 3);       // its own idle tumble
  const size = new Float32Array(count);
  /* The way the surface was facing where this chip came from.

     Without it the resolved figure is a silhouette and nothing else: every chip turned
     square to the station catches exactly the same light, so a bust with a nose and a
     brow and a collar arrives as a flat cream shape. Carrying the surface direction
     means the resolved pieces are lit the way the surface was lit, and the face comes
     back with the outline.

     It is taken radially from the cast's own centre, which for a bust is close enough
     to the true normal everywhere that matters and costs one subtraction. */
  const normal = new Float32Array(count * 3);

  const point = new THREE.Vector3();
  const ray = new THREE.Vector3();

  /* A stride through the surface samples rather than the first N of them: the samples
     arrive in mesh order, so taking a prefix would rebuild the chin and leave the rest
     of the head out of the picture entirely. */
  const stride = Math.max(1, Math.floor(surface.length / 3 / count));

  // the centre of the samples, which is what the radial normals are measured from
  const centre = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const s = (i * stride) * 3;
    centre.x += surface[s]; centre.y += surface[s + 1]; centre.z += surface[s + 2];
  }
  centre.divideScalar(count);

  for (let i = 0; i < count; i++) {
    const s = (i * stride) * 3;
    point.set(surface[s], surface[s + 1], surface[s + 2]);

    /* The ray, and where along it this fragment lives.

       t = 1 is the surface itself. Pushing the range well either side of that is what
       gives the scatter its depth - and the far pieces, being further from the eye,
       have to be larger in proportion or they stop covering their share of the
       silhouette. Similar triangles, and it is the reason this cannot be faked by
       scattering pieces and hoping. */
    ray.subVectors(point, SWEET_EYE);
    const t = .32 + random() * 1.75;

    anchored[i * 3] = SWEET_EYE.x + ray.x * t;
    anchored[i * 3 + 1] = SWEET_EYE.y + ray.y * t;
    anchored[i * 3 + 2] = SWEET_EYE.z + ray.z * t;

    // 7.2cm of chip at the surface, scaled by how far down the ray it ended up
    size[i] = (.060 + random() * .030) * t;

    /* And where it drifts to when nothing is being resolved. Not a different place -
       the same place, pushed off its ray, so the transition between chaos and figure
       is one lerp and the reader can feel it approaching rather than snapping. */
    const a = random() * Math.PI * 2;
    const r = 1.3 + random() * 2.9;
    scattered[i * 3] = anchored[i * 3] + Math.cos(a) * r;
    scattered[i * 3 + 1] = anchored[i * 3 + 1] + (random() - .5) * 3.4;
    scattered[i * 3 + 2] = anchored[i * 3 + 2] + Math.sin(a) * r;

    ray.set(point.x - centre.x, point.y - centre.y, point.z - centre.z).normalize();
    normal[i * 3] = ray.x; normal[i * 3 + 1] = ray.y; normal[i * 3 + 2] = ray.z;

    spin[i * 3] = (random() - .5) * 1.4;
    spin[i * 3 + 1] = (random() - .5) * 1.4;
    spin[i * 3 + 2] = (random() - .5) * 1.4;
  }

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const scale = new THREE.Vector3();
  const forward = new THREE.Vector3();
  /* The orientation every fragment takes once it has resolved. Square on to the
     station, so the chips tile the silhouette instead of presenting their edges to it
     and leaving the figure full of gaps. */
  const facing = new THREE.Quaternion();
  const surfaceFacing = new THREE.Quaternion();
  const targetQuats = new Float32Array(count * 4);
  const lookMatrix = new THREE.Matrix4();
  const UP = new THREE.Vector3(0, 1, 0);
  const ZERO = new THREE.Vector3();
  lookMatrix.lookAt(SWEET_EYE, SWEET_LOOK, UP);
  facing.setFromRotationMatrix(lookMatrix);

  // Pre-calculate target orientation for every chip once
  const tempRay = new THREE.Vector3();
  const tempFacing = new THREE.Quaternion();
  for (let i = 0; i < count; i++) {
    tempRay.set(normal[i * 3], normal[i * 3 + 1], normal[i * 3 + 2]);
    lookMatrix.lookAt(tempRay, ZERO, UP);
    tempFacing.setFromRotationMatrix(lookMatrix);
    tempFacing.slerp(facing, .34);
    targetQuats[i * 4] = tempFacing.x;
    targetQuats[i * 4 + 1] = tempFacing.y;
    targetQuats[i * 4 + 2] = tempFacing.z;
    targetQuats[i * 4 + 3] = tempFacing.w;
  }

  return {
    group,
    mesh,
    material,
    count,

    /** where the reader has to stand, for the camera to be steered toward */
    sweetEye: SWEET_EYE,
    sweetLook: SWEET_LOOK,

    /* How close the camera is to the station, 0..1.

       Angle, not distance. Moving along the line of sight does not break an anamorph -
       the rays are the same rays - so a metric built on position would report failure
       for a view that is in fact perfect. What breaks it is looking from a different
       direction, and that is what this measures. */
    alignment(camera: THREE.Camera) {
      forward.subVectors(SWEET_EYE, SWEET_LOOK).normalize();
      position.setFromMatrixPosition(camera.matrixWorld).sub(SWEET_LOOK).normalize();
      const cosine = THREE.MathUtils.clamp(forward.dot(position), -1, 1);
      // full marks inside about four degrees, nothing at all past about twenty
      return 1 - THREE.MathUtils.smoothstep(Math.acos(cosine), .07, .35);
    },

    /**
     * @param resolve 0 scattered, 1 assembled - the alignment, eased by the caller
     * @param present 0..1 how much of the act is on screen
     */
    step(elapsed: number, resolve: number, present: number, reduced: boolean) {
      material.opacity = present;
      if (present <= 0.001) return;
      const drift = reduced ? 0 : 1;

      for (let i = 0; i < count; i++) {
        const j = i * 3;
        /* The drift is damped by the resolve rather than switched off by it, so a
           reader who is nearly there sees the pieces settling rather than a figure
           that is either present or absent. */
        const wobble = (1 - resolve) * drift;
        position.set(
          THREE.MathUtils.lerp(scattered[j], anchored[j], resolve)
            + Math.sin(elapsed * .7 + i) * .05 * wobble,
          THREE.MathUtils.lerp(scattered[j + 1], anchored[j + 1], resolve)
            + Math.sin(elapsed * .5 + i * 1.7) * .05 * wobble,
          THREE.MathUtils.lerp(scattered[j + 2], anchored[j + 2], resolve)
            + Math.cos(elapsed * .6 + i * 2.3) * .05 * wobble,
        );

        /* Tumbling while lost, and square to the station once found. The chips turning
           to face the reader as the figure arrives is what makes it read as a surface
           rather than as a coincidence of dots. */
        euler.set(
          spin[j] * elapsed * .3,
          spin[j + 1] * elapsed * .3,
          spin[j + 2] * elapsed * .3,
        );
        /* Most of the way to the surface direction, and the rest of the way to the
           station. All surface and the chips turn edge-on where the cast curves away,
           which opens holes in the silhouette; all station and there is no shading at
           all. A third of the way back toward the reader keeps the outline closed and
           still lets the form read. */
        surfaceFacing.fromArray(targetQuats, i * 4);
        quaternion.setFromEuler(euler).slerp(surfaceFacing, resolve);

        /* They grow into each other. At their scattered size the resolved figure is a
           stipple with the dark showing through every join; a fifth again is enough
           overlap to read as one surface without turning it into a slab. */
        scale.setScalar(size[i] * (1 + resolve * .38));
        matrix.compose(position, quaternion, scale);
        mesh.setMatrixAt(i, matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },

    dispose() {
      geometry.dispose();
      material.dispose();
      mesh.dispose();
    },
  };
}
