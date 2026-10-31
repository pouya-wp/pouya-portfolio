/* One for the light, one for the heat.

   The gold comes out of the seams and leaves as two of them.

   They are the same metal and they are not the same animal. One reads light and keeps
   its distance from the source, circling it, never arriving. The other reads heat, and
   heat is only ever found by going in. So the second one gets there, and getting there
   is what ends it: the wings take, char from the trailing edge forward, and what is
   left is a powder that hangs where the body was and then drifts.

   That powder is not a separate effect. It is the point cloud of the act that follows,
   seeded early - the cloud used to arrive from nowhere, and now it arrives from
   something that died for it.

   WHAT MAKES IT AFFORDABLE

   No rigging, no skinning, no imported mesh. A butterfly is four quads: two wings on
   each side, hinged at the body, rotated about the body's long axis by a flap angle.
   The wing *shape* is not geometry at all - the quad is a rectangle and the silhouette
   is carved out of it in the fragment shader by two overlapping ellipses with a
   scalloped edge. Vein lines, the char front and the ember all ride in the same shader
   on top of that. Two butterflies is eight draw calls of two triangles each.

   The flap is not a sine wave. A real wing snaps down and floats up - the downstroke
   is where the work happens - so the phase is skewed before it is fed to the curve.
   A symmetric flap reads as a flag. */

import * as THREE from 'three';

/** how many grains of powder one wing leaves behind */
const ASH = 1400;

const WING_VERT = /* glsl */`
  uniform float uFlap, uFold;
  varying vec2 vUv;
  varying float vFlap;
  void main(){
    vUv = uv;
    vFlap = uFlap;
    vec3 p = position;
    /* The wing is not flat while it beats. The far edge lags the root, which is what
       gives a wing its camber, and without it the flap reads as a hinged card. */
    float along = uv.x;
    p.z += sin(uFlap) * along * along * .42;
    p.y += (1. - cos(uFlap)) * along * .1;
    // and it curls closed as the act ends
    p.x *= 1. - uFold * .55;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.);
  }
`;

const WING_FRAG = /* glsl */`
  precision highp float;
  uniform vec3 uGold, uHot, uChar;
  uniform float uBurn, uOpacity, uTime, uEmber;
  varying vec2 vUv;
  varying float vFlap;

  float ellipse(vec2 p, vec2 c, vec2 r){ vec2 d = (p - c) / r; return length(d); }

  void main(){
    /* uv.x runs root to tip, uv.y runs trailing edge to leading edge. The silhouette
       is the union of a forewing and a hindwing, which is enough shape for something
       seen at this size and in this much motion. */
    vec2 p = vUv;
    float fore = ellipse(p, vec2(.44, .68), vec2(.46, .34));
    float hind = ellipse(p, vec2(.34, .27), vec2(.36, .27));
    float d = min(fore, hind);

    // a scalloped trailing edge, or it reads as two eggs
    d += sin(atan(p.y - .5, p.x - .4) * 7.) * .035;

    float wing = 1. - smoothstep(.94, 1.02, d);
    if (wing < .01) discard;

    /* Veins. Cheap, and they are most of what says insect rather than petal: a few
       lines fanning from the root, plus the hard costal edge along the top. */
    float fan = abs(fract((atan(p.y - .18, p.x - .06)) * 2.4) - .5);
    float veins = smoothstep(.055, .0, fan) * smoothstep(.1, .5, p.x);
    float costa = smoothstep(.06, .0, abs(d - .95));

    vec3 colour = uGold;
    colour *= .72 + .55 * smoothstep(1.0, .2, d);        // darker toward the edge
    colour = mix(colour, uChar * 2.2, veins * .5);
    colour += uGold * costa * .8;
    // the metal catches the light differently through the stroke
    colour *= .8 + .5 * abs(sin(vFlap));

    /* The burn eats from the trailing edge inward, with an ember line on the front of
       it. uBurn is the position of that front across the wing, not an opacity - the
       wing is not fading, it is being consumed. */
    float front = mix(-.1, 1.25, uBurn);
    float eaten = smoothstep(front + .02, front - .02, 1. - p.x + (1. - p.y) * .35);
    float ember = smoothstep(front + .16, front + .01, 1. - p.x + (1. - p.y) * .35) * (1. - eaten);

    colour = mix(colour, uChar, ember * .75);
    colour += uHot * ember * (2.4 + uEmber * 3.);
    float alpha = wing * uOpacity * (1. - eaten);
    if (alpha < .01) discard;

    gl_FragColor = vec4(colour, alpha);
  }
`;

