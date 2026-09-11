/* The gold sea.

   Everything that ever filled a break, pooled. It is not a new material - it is the
   seam metal at a different scale, which is why it is the same colour and why the
   cast hangs over it rather than standing on anything.

   Three layers, and none of them is a fluid simulation:

     1. SWELL. Four Gerstner waves summed in the vertex shader. Gerstner rather than
        summed noise because it moves a point in a circle rather than up and down,
        which is what gives water sharp crests and wide troughs. It is analytic, so
        the normals fall out of the same maths for free.

     2. TOUCH. A 256x256 ping-pong target running the discrete wave equation. The
        pointer presses into it and the disturbance genuinely propagates, reflects off
        the edges and dies away. Two passes over a quarter of a megapixel is nothing -
        far cheaper than the geometry it drives - and unlike a decaying radial ripple
        it behaves like a surface rather than like an effect.

     3. MIRROR. Gold at low roughness has almost no colour of its own; nearly all of
        it is the sky coming back. So the surface is not lit at all: it reflects the
        view vector into an equirectangular sky and tints what it finds. No lights, no
        PBR, no PMREM - one texture fetch and a fresnel.

   The reflection of the cast is a separate y-flipped mesh underneath, displaced by
   the same wave field. Stir the water and the reflection tears apart; be still and it
   comes back together. That is the act, and nothing anywhere says so. */

import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

/* ------------------------------------------------------------------ the sky

   Painted, not downloaded. A photographed HDRI brings its own weather and its own
   era with it and both fight a piece that is otherwise a dark theatre with one object
   in it. This is a few gradients and some soft blobs: 40KB of canvas instead of 8MB
   of EXR, and every value in it can be moved by hand. */
export function dreamSky(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  const sky = ctx.createLinearGradient(0, 0, 0, 512);
  /* This was three stops darker and it did render - it simply arrived as a brown
     smudge, because the grade multiplies shadows by a warm tint and then puts a 0.6
     vignette on top. A sky has to be built for what comes out of the pipe, not for
     what looks right in isolation. */
  sky.addColorStop(0, '#243a63');     // zenith
  sky.addColorStop(.26, '#5d6f96');
  sky.addColorStop(.41, '#b4a2a4');
  sky.addColorStop(.48, '#f4cf9d');
  sky.addColorStop(.505, '#ffe6bd');  // the horizon band the sea picks up
  sky.addColorStop(.55, '#8c6f57');
  sky.addColorStop(1, '#1b110b');     // below the horizon: the dark the sea sits in
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 1024, 512);

  /* Clouds. Deliberately few and deliberately soft: they exist to give the surface
     something to break up as it moves, not to be looked at. Anything with a readable
     edge turns the sea into a picture of a sky rather than a sheet of metal. */
  const cloud = (x: number, y: number, w: number, h: number, alpha: number) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, w);
    g.addColorStop(0, `rgba(255,238,214,${alpha})`);
    g.addColorStop(.55, `rgba(255,226,196,${alpha * .35})`);
    g.addColorStop(1, 'rgba(255,226,196,0)');
    ctx.save();
    ctx.translate(x, y); ctx.scale(1, h / w); ctx.translate(-x, -y);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, w, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  };
  ctx.filter = 'blur(7px)';
  cloud(190, 178, 210, 58, .78);
  cloud(320, 202, 150, 40, .52);
  cloud(660, 164, 240, 66, .68);
  cloud(870, 194, 170, 44, .46);
  cloud(480, 226, 290, 40, .4);
  cloud(60, 210, 160, 34, .34);
  ctx.filter = 'none';

  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  /* This one line is the difference between a sky and no sky.

     A CanvasTexture flips vertically by default, because that is what an image
     decoded from a file needs. A canvas painted top-down does not: with flipY on,
     row 0 of the gradient - which is the zenith - is sampled at the bottom of the
     sphere, and the near-black below-horizon colour ends up directly overhead. The
     background rendered perfectly the whole time and what it rendered was the dark
     end of the ramp, which is why it read as no background at all.

     The sea's own shader builds its lookup from acos(y), so it was reflecting the
     same upside-down sky and going dark for exactly the same reason. */
  texture.flipY = false;
  return texture;
}