function makeWing(side: number) {
  const geometry = new THREE.PlaneGeometry(1, 1, 6, 6);
  // hinge at the body: shift so x = 0 is the root and the wing extends outward
  geometry.translate(.5, 0, 0);
  geometry.scale(side, 1, 1);

  const material = new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    uniforms: {
      uFlap: { value: 0 },
      uFold: { value: 0 },
      uBurn: { value: 0 },
      uEmber: { value: 0 },
      uOpacity: { value: 0 },
      uTime: { value: 0 },
      uGold: { value: new THREE.Color('#e8b054') },
      uHot: { value: new THREE.Color('#ff7a18') },
      uChar: { value: new THREE.Color('#20130a') },
    },
    vertexShader: WING_VERT,
    fragmentShader: WING_FRAG,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return { mesh, material };
}

function makeButterfly() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(.035, .34, 3, 6),
    new THREE.MeshStandardMaterial({ color: 0x241708, roughness: .5, metalness: .4 }),
  );
  body.rotation.x = Math.PI / 2;
  group.add(body);

  /* Two wings a side. The hind pair is smaller, set back and flaps a little behind the
     fore pair, which is the difference between a butterfly and a bird. */
  const wings = [makeWing(1), makeWing(-1), makeWing(1), makeWing(-1)];
  wings.forEach((wing, i) => {
    const hind = i > 1;
    wing.mesh.scale.setScalar(hind ? .62 : .9);
    wing.mesh.position.z = hind ? -.14 : .06;
    group.add(wing.mesh);
  });

  return { group, body, wings };
}

export type Butterflies = ReturnType<typeof createButterflies>;

export function createButterflies(random: () => number) {
  const group = new THREE.Group();
  group.visible = false;

  /* Three of them, and only one of them is the point.

       LIGHT  reads the light. It can be read from across a room, so it holds a fixed
              angle to it and orbits forever. It never arrives and it never burns.
       HEAT   reads heat, which is a gradient with a maximum and cannot be read at
              distance. It closes, and it keeps closing.
       GOLD   is not an insect that found the candle. It is the repair itself: it
              comes off the cast's own seams, which is why the cast is bare while it
              is in the air. It goes into the flame, and what is left of it goes back
              into the cast.

     The first two are the argument. The third is what the argument is about. */
  const light = makeButterfly();
  const heat = makeButterfly();
  const gold = makeButterfly();
  group.add(light.group, heat.group, gold.group);

  /* The powder. Seeded once and reused: positions are written every frame while the
     burst is alive and the buffer is simply not drawn the rest of the time. */
  const ashPositions = new Float32Array(ASH * 3);
  const ashSeeds = new Float32Array(ASH * 4);
  for (let i = 0; i < ASH; i++) {
    // a direction, a speed, a lifetime offset and a size, fixed per grain
    const theta = random() * Math.PI * 2;
    const phi = Math.acos(random() * 2 - 1);
    ashSeeds[i * 4] = Math.sin(phi) * Math.cos(theta);
    ashSeeds[i * 4 + 1] = Math.abs(Math.cos(phi)) * .8 + .25;
    ashSeeds[i * 4 + 2] = Math.sin(phi) * Math.sin(theta);
    ashSeeds[i * 4 + 3] = .3 + random() * .7;
  }
  const ashGeometry = new THREE.BufferGeometry();
  ashGeometry.setAttribute('position', new THREE.BufferAttribute(ashPositions, 3));
  ashGeometry.setAttribute('aSeed', new THREE.BufferAttribute(ashSeeds, 4));

  const ashMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {
      uOpacity: { value: 0 },
      uPixel: { value: Math.min(devicePixelRatio, 1.7) },
      uWarm: { value: new THREE.Color('#ffb457') },
      uCool: { value: new THREE.Color('#ffedd7') },
    },
    vertexShader: /* glsl */`
      attribute vec4 aSeed;
      uniform float uPixel;
      varying float vHeat;
      void main(){
        vHeat = aSeed.w;
        vec4 mv = modelViewMatrix * vec4(position, 1.);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(9. * aSeed.w * uPixel / -mv.z, 1.0, 3.6);
      }`,
    fragmentShader: /* glsl */`
      uniform float uOpacity; uniform vec3 uWarm, uCool;
      varying float vHeat;
      void main(){
        float d = length(gl_PointCoord - .5);
        if (d > .5) discard;
        float core = pow(1. - smoothstep(0., .5, d), 1.8);
        gl_FragColor = vec4(mix(uCool, uWarm, vHeat) * (.8 + core), core * uOpacity);
      }`,
  });
  const ash = new THREE.Points(ashGeometry, ashMaterial);
  ash.frustumCulled = false;
  group.add(ash);

  const lightPos = new THREE.Vector3(0, .6, 0);
  const heatPos = new THREE.Vector3(0, .6, 0);
  const lightVel = new THREE.Vector3();
  const heatVel = new THREE.Vector3();
  const target = new THREE.Vector3();
  const source = new THREE.Vector3();
  const goldPos = new THREE.Vector3();
  const goldVel = new THREE.Vector3();
  const goldTarget = new THREE.Vector3();
  /* How much of the cast's gold is currently in the air rather than in its seams. The
     scene reads this to fade the seams out as the third one forms and back in as the
     powder settles, so the cast is visibly bare for exactly as long as the butterfly
     exists - which is the only thing that makes it *that* gold and not some gold. */
  let seamsAway = 0;
  let burst = -1;   // seconds since the wings took, or -1

  /* A wing snaps down and floats back up. Skewing the phase before it goes into the
     cosine is the whole of it, and it is the difference between a butterfly and a
     flag in a breeze. */
  const stroke = (phase: number) => {
    const t = phase % (Math.PI * 2) / (Math.PI * 2);
    const skew = t < .38 ? t / .38 * .5 : .5 + (t - .38) / .62 * .5;
    return Math.cos(skew * Math.PI * 2) * .95;
  };

  return {
    group,
    ash,

    /**
     * @param act      0..1 through the act
     * @param seamPos  where the gold leaves the cast from
     * @param pointer  the light, in world space - what one of them is reading
     */
    step(dt: number, elapsed: number, act: number, seamPos: THREE.Vector3, pointer: THREE.Vector3, reduced: boolean) {
      const emerge = THREE.MathUtils.smoothstep(act, .02, .26);
      /* The gold one takes its time getting there. It is crossing the table, not
         being drawn to a light: it left the cast, and it has somewhere to be. */
      const approach = THREE.MathUtils.smoothstep(act, .30, .60);
      const ignite = THREE.MathUtils.smoothstep(act, .58, .70);
      /* and then the long part, which is the only part that matters */
      const restore = THREE.MathUtils.smoothstep(act, .74, .955);
      const fold = THREE.MathUtils.smoothstep(act, .95, 1);
      seamsAway = emerge * (1 - restore);

      /* THE ONE THAT READS LIGHT circles its source and holds a radius. It is not
         being coy - a moth steers by keeping a fixed angle to a light, and against a
         source that is near rather than infinitely far that rule produces an orbit.
         It never arrives because the rule it is obeying cannot arrive. */
      /* The orbit is tight. A moth holding a fixed angle to a *near* light circles it
         at a few centimetres, not a few metres, and a wide lazy loop reads as a bird.
         It also keeps both of them inside the pool of light, which is the only part of
         the frame that exists. */
      const orbit = elapsed * 1.5;
      target.copy(pointer);
      target.x += Math.cos(orbit) * .42;
      target.y += Math.sin(orbit * 1.3) * .16 + .1;
      target.z += Math.sin(orbit) * .42;
      steer(lightPos, lightVel, target, dt, 2.6);

      /* THE ONE THAT READS HEAT has no such rule. Heat is a gradient with a maximum,
         and the only way to find the maximum is to keep going. */
      source.copy(pointer).addScaledVector(target.set(0, .35, 0), 1);
      target.copy(source);
      const stand = (1 - ignite) * .62;
      target.x += Math.cos(elapsed * .55) * stand;
      target.z += Math.sin(elapsed * .55) * stand;
      target.y += Math.sin(elapsed * .8) * .12 * (1 - ignite);
      steer(heatPos, heatVel, target, dt, 2.2 + ignite * 3.4);

      /* THE ONE THAT WAS THE REPAIR flies a straight line to the wick. No orbit, no
         search: it is not looking for the flame, it is going to it. */
      goldTarget.copy(seamPos).lerp(pointer, approach);
      goldTarget.y += Math.sin(elapsed * 1.7) * .1 * (1 - approach);
      goldTarget.x += Math.sin(elapsed * 2.1) * .12 * (1 - approach);
      steer(goldPos, goldVel, goldTarget, dt, 1.5 + approach * 3.2);

      // they start folded into the seams and open on the way out
      lightPos.lerpVectors(seamPos, lightPos, emerge);
      heatPos.lerpVectors(seamPos, heatPos, emerge);
      light.group.position.copy(lightPos);
      heat.group.position.copy(heatPos);
      gold.group.position.copy(goldPos);
      face(light.group, lightVel);
      face(heat.group, heatVel);
      face(gold.group, goldVel);

      /* An actual butterfly next to an actual bust.

         The wing quad is a unit square, so a butterfly built at scale 1 has a metre of
         wingspan and arrives in frame the size of the cast's head. Against a bust at
         2.5 units a wingspan of about a sixth of a unit is life size, and life size is
         the entire point: the act only works if they are small enough that flying into
         the flame is a thing that could happen to them. */
      /* Life size was too honest. A real butterfly next to a bust of that height is
         about a sixth of a unit across, which at the distance this act is shot from is
         forty pixels of wing - technically correct and effectively invisible. These are
         a large moth rather than a specimen, which is still small enough that the flame
         is a real danger to them and big enough that the reader can watch one die. */
      const scale = (.085 + emerge * .195);
      light.group.scale.setScalar(scale);
      heat.group.scale.setScalar(scale);
      gold.group.scale.setScalar(scale * 1.12 * (1 - ignite * .14));

      const beat = reduced ? 0 : 1;
      light.wings.forEach((wing, i) => {
        const u = wing.material.uniforms;
        u.uFlap.value = stroke(elapsed * 11 + (i > 1 ? .7 : 0)) * beat;
        u.uOpacity.value = emerge * (1 - fold * .9);
        u.uFold.value = fold;
        u.uTime.value = elapsed;
      });
      heat.wings.forEach((wing, i) => {
        const u = wing.material.uniforms;
        // it beats harder the closer it gets, which is the tell that it is in trouble
        u.uFlap.value = stroke(elapsed * (11 + approach * 10) + (i > 1 ? .7 : 0)) * beat;
        u.uOpacity.value = emerge * (1 - fold * .9);
        u.uTime.value = elapsed;
      });
      gold.wings.forEach((wing, i) => {
        const u = wing.material.uniforms;
        u.uFlap.value = stroke(elapsed * (11 + ignite * 16) + (i > 1 ? .7 : 0)) * beat;
        u.uOpacity.value = emerge;
        u.uBurn.value = ignite;
        u.uEmber.value = ignite;
        u.uTime.value = elapsed;
      });

      /* The burst. Once the char front has crossed the wing there is nothing left to
         burn, and the grains take over from that frame. */
      if (ignite > .995 && burst < 0) burst = 0;
      if (burst >= 0) {
        burst += dt;
        gold.group.visible = false;
        const life = Math.min(burst / 4.2, 1);
        const positions = ashGeometry.getAttribute('position') as THREE.BufferAttribute;
        const array = positions.array as Float32Array;
        for (let i = 0; i < ASH; i++) {
          const sx = ashSeeds[i * 4], sy = ashSeeds[i * 4 + 1], sz = ashSeeds[i * 4 + 2], sw = ashSeeds[i * 4 + 3];
          const t = Math.max(0, burst - sw * .35);
          /* Out fast, then the air takes it: the outward term is damped away while a
             slow lift keeps going, which is how ash actually leaves a fire. */
          const spread = (1 - Math.exp(-t * 1.9)) * (.9 + sw * 1.8);
          const ox = goldPos.x + sx * spread + Math.sin(t * 1.1 + sw * 9) * .18 * t;
          const oy = goldPos.y + sy * spread * .5 + t * (.24 + sw * .3);
          const oz = goldPos.z + sz * spread + Math.cos(t * .9 + sw * 7) * .18 * t;

          /* And then it goes home.

             Ash from a fire rises and is lost, and that is what this did for its first
             cut - which is a fine thing for ash to do and the wrong ending for this.
             The gold came off the cast; the cast is where it belongs. Each grain is
             drawn back to the seam it left, on its own schedule, so the return is a
             drift rather than a snap. */
          const back = THREE.MathUtils.smoothstep(restore, sw * .34, .5 + sw * .45);
          array[i * 3] = THREE.MathUtils.lerp(ox, seamPos.x + sx * .34, back);
          array[i * 3 + 1] = THREE.MathUtils.lerp(oy, seamPos.y + sy * .3 - .1, back);
          array[i * 3 + 2] = THREE.MathUtils.lerp(oz, seamPos.z + sz * .34, back);
        }
        positions.needsUpdate = true;
        // it fades as it arrives, because what it arrives as is the repair, not powder
        ashMaterial.uniforms.uOpacity.value = (1 - life * .2) * (1 - restore) * (1 - fold);
      } else {
        ashMaterial.uniforms.uOpacity.value = 0;
      }
    },

    /** where the powder ended up, for whatever picks it up next */
    get ashCentre() { return goldPos; },

    /** 0 the cast is wearing its gold, 1 the gold is in the air and the cast is bare */
    get seamsAway() { return seamsAway; },

    reset() { burst = -1; gold.group.visible = true; seamsAway = 0; },

    dispose() {
      group.traverse(node => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh && !(node as THREE.Points).isPoints) return;
        mesh.geometry?.dispose();
        (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(m => m?.dispose());
      });
    },
  };
}