/* ------------------------------------------------------------- the wave field

   The discrete wave equation, two frames of state, ping-ponged.

     next = 2*current - previous + c^2 * (laplacian of current)

   Current height lives in the red channel and the previous frame's in green, so one
   RGBA target carries both and a single pass advances the whole thing. Damping keeps
   it from ringing forever; without it the surface never returns to glass and the
   reflection never reassembles, which would cost the act its second half. */
const RIPPLE = 256;

export function createRipple(renderer: THREE.WebGLRenderer) {
  const options = {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    depthBuffer: false,
    stencilBuffer: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
  } as const;
  let read = new THREE.WebGLRenderTarget(RIPPLE, RIPPLE, options);
  let write = new THREE.WebGLRenderTarget(RIPPLE, RIPPLE, options);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      tState: { value: null as THREE.Texture | null },
      uTexel: { value: 1 / RIPPLE },
      uPress: { value: new THREE.Vector2(-9, -9) },
      uForce: { value: 0 },
      uDamp: { value: .992 },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform sampler2D tState;
      uniform float uTexel, uForce, uDamp;
      uniform vec2 uPress;
      varying vec2 vUv;
      void main(){
        vec4 s = texture2D(tState, vUv);
        float here = s.r, before = s.g;

        /* Four neighbours. Sampling outside the target clamps to the edge, which
           makes the boundary behave like a wall and reflects the wave instead of
           swallowing it - the right behaviour for a pool and free. */
        float sum =
          texture2D(tState, vUv + vec2( uTexel, 0.)).r +
          texture2D(tState, vUv + vec2(-uTexel, 0.)).r +
          texture2D(tState, vUv + vec2(0.,  uTexel)).r +
          texture2D(tState, vUv + vec2(0., -uTexel)).r;

        float next = (here * 2. - before + (sum * .25 - here) * 1.92) * uDamp;

        /* the pointer, pressed in as a soft dome rather than a single texel, or the
           wave that comes off it is all corner and no swell */
        /* A tighter, weaker press.

           At 900 the gaussian is about four per cent of the field across, which on a
           26 unit stretch of water is a metre-wide dent per frame - the reader moved
           the cursor and the sea heaved. A wake should be a disturbance on the swell,
           not a second swell. Narrowing it and taking the force down turns the same
           gesture into a trail of small rings that spread and die, which is both what
           water does and much easier to look at. */
        float d = distance(vUv, uPress);
        next += uForce * exp(-d * d * 5200.);

        gl_FragColor = vec4(next, here, 0., 1.);
      }`,
  });

  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  const scene = new THREE.Scene();
  scene.add(quad);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // both buffers start flat, or the first frame propagates whatever was in memory
  const clear = renderer.getClearColor(new THREE.Color());
  const clearAlpha = renderer.getClearAlpha();
  const previousTarget = renderer.getRenderTarget();
  renderer.setClearColor(0x000000, 1);
  for (const target of [read, write]) { renderer.setRenderTarget(target); renderer.clear(); }
  renderer.setRenderTarget(previousTarget);
  renderer.setClearColor(clear, clearAlpha);

  let accumulator = 0;

  return {
    get texture() { return read.texture; },

    /** @param press pointer in 0..1 surface space, or null when it is not on the water */
    step(dt: number, press: THREE.Vector2 | null, force: number) {
      /* A fixed step, because the wave equation is only stable inside one. On a
         120Hz display a variable dt halves the effective wave speed; on a stalled
         frame it explodes the buffer into NaN and the surface never recovers. */
      accumulator = Math.min(accumulator + dt, .1);
      let steps = 0;
      while (accumulator >= 1 / 60 && steps < 3) {
        accumulator -= 1 / 60;
        steps++;
        material.uniforms.tState.value = read.texture;
        material.uniforms.uPress.value.copy(press ?? new THREE.Vector2(-9, -9));
        material.uniforms.uForce.value = press ? force : 0;
        renderer.setRenderTarget(write);
        renderer.render(scene, camera);
        renderer.setRenderTarget(null);
        const swap = read; read = write; write = swap;
      }
    },

    dispose() {
      read.dispose(); write.dispose();
      quad.geometry.dispose(); material.dispose();
    },
  };
}

/* ------------------------------------------------------------------ the surface */

/* Size and subdivision are one decision, not two. The plane was 190 units across at
   232 segments, which is 0.82 units per quad - and a quad cannot represent a wave
   shorter than about four of itself. Every wavelength under three units was being
   silently averaged away, which is why shortening them in the shader did nothing and
   the surface kept reading as dunes. Seventy units at 300 segments is 0.23 per quad,
   and the horizon is carried by the distance fade rather than by raw size. */
export const SEA_SIZE = 70;
const SEA_SEGMENTS = 300;
/** how much of the plane the ripple field covers, in world units */
export const RIPPLE_EXTENT = 26;

const GERSTNER = /* glsl */`
  /* direction.xy, steepness, wavelength */
  /* Shorter than they were. At 13 units a crest is wider than the cast is tall and
     the surface reads as dunes rather than as water: scale is carried almost entirely
     by wavelength against the size of the thing floating over it. */
  /* Six, with deliberately uncorrelated directions and wavelengths that are not
     simple ratios of each other. Four waves heading broadly the same way sum into a
     repeating corduroy - the surface had a period you could count, which is the one
     thing open water never has. */
  const vec4 W0 = vec4( 1.00,  0.00, 0.15, 3.10);
  const vec4 W1 = vec4( 0.63,  0.78, 0.12, 1.87);
  const vec4 W2 = vec4(-0.91,  0.42, 0.10, 1.13);
  const vec4 W3 = vec4( 0.19, -0.98, 0.08, 0.71);
  const vec4 W4 = vec4(-0.36, -0.93, 0.06, 0.43);
  const vec4 W5 = vec4( 0.87, -0.49, 0.05, 0.27);

  vec3 gerstner(vec4 w, vec3 p, float t, inout vec3 tangent, inout vec3 binormal){
    vec2 d = normalize(w.xy);
    float k = 6.28318530718 / w.w;
    float c = sqrt(9.8 / k);
    float a = w.z / k;
    float f = k * (dot(d, p.xz) - c * t);
    float cf = cos(f), sf = sin(f);

    tangent  += vec3(-d.x * d.x * w.z * sf, d.x * w.z * cf, -d.x * d.y * w.z * sf);
    binormal += vec3(-d.x * d.y * w.z * sf, d.y * w.z * cf, -d.y * d.y * w.z * sf);
    return vec3(d.x * a * cf, a * sf, d.y * a * cf);
  }

  vec3 swell(vec3 p, float t, out vec3 normal){
    vec3 tangent = vec3(1., 0., 0.);
    vec3 binormal = vec3(0., 0., 1.);
    vec3 offset = vec3(0.);
    offset += gerstner(W0, p, t, tangent, binormal);
    offset += gerstner(W1, p, t, tangent, binormal);
    offset += gerstner(W2, p, t, tangent, binormal);
    offset += gerstner(W3, p, t, tangent, binormal);
    offset += gerstner(W4, p, t, tangent, binormal);
    offset += gerstner(W5, p, t, tangent, binormal);
    normal = normalize(cross(binormal, tangent));
    return offset;
  }`;

export function createSea(sky: THREE.Texture, ripple: THREE.Texture) {
  const geometry = new THREE.PlaneGeometry(SEA_SIZE, SEA_SIZE, SEA_SEGMENTS, SEA_SEGMENTS);
  geometry.rotateX(-Math.PI / 2);

  const material = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      tSky: { value: sky },
      tRipple: { value: ripple },
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uExtent: { value: RIPPLE_EXTENT },
      uGold: { value: new THREE.Color('#e0a244') },
      uDeep: { value: new THREE.Color('#160d05') },
      /* The sky is an HDRI and its values run far above 1 - open sky sits around 4
         to 8 and the sun is orders past that. A raw ShaderMaterial gets no tone
         mapping of its own, so multiplying those numbers by anything at all saturated
         every channel and the sea came out as a flat pale sheet with no waves in it:
         all the shading was happening above white. This puts the sample back into a
         range where the metal response actually has somewhere to move. */
      uSkyExposure: { value: .15 },
      uTouch: { value: 0 },
    },
    vertexShader: /* glsl */`
      uniform sampler2D tRipple;
      uniform float uTime, uExtent, uTouch;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying float vCrest;
      ${GERSTNER}
      void main(){
        vec3 p = (modelMatrix * vec4(position, 1.)).xyz;

        vec3 n;
        vec3 offset = swell(p, uTime, n);
        p += offset;

        /* the interactive field, laid over the swell only where it reaches */
        vec2 rUv = p.xz / uExtent + .5;
        float inside = step(0., rUv.x) * step(rUv.x, 1.) * step(0., rUv.y) * step(rUv.y, 1.);
        float h = texture2D(tRipple, rUv).r * inside;
        p.y += h * 2.4 * uTouch;

        /* Slopes from the same field by finite difference. Four extra fetches in the
           vertex stage, which is where they are cheapest, and without them a ripple
           displaces the surface without changing what it reflects - so it moves and
           yet somehow does not read as water. */
        float e = 1.5 / uExtent;
        float hx = texture2D(tRipple, rUv + vec2(e, 0.)).r - texture2D(tRipple, rUv - vec2(e, 0.)).r;
        float hz = texture2D(tRipple, rUv + vec2(0., e)).r - texture2D(tRipple, rUv - vec2(0., e)).r;
        n = normalize(n + vec3(-hx, 0., -hz) * 26. * inside * uTouch);

        vWorld = p;
        vNormal = n;
        vCrest = clamp(offset.y * 1.6 + h * 2.4, -1., 1.);
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.);
      }`,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform sampler2D tSky;
      uniform vec3 uGold, uDeep;
      uniform float uOpacity, uSkyExposure;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying float vCrest;
      const float PI = 3.14159265359;

      vec3 sampleSky(vec3 dir){
        vec2 uv = vec2(atan(dir.z, dir.x) / (2. * PI) + .5, acos(clamp(dir.y, -1., 1.)) / PI);
        return texture2D(tSky, uv).rgb * uSkyExposure;
      }

      void main(){
        vec3 view = normalize(vWorld - cameraPosition);
        vec3 n = normalize(vNormal);
        vec3 r = reflect(view, n);

        /* Gold is a coloured mirror, and everything below follows from that.

           The first version of this multiplied a sample of the sky by a gold colour,
           which is how you shade a painted surface, and it produced exactly that: a
           flat sand-coloured sheet. A conductor does not tint what lands on it - it
           reflects different amounts of each wavelength, almost all of the red and
           barely a third of the blue, and the amount changes with angle. Schlick with
           gold's own F0 is three lines and it is the whole difference between metal
           and beige. */
        const vec3 F0 = vec3(1.00, 0.72, 0.30);
        float cosT = clamp(dot(-view, n), 0., 1.);
        /* Schlick, with its whitening deliberately held back.

           Every surface reflects everything at grazing incidence, and a sea watched
           from a low camera is almost entirely grazing incidence - so the honest curve
           turns the whole middle distance the colour of the sky and leaves gold only
           in a thin band. That is correct and it is not what this act is for. Letting
           the edge term reach a third of the way to white keeps the sheet reading as
           metal all the way in, while the angular falloff still does its work. */
        vec3 F = mix(F0, vec3(1.), pow(1. - cosT, 5.) * .32);

        /* Anything reflecting below the horizon is looking into the body of the metal
           rather than at the sky; folding it back keeps troughs from becoming holes. */
        float below = smoothstep(0., -.14, r.y);
        vec3 sky = sampleSky(vec3(r.x, abs(r.y), r.z));

        /* And the sky's own colour is thrown away almost entirely.

           What the surface takes from the sky is how *bright* it is in that direction,
           not what colour it is. Keeping even a fifth of the hue was enough to pull
           the whole sheet toward the sky's grey-blue, and grey-blue mixed into gold is
           khaki - which is exactly what this looked like: a desert. */
        float lum = dot(sky, vec3(.2126, .7152, .0722));
        vec3 base = uGold * lum * 1.15 * F;

        /* Troughs dark, crests bright, and a wide gap between them.

           Metal does not read as metal because of its colour - a matte gold-coloured
           sheet is cardboard. It reads as metal because of contrast: a dark body with
           a few extremely bright specular events on it. The base above is deliberately
           low so that the sun below has somewhere to be brilliant against, and this
           term opens the gap further by darkening what is facing away. */
        base *= .30 + .70 * smoothstep(-.55, .55, vCrest);
        vec3 col = mix(base, uDeep, below * .9);

        /* The sun, as a hard specular lobe.

           This is what was missing entirely. A smooth sky reflected in a moving
           surface barely changes as that surface tilts, so the waves were displacing
           geometry that looked identical from crest to trough. A tight highlight
           changes enormously across a degree of slope, and the field of broken glitter
           it throws across the swell is most of what tells a viewer they are looking
           at liquid metal rather than at a dune. */
        /* The sun sits low and beyond the far horizon, in the direction the camera
           is already looking. That is what lays a glitter path down the water toward
           the viewer instead of putting the highlight somewhere off frame - and the
           broken road of light running to the horizon is the single most recognisable
           thing about a liquid metal surface. */
        vec3 sun = normalize(vec3(.06, .13, -.99));
        float lobe = max(dot(r, sun), 0.);
        col += vec3(1., .89, .62) * pow(lobe, 340.) * 5.5;
        col += vec3(1., .80, .42) * pow(lobe, 34.) * .8;

        // grazing angles return nearly everything, which is what reads as a sheet
        col += uGold * pow(1. - cosT, 5.) * .55;

        // a thin bright line riding the crests, so movement is legible when still
        col += vec3(1., .92, .72) * smoothstep(.5, 1., vCrest) * .3;

        /* Distance fade, pushed well out. At 13 units the far half of the plane was
           a flat wash and the horizon sat almost on top of the camera. */
        float far = smoothstep(26., 60., length(vWorld.xz));
        gl_FragColor = vec4(col, uOpacity * (1. - far * .94));
      }`,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return { mesh, material, geometry };
}