/* a damped spring toward a moving target, which is what makes the flight read as an
   animal following something rather than as a keyframe */
const _to = new THREE.Vector3();
function steer(position: THREE.Vector3, velocity: THREE.Vector3, target: THREE.Vector3, dt: number, pull: number) {
  _to.copy(target).sub(position).multiplyScalar(pull);
  velocity.lerp(_to, 1 - Math.exp(-dt * 3.2));
  position.addScaledVector(velocity, dt);
}

/* point the body along its own velocity, and bank into the turn */
const _fwd = new THREE.Vector3();
function face(group: THREE.Object3D, velocity: THREE.Vector3) {
  if (velocity.lengthSq() < 1e-5) return;
  _fwd.copy(velocity).normalize();
  group.rotation.y = Math.atan2(_fwd.x, _fwd.z);
  group.rotation.x = -Math.asin(THREE.MathUtils.clamp(_fwd.y, -1, 1)) * .6;
  group.rotation.z = -_fwd.x * .35;
}

/* ------------------------------------------------------------------ the candle

   The source. It is one object and it is two different things, which is the reason
   the act has two animals in it: a candle emits light, which can be read from across
   a room and steered by, and it emits heat, which can only be read by getting closer.
   One rule keeps its distance forever. The other arrives.

   Without it on the table the whole act is two insects circling nothing, which is
   what the first cut of this was.

   The flame is a billboarded quad, not geometry: a teardrop carved in the fragment
   shader, with a blue base, a bright core and a tip that wanders. A modelled flame at
   this size is a waste of triangles and looks worse. */
export function createCandle() {
  const group = new THREE.Group();

  const wax = new THREE.Mesh(
    new THREE.CylinderGeometry(.085, .095, .62, 18, 1),
    new THREE.MeshStandardMaterial({ color: 0xf3e6cf, roughness: .62,
      emissive: 0xff8a3a, emissiveIntensity: .18 }),
  );
  wax.position.y = .31;
  wax.castShadow = wax.receiveShadow = true;
  group.add(wax);

  const wick = new THREE.Mesh(
    new THREE.CylinderGeometry(.012, .014, .12, 5),
    new THREE.MeshBasicMaterial({ color: 0x120b06 }),
  );
  wick.position.y = .645;
  group.add(wick);

  const flameMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 1 },
      /** rises while something is burning in it */
      uFlare: { value: 0 },
    },
    vertexShader: /* glsl */`
      uniform float uTime, uFlare;
      varying vec2 vUv;
      void main(){
        vUv = uv;
        /* Billboarded by hand: the quad is built in view space so it always faces the
           camera without a lookAt every frame, and it leans with the draught. */
        vec3 right = vec3(modelViewMatrix[0][0], modelViewMatrix[1][0], modelViewMatrix[2][0]);
        vec3 up    = vec3(modelViewMatrix[0][1], modelViewMatrix[1][1], modelViewMatrix[2][1]);
        float lean = sin(uTime * 2.3) * .06 + sin(uTime * 5.7) * .02;
        vec2 q = position.xy * vec2(1. + uFlare * .5, 1. + uFlare * 1.1);
        q.x += q.y * lean;
        vec3 world = right * q.x + up * q.y;
        gl_Position = projectionMatrix * (modelViewMatrix * vec4(0., 0., 0., 1.) + vec4(world, 0.));
      }`,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform float uTime, uOpacity, uFlare;
      varying vec2 vUv;
      void main(){
        vec2 p = vUv * 2. - 1.;
        p.y = p.y * .5 + .5;                 // 0 at the wick, 1 at the tip
        /* A teardrop: wide and round at the base, drawn to a point at the top, with
           the waist wandering so the tip never sits still. */
        float wander = sin(uTime * 6.1 + p.y * 4.) * .05 * p.y;
        float width = (1. - p.y) * (.42 + .18 * sin(uTime * 3.3 + p.y * 2.)) * smoothstep(-.15, .3, p.y);
        float d = abs(p.x - wander) - width;
        float body = 1. - smoothstep(0., .12, d);
        if (body < .01 || p.y < 0.) discard;

        // blue at the root, white through the middle, orange at the tip
        vec3 colour = mix(vec3(.22, .45, 1.), vec3(1., .92, .62), smoothstep(0., .22, p.y));
        colour = mix(colour, vec3(1., .52, .12), smoothstep(.45, 1., p.y));
        float core = smoothstep(.16, 0., d) * (1. - smoothstep(.55, 1., p.y));
        colour += vec3(1., .88, .6) * core * 1.6;

        float flicker = .86 + .14 * sin(uTime * 17.) * sin(uTime * 6.3);
        gl_FragColor = vec4(colour * (1. + uFlare * 2.2), body * flicker * uOpacity);
      }`,
  });
  const flame = new THREE.Mesh(new THREE.PlaneGeometry(.17, .30), flameMaterial);
  flame.position.y = .79;
  flame.frustumCulled = false;
  flame.renderOrder = 6;
  group.add(flame);

  /* The only lamp in the act, and everything in frame is lit by it. A candle is about
     twelve lumens, so the falloff is short and the table goes dark a foot away - which
     is the whole look and is free. */
  const light = new THREE.PointLight(0xffb066, 6.5, 9, 2.1);
  light.position.y = .78;
  light.castShadow = false;
  group.add(light);

  /** where the heat actually is, in world space */
  const tip = new THREE.Object3D();
  tip.position.y = .82;
  group.add(tip);

  return {
    group, flame, light, tip, flameMaterial,
    step(elapsed: number, flare: number, opacity: number) {
      flameMaterial.uniforms.uTime.value = elapsed;
      flameMaterial.uniforms.uFlare.value = flare;
      flameMaterial.uniforms.uOpacity.value = opacity;
      // a candle is never steady, and the light has to agree with the flame
      const flicker = .82 + .18 * Math.sin(elapsed * 17) * Math.sin(elapsed * 6.3);
      light.intensity = opacity * (6.5 + flare * 22) * flicker;
      (wax.material as THREE.MeshStandardMaterial).emissiveIntensity = opacity * (.18 + flare * .5);
    },
    dispose() {
      wax.geometry.dispose();
      (wax.material as THREE.Material).dispose();
      wick.geometry.dispose();
      (wick.material as THREE.Material).dispose();
      flame.geometry.dispose();
      flameMaterial.dispose();
      light.shadow.map?.dispose();
    },
  };
}