/* ------------------------------------------------------- the reflected figure

   A y-flipped copy of the unbroken cast, sitting under the surface, displaced by the
   same wave field the water is. The point of the act lives here: the thing above is
   repaired and carries its cracks, and the thing in the water is whole - the water is
   showing what it was before. Touch the water and that image tears apart. Stop, and
   it comes back.

   Doing it as displaced geometry rather than as a planar reflection pass is both far
   cheaper - no second render of the scene - and more controllable, because a real
   reflection would insist on being accurate and accuracy is not what this is for. */
export function reflectionMaterial(ripple: THREE.Texture) {
  const material = new THREE.MeshBasicMaterial({
    color: 0xe8c68a, transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  material.onBeforeCompile = shader => {
    shader.uniforms.tRipple = { value: ripple };
    shader.uniforms.uExtent = { value: RIPPLE_EXTENT };
    shader.uniforms.uTear = { value: 0 };
    shader.uniforms.uTime = { value: 0 };
    (material as unknown as { uniforms: Record<string, THREE.IUniform> }).uniforms = shader.uniforms;

    shader.vertexShader = `
      uniform sampler2D tRipple;
      uniform float uExtent, uTear, uTime;
      varying float vBreak;
      ${shader.vertexShader}`.replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 world = (modelMatrix * vec4(transformed, 1.)).xyz;
        vec2 rUv = world.xz / uExtent + .5;
        float inside = step(0., rUv.x) * step(rUv.x, 1.) * step(0., rUv.y) * step(rUv.y, 1.);
        float h = texture2D(tRipple, rUv).r * inside;

        /* The displacement is lateral, not vertical. A reflection that bobs up and
           down still reads as one object; a reflection smeared sideways along the
           slope of the wave is the thing that comes apart, which is what a real one
           does and what this act is about. */
        float e = 1.5 / uExtent;
        float hx = texture2D(tRipple, rUv + vec2(e, 0.)).r - texture2D(tRipple, rUv - vec2(e, 0.)).r;
        float hz = texture2D(tRipple, rUv + vec2(0., e)).r - texture2D(tRipple, rUv - vec2(0., e)).r;
        /* Clamped, and far smaller than it was. At 52 a single steep wavelet threw
           whole vertices across the frame and the reflection stopped being a figure
           at all - it became one bright smear near the shore. A reflection distorts;
           it does not disintegrate. */
        vec2 slope = clamp(vec2(hx, hz) * 6.5, -.6, .6);
        transformed.x += slope.x * uTear;
        transformed.z += slope.y * uTear;
        transformed.y += clamp(h, -.5, .5) * .9 * uTear;
        vBreak = clamp(length(slope) * 2.2 * uTear, 0., 1.);`);

    shader.fragmentShader = `
      varying float vBreak;
      ${shader.fragmentShader}`.replace('#include <color_fragment>', `#include <color_fragment>
        // what has been pulled apart also dims, so a torn reflection reads as lost
        diffuseColor.rgb *= 1. - vBreak * .72;
        diffuseColor.a *= 1. - vBreak * .45;`);
  };
  return material;
}

/* ------------------------------------------------------------------ the dome

   scene.background was the obvious way to put this sky behind the sea and it cost an
   hour. It reports as set, the texture is right, the mapping is right, and it still
   arrives dark - somewhere between the equirect background path, the tone map and a
   post chain that was written on the assumption of an empty void, the thing simply
   does not survive.

   So the sky is a mesh. It is a sphere with its faces turned inward and an unlit
   material, it costs one draw call and no lighting, and it does exactly what it is
   told: it fades in with the act, it can be brightened by hand, and it goes through
   the same passes as everything else instead of being special-cased by the renderer.
   Sometimes the boring object is the correct object. */
export function createSkyDome(sky: THREE.Texture) {
  const material = new THREE.MeshBasicMaterial({
    map: sky,
    side: THREE.BackSide,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    fog: false,
    /* Tone mapped, deliberately. The HDRI carries values well above 1 and sending
       them straight to the buffer clips the whole sky to a flat sheet: the clouds
       stop having shape and the sea has nothing worth reflecting. */
    toneMapped: true,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(78, 40, 24), material);
  mesh.frustumCulled = false;
  // behind everything, and it must never occlude the water it is being reflected in
  mesh.renderOrder = -100;
  mesh.visible = false;
  return { mesh, material };
}

/* --------------------------------------------------------------- the real sky

   A painted canvas was the right call while there was nothing to load; there is now
   a 1k HDRI in public and it is better than anything worth hand-painting, so it wins.
   It is used for three things at once and that is the reason it earns its 1.2MB:

     - the visible sky, on the dome
     - what the gold reflects, in the sea shader
     - what lights the cast, as a PMREM environment

   All three acts in the middle of the piece have no lamps of their own to speak of,
   so the third of those is not a nicety - without it the figure is a silhouette.

   It loads after the scene is already running and swaps itself in when it arrives.
   Nothing waits for it: the painted sky is the placeholder, and on a slow connection
   the act still plays. */
export function loadRealSky(
  renderer: THREE.WebGLRenderer,
  url: string,
  onReady: (equirect: THREE.Texture, environment: THREE.Texture) => void,
) {
  let cancelled = false;
  new RGBELoader().load(url, texture => {
    if (cancelled) { texture.dispose(); return; }
    texture.mapping = THREE.EquirectangularReflectionMapping;

    /* PMREM once, here, rather than letting three do it lazily on the first frame the
       environment is used - that lazy path lands the whole convolution on a single
       frame in the middle of a scroll, which is a visible hitch exactly where this
       piece can least afford one. */
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const environment = pmrem.fromEquirectangular(texture).texture;
    pmrem.dispose();

    onReady(texture, environment);
  }, undefined, () => { /* no sky file: the painted one stays, and nothing breaks */ });

  return () => { cancelled = true; };
}
