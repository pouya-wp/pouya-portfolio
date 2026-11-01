'use client';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { AOPass } from './ao';
import { DofPass } from './dof';
import { parseGlb, normaliseMesh, meshToGeometry, shardSeeds, fractureShell, seamRibbons, surfacePoints } from './sculpture-model';
import { unpackBakedShards, type BakedShards } from './shards-bake';
import { loadBaked, sampleBaked } from './physics-playback';
import { BOARD, createChessSet, createDesk, createMat, createSheet, createBackWall, createCyclorama, createPedestal, createProjectCard, createCutter, createPencil, createClip, createEraser, textSamples, makeParticles } from './scene-elements';
import { ScenePass, GlowPass, GradePass, FinishPass } from './postfx';
import { TRACKS, pointer, stepPointer } from './pointer';
import { ACT_AT, ACT_SPAN, HEAD_END, LEGACY_HEAD, LEGACY_TAIL_FROM, LEGACY_TAIL_SPAN, PROJECTS, SCULPTURE, TAIL_AT, smooth, range, windowOpacity } from './story';
import { createFlock } from './flock';
import { createRipple, createSea, createSkyDome, dreamSky, loadRealSky, RIPPLE_EXTENT } from './sea';
import { bakePlasterNoise } from './noise-bake';
import { FilmBurnShader } from './filmburn';
import { createButterflies, createCandle } from './butterflies';
import { createBewilderment } from './bewilderment';
import { signals } from './signals';

type Props = {
  /** Written every frame by the page's scroll loop, so the scene never re-renders React. */
  driver: { current: { progress: number; velocity: number } };
  onReady: () => void;
  paused?: boolean;
  /** index of the card the camera is diving into, or -1 */
  focus?: number;
  onCardHover?: (index: number) => void;
  onCardSelect?: (index: number) => void;
};

/* An equirectangular studio painted to a canvas: a warm key at the upper left, a
   cool bounce opposite it, a bright horizon and a dark floor. Run through PMREM it
   gives the polished stone and the metal something worth reflecting. */
function studioEnvironment(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  const sky = ctx.createLinearGradient(0, 0, 0, 512);
  sky.addColorStop(0, '#584e40');
  sky.addColorStop(.38, '#322618');
  sky.addColorStop(.52, '#241a10');
  sky.addColorStop(1, '#120c06');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 1024, 512);

  const blob = (x: number, y: number, rx: number, ry: number, colour: string, alpha: number) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
    g.addColorStop(0, colour);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y); ctx.scale(1, ry / rx); ctx.translate(-x, -y);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, rx, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  };

  // 360-degree studio lighting: key, rear rim, side kick, and floor bounce
  blob(210, 120, 260, 180, '#fff0d6', .98);    // the front key
  blob(660, 130, 280, 180, '#fff6e4', .95);    // back-right golden rim
  blob(880, 150, 240, 160, '#ffebc4', .90);    // back-left warm bounce
  blob(440, 180, 220, 140, '#ffdfa4', .70);    // side fill
  blob(520, 470, 470, 150, '#e07820', .25);    // warm floor bounce

  // Studio softbox: this is the streak that reads as polish on the stone
  const box = ctx.createLinearGradient(120, 40, 120, 250);
  box.addColorStop(0, 'rgba(255,255,255,0)');
  box.addColorStop(.22, 'rgba(255,248,232,.95)');
  box.addColorStop(.78, 'rgba(255,240,214,.95)');
  box.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.save();
  ctx.filter = 'blur(10px)';
  ctx.fillStyle = box;
  ctx.fillRect(86, 40, 74, 210);
  ctx.fillStyle = 'rgba(255,236,200,.35)';
  ctx.fillRect(680, 50, 60, 180);
  ctx.restore();

  // horizon strip
  const horizon = ctx.createLinearGradient(0, 246, 0, 268);
  horizon.addColorStop(0, 'rgba(255,237,215,0)');
  horizon.addColorStop(.5, 'rgba(255,214,158,.16)');
  horizon.addColorStop(1, 'rgba(255,237,215,0)');
  ctx.fillStyle = horizon;
  ctx.fillRect(0, 246, 1024, 22);

  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}


export default function Sculpture({ driver, onReady, paused = false, focus = -1, onCardHover, onCardSelect }: Props) {
  const mount = useRef<HTMLDivElement>(null);
  const ready = useRef(onReady);
  const pause = useRef(paused);
  const focusRef = useRef(focus);
  const hoverCb = useRef(onCardHover);
  const selectCb = useRef(onCardSelect);
  /* Two different failures used to share one message, and the message named the
     one cause that was usually wrong: any exception thrown while building the scene
     - a typo included - was reported to the visitor as "enable hardware
     acceleration". That sends someone into their graphics settings to fix a bug in
     this file. They are told apart now, and the real one is always logged. */
  const [failed, setFailed] = useState<null | 'webgl' | 'error'>(null);

  useEffect(() => {
    ready.current = onReady;
    pause.current = paused;
    focusRef.current = focus;
    hoverCb.current = onCardHover;
    selectCb.current = onCardSelect;
  }, [focus, onCardHover, onCardSelect, onReady, paused]);

  function build(source: ArrayBuffer, preloadedNoise?: Uint8Array | null, bakedShardsData?: ArrayBuffer | null): () => void {
    const host = mount.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: false, antialias: false, powerPreference: 'high-performance' });
    } catch (error) {
      console.error('[sculpture] WebGL context unavailable', error);
      setFailed('webgl'); ready.current(); return () => {};
    }

    // the native cursor is only hidden once we know a WebGL one will replace it
    const wantsGlCursor = matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (wantsGlCursor) document.documentElement.classList.add('has-gl-cursor');
    const restoreCursor = () => document.documentElement.classList.remove('has-gl-cursor');

    /* 1.5 rather than 1.6. Every full-resolution pass in the chain - the scene, the
       defocus, the bloom, the grade, the finish - pays for this squared, so the step
       down is about a tenth off the whole frame for a difference nobody can see on a
       retina panel. */
    renderer.setPixelRatio(Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 2, 2.0));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(renderer.domElement);

    /* ------------------------------------------------------------ the room */
    const GROUND = new THREE.Color('#100904');
    const FOG_DARK = new THREE.Color('#100904');
    const FOG_ROOM = new THREE.Color('#c3b294');
    const FOG_PAPER = new THREE.Color('#f6ead6');
    const scene = new THREE.Scene();
    const GROUND_BG = GROUND.clone();
    scene.background = GROUND_BG;
    scene.fog = new THREE.FogExp2(0x100904, .019);
    const camera = new THREE.PerspectiveCamera(34, 1, .1, 280);

    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const equirect = studioEnvironment();
    const environment = pmrem.fromEquirectangular(equirect);
    scene.environment = environment.texture;
    scene.environmentIntensity = 1.35;
    equirect.dispose(); pmrem.dispose();

    const ambient = new THREE.HemisphereLight(0xf0e6d4, 0x120b05, .55); scene.add(ambient);
    const key = new THREE.DirectionalLight(0xfff2dd, 3.6); key.position.set(-4.2, 5.4, 4.6); scene.add(key);
    const rim = new THREE.DirectionalLight(0xffeed6, 3.2); rim.position.set(4.6, 1.6, -4.2); scene.add(rim);
    const fill = new THREE.DirectionalLight(0xbfd0dc, 1.15); fill.position.set(5.2, -1.4, 3.4); scene.add(fill);
    const edge = new THREE.DirectionalLight(0xffc98a, 2.9); edge.position.set(-1.4, -2.6, -5.4); scene.add(edge);
    const goldBackKicker = new THREE.DirectionalLight(0xffdfa4, 2.8);
    goldBackKicker.position.set(-2.0, 3.6, -5.2);
    scene.add(goldBackKicker);
    /* A warm kick from off frame right. It used to sit 1.5 units above the mat at
       full vermilion, which put a hard orange hotspot on the surface, and it tracked
       the cursor one for one - so the brightest thing in the shot slid about with the
       mouse. Further out, dimmer, and the same gold as the seams and the interface. */
    const ember = new THREE.PointLight(0xe0a244, 2.1, 26, 2); ember.position.set(4.6, .4, -3.2); scene.add(ember);

    // the desk lamp: the only light that casts, and only while the desk is on screen
    const lamp = new THREE.SpotLight(0xffd9a4, 0, 34, Math.PI / 3.4, 1, .9);
    lamp.position.set(-2.2, 11.5, 2.4);
    lamp.target.position.set(0, -2.65, 0);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(1024, 1024);
    lamp.shadow.camera.near = 2; lamp.shadow.camera.far = 24;
    lamp.shadow.bias = -.0016;
    lamp.shadow.radius = 3;
    const stageLight = new THREE.SpotLight(0xfff0d6, 0, 14, Math.PI / 5.6, .8, 1.2);
    stageLight.position.set(-2.2, 7.4, 4.6);
    stageLight.target.position.set(0, -2.4, -.4);
    stageLight.castShadow = true;
    stageLight.shadow.mapSize.set(1024, 1024);
    stageLight.shadow.bias = -.0014;
    scene.add(stageLight, stageLight.target);

    const edgeBack = new THREE.DirectionalLight(0xffcf95, 0);
    edgeBack.position.set(.4, .6, -6);
    scene.add(edgeBack);

    const roomFill = new THREE.DirectionalLight(0xffeed4, 0);
    roomFill.position.set(1.2, 3.4, 9);
    scene.add(roomFill);

    const overheadFill = new THREE.DirectionalLight(0xf3e2c2, 0);
    overheadFill.position.set(.6, 8, 1.6);
    scene.add(lamp, lamp.target, overheadFill);

    const ndc = new THREE.Vector2();
    let seed = 41;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

    /* ----------------------------------------------------------- backdrop */
    const backdropMaterial = new THREE.ShaderMaterial({
      depthWrite: false, depthTest: false, fog: false,
      uniforms: {
        uCentre: { value: new THREE.Vector2(.42, .5) },
        uWarm: { value: new THREE.Color('#4a2a12') },
        uBase: { value: new THREE.Color('#100904') },
        uAmount: { value: 1 },
        uAspect: { value: 1 },
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 1., 1.); }',
      fragmentShader: `
        precision highp float;
        uniform vec2 uCentre; uniform vec3 uWarm, uBase; uniform float uAmount, uAspect;
        varying vec2 vUv;
        void main(){
          vec2 d = vUv - uCentre; d.x *= uAspect;
          float core = 1. - smoothstep(0., .95, length(d));
          float floorKick = (1. - smoothstep(0., .62, vUv.y)) * .4;
          vec3 c = mix(uBase, uWarm, clamp(pow(core, 1.7) + core * floorKick, 0., 1.) * uAmount);
          gl_FragColor = vec4(c, 1.);
        }`,
    });
    const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), backdropMaterial);
    backdrop.frustumCulled = false; backdrop.renderOrder = -1; scene.add(backdrop);

    const seamHeatUniform = { value: 0 };
    const drainUniform = { value: -1 };

    /* --------------------------------------------------------- materials */
    /* The plaster's noise, baked once into a 3D texture. See noise-bake.ts - the
       material used to evaluate about three hundred sines per fragment for a surface
       that never changes. */
    const baked = bakePlasterNoise(preloadedNoise);
    const noiseUniform = { value: baked.texture };

    const NOISE = `
      float h3(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
      float vnoise(vec3 p){
        vec3 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
        return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x),
                       mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x),
                       mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
      float fbm(vec3 p){ return vnoise(p) * .55 + vnoise(p * 2.13) * .28 + vnoise(p * 4.71) * .17; }`;

    /* Plaster: matte, slightly translucent at the edges, and never quite white.
       The grain is fine and the tone drifts a little, the way a cast does where the
       mould seam and the dust have had years to work on it. */
    const plaster = new THREE.MeshPhysicalMaterial({
      color: 0xf4efe4, metalness: 0, roughness: .93,
      sheen: .3, sheenRoughness: .85, sheenColor: new THREE.Color(0xfff2dc),
      side: THREE.FrontSide,
    });
    plaster.onBeforeCompile = shader => {
      shader.vertexShader = `varying vec3 vCast;
varying vec3 vViewN;
${shader.vertexShader}`
        .replace('#include <begin_vertex>', `#include <begin_vertex>
        vCast = (modelMatrix * vec4(position, 1.)).xyz;`)
        .replace('#include <defaultnormal_vertex>', `#include <defaultnormal_vertex>
        vViewN = normalize(transformedNormal);`);
      shader.uniforms.tNoise = noiseUniform;
      shader.fragmentShader = `varying vec3 vCast;
varying vec3 vViewN;
precision highp sampler3D;
uniform sampler3D tNoise;
/* One fetch, four frequencies. Each channel was baked at the rate it is read at, so
   they are all sampled here at the same low rate - see noise-bake.ts. */
vec4 plasterField(vec3 p){ return texture(tNoise, p * .14); }
${shader.fragmentShader}`;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        vec4 field = plasterField(vCast);
        float grain = field.r;
        float blotch = field.g;
        float dust = smoothstep(.62, 1., field.b);
        diffuseColor.rgb *= .96 + grain * .05 + blotch * .06;
        // dust and age collect in the low, downward-facing places
        diffuseColor.rgb *= 1. - dust * .12;
        // a cheap stand-in for how far light creeps into gypsum before it comes back
        float wrap = pow(1. - abs(dot(normalize(vViewN), vec3(0., 0., 1.))), 3.);
        diffuseColor.rgb += vec3(.16, .12, .09) * wrap * .4;`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor * (.9 + plasterField(vCast).b * .22), .6, 1.);`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        /* The gradient used to cost four more fbm evaluations - the centre plus one
           per axis. Screen-space derivatives give the same bump for two fetches and no
           noise arithmetic at all: the hardware is already computing this quantity for
           every quad it shades, and it is being thrown away. */
        float n0 = plasterField(vCast).a;
        vec3 bump = vec3(dFdx(n0), dFdy(n0), 0.) * 10.;
        normal = normalize(normal + bump * .10);`);
    };

    /* The inside of a break is raw, unpolished rock. The metal only pools along the
       edge where the break meets the outside, which is what aRim carries. */
    const fracture = new THREE.MeshStandardMaterial({
      color: 0xf1e9d8, metalness: .04, roughness: .99, side: THREE.FrontSide,
      emissive: 0xdc5000, emissiveIntensity: .1,
    });
    fracture.onBeforeCompile = shader => {
      shader.uniforms.uHeat = seamHeatUniform;
      shader.vertexShader = `attribute float aRim;
varying float vRim;
varying vec3 vRock;
${shader.vertexShader}`.replace('#include <begin_vertex>', `#include <begin_vertex>
        vRim = aRim;
        vRock = (modelMatrix * vec4(position, 1.)).xyz;`);
      shader.fragmentShader = `varying float vRim;
varying vec3 vRock;
uniform float uHeat;
${NOISE}
${shader.fragmentShader}`;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        float lip = smoothstep(.42, .96, vRim);
        // fresh plaster is coarse and bright, and it crumbles at the edge
        float grit = fbm(vRock * 42.);
        float coarse = fbm(vRock * 13.);
        diffuseColor.rgb *= .74 + grit * .34 + coarse * .2;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.82, .5, .18), lip);`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        metalnessFactor = mix(.02, 1., smoothstep(.46, .96, vRim));`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(.99, .19, smoothstep(.46, .96, vRim));`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance *= pow(smoothstep(.5, 1., vRim), 2.) * (1. + uHeat * 8.);`);
    };

    /* ------------------------------------------------------- the sculpture */
    // outer group carries the tilt and the position; the inner one spins
    const sculpture = new THREE.Group();
    const spinner = new THREE.Group();
    sculpture.add(spinner);
    scene.add(sculpture);

    let bakedShards: BakedShards | null = null;
    if (bakedShardsData) {
      try { bakedShards = unpackBakedShards(bakedShardsData); } catch (e) { console.warn('[sculpture] failed to unpack baked shards', e); }
    }
    const cast = bakedShards ? null : normaliseMesh(parseGlb(source), SCULPTURE.height);
    const cells = (!bakedShards && cast) ? fractureShell(cast, shardSeeds(cast, SCULPTURE.shards, random), SCULPTURE.thickness) : null;
    const shards = (bakedShards ? bakedShards.shards : cells!).map(({ geometry, centre }) => {
      const mesh = new THREE.Mesh(geometry, [plaster, fracture]);
      mesh.position.copy(centre);
      mesh.castShadow = mesh.receiveShadow = true;
      spinner.add(mesh);
      return { mesh, home: centre };
    });

    /* What the reader is drawing without being told. Act five resamples it to
       thirty points and the cloud converges on those. See flock.ts. */
    const flock = createFlock();

    // the widest shard is the one that can fill the lens on its way past
    let wipeIndex = 0, widest = 0;
    shards.forEach(({ mesh }, i) => {
      mesh.geometry.computeBoundingSphere();
      const r = mesh.geometry.boundingSphere?.radius ?? 0;
      if (r > widest) { widest = r; wipeIndex = i; }
    });

    const wholeGeometry = bakedShards ? bakedShards.wholeGeometry : meshToGeometry(cast!);
    try { wholeGeometry.computeVertexNormals(); } catch { }
    const whole = new THREE.Mesh(wholeGeometry, plaster);
    whole.castShadow = whole.receiveShadow = true;
    spinner.add(whole);

    /* The seams are flat ribbons, but the shader rounds them into a bead: the
       normal is bent across the width, so a highlight runs the length of every
       repair the way it does on real inlaid metal. */
    const seamGeometry = bakedShards ? bakedShards.seamGeometry : seamRibbons(cells!);
    /* Gold is a metal, so metalness is 1. At .52 the shader mixes a dielectric and a
       conductor response and the result reads as painted plastic - which, with a
       strong orange emissive on top, is why the repairs looked like hot wire laid on
       the cast rather than metal poured into it. Cold gold does not glow: the
       emissive now only carries the ignition, driven by seamHeat. */
    /* Gold is a pure metal, so metalness is 1.0. With low roughness and clearcoat lacquer,
       it shines with blazing 24-karat specular reflections along the crown. */
    const seamMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffc84a, metalness: 1.0, roughness: .14,
      emissive: 0xffab52, emissiveIntensity: 0,
      envMapIntensity: 3.6,
      clearcoat: 1.0, clearcoatRoughness: .08, side: THREE.DoubleSide,
    });
    seamMaterial.onBeforeCompile = shader => {
      shader.uniforms.uDrain = drainUniform;
      shader.vertexShader = `attribute float aAcross;
attribute vec3 aSide;
varying float vAcross;
varying vec3 vBead;
varying float vDrainY;
${shader.vertexShader}`.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        vAcross = aAcross;
        vBead = normalize(objectNormal + aSide * aAcross * .40);
        vDrainY = (modelMatrix * vec4(position, 1.)).y;
        objectNormal = vBead;`);
      shader.fragmentShader = `varying float vAcross;
varying float vDrainY;
uniform float uDrain;
${shader.fragmentShader}`;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        float shoulder = 1. - abs(vAcross);
        /* 24K Japanese Kintsugi Gold: pure burnished metallic specular sheen */
        diffuseColor.rgb = mix(vec3(1.0, 0.74, 0.26), vec3(1.0, 0.94, 0.60), pow(shoulder, 1.8) * .7);`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        // High-gloss polished mirror along the crown, subtle micro-tooth at the plaster edge
        roughnessFactor = mix(.26, .09, smoothstep(0., .75, 1. - abs(vAcross)));`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        // uDrain sweeps a line down the object: everything above it has already run off
        float held = uDrain < 0. ? 1. : smoothstep(uDrain + .55, uDrain - .55, vDrainY);
        totalEmissiveRadiance *= pow(1. - abs(vAcross), 1.4) * mix(.12, 1., held);`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
        float viewDot = clamp(dot(normal, normalize(-vViewPosition)), 0.0, 1.0);
        float rimFresnel = pow(1.0 - viewDot, 3.0);

        // Pure 24K Imperial Gold tones: glowing burnished gold crown, rich amber flanks
        vec3 goldCrown = vec3(1.0, 0.82, 0.38);
        vec3 goldFlank = vec3(0.85, 0.58, 0.16);
        vec3 goldBase = mix(goldFlank, goldCrown, pow(shoulder, 1.5));

        // Metallic specular boost
        outgoingLight *= 1.30;

        // Essential Kintsugi golden floor: in shadow, gold retains its rich luminous golden identity
        // instead of disappearing into pitch black darkness!
        outgoingLight = max(outgoingLight, goldBase * (0.35 + 0.35 * shoulder));

        // Glancing clearcoat lacquer sheen
        outgoingLight += vec3(1.0, 0.90, 0.60) * rimFresnel * 0.35;

        #include <opaque_fragment>
      `);
    };
    const seams = new THREE.Mesh(seamGeometry, seamMaterial);
    spinner.add(seams);

    /* -------------------------------------------- what the cursor can latch on to

       A sample of the model's own vertices, kept in the space of whichever object
       owns them. Each frame these are projected and the nearest few are handed to
       the cursor, so its brackets sit on real geometry - an ear, the lip of a
       shard, the corner of a card - and hand off to new vertices as you move. */
    type Trackable = { local: THREE.Vector3; owner: THREE.Object3D };
    const sampleGeometry = (geometry: THREE.BufferGeometry, owner: THREE.Object3D, stride: number, into: Trackable[]) => {
      const attribute = geometry.getAttribute('position');
      for (let i = 0; i < attribute.count; i += stride) {
        into.push({ local: new THREE.Vector3().fromBufferAttribute(attribute, i), owner });
      }
    };
    const castTracks: Trackable[] = [];
    const shardTracks: Trackable[] = [];
    sampleGeometry(wholeGeometry, whole, 14, castTracks);
    shards.forEach(({ mesh }) => sampleGeometry(mesh.geometry, mesh, 47, shardTracks));

    /* ---------------------------------------------------- the working desk */
    const desk = createDesk();
    const mat = createMat();
    const cutter = createCutter();
    const pencil = createPencil();
    const eraser = createEraser();
    const clipA = createClip();
    const clipB = createClip();
    const props = new THREE.Group();
    pencil.position.set(-4.3, -2.58, 2.15); pencil.rotation.y = .42;
    eraser.position.set(-3.1, -2.59, 3.25); eraser.rotation.y = -.3;
    clipA.position.set(3.5, -2.635, 2.9); clipA.rotation.y = .8; clipA.scale.setScalar(1.5);
    clipB.position.set(3.95, -2.635, 3.25); clipB.rotation.y = -.35; clipB.scale.setScalar(1.5);
    props.add(pencil, eraser, clipA, clipB, cutter);
    const sheet = createSheet();

    /* Each project is a card dealt onto the sheet. A holder carries the angle it
       was thrown at; the card itself lies flat inside it. */
    /* Five cards are dealt onto the sheet. Landscape gets a row of three behind a
       row of two, the way a hand of cards lands on a table; a portrait frame deals
       them up the sheet in pairs instead, along the axis the phone actually has.
       Each spot carries its own scale, because a card at full size is 3.57 deep and
       five of them do not fit a 10.8 sheet without crowding the tools off it. */
    const LANDSCAPE_SPREAD = [
      { x: -2.42, z: -1.42, a: .1, s: .72 }, { x: .02, z: -1.6, a: -.04, s: .72 }, { x: 2.44, z: -1.38, a: -.11, s: .72 },
      { x: -2.42, z: 1.42, a: -.08, s: .72 }, { x: .02, z: 1.5, a: .03, s: .72 }, { x: 2.44, z: 1.42, a: .08, s: .72 },
    ];
    const PORTRAIT_SPREAD = [
      { x: -.98, z: -2.82, a: .06, s: .66 }, { x: .98, z: -2.76, a: -.05, s: .66 },
      { x: -.98, z: 0, a: -.04, s: .66 }, { x: .98, z: .04, a: .05, s: .66 },
      { x: -.98, z: 2.82, a: -.03, s: .66 }, { x: .98, z: 2.86, a: .04, s: .66 },
    ];
    const cards = PROJECTS.map((project) => {
      const built = createProjectCard(project);
      const holder = new THREE.Group();
      holder.add(built.group);
      return { holder, built, base: new THREE.Vector3(), scale: 1, lift: 0, hot: false };
    });
    const cardHolders = cards.map(c => c.holder);
    const layoutCards = () => {
      const spread = width < height ? PORTRAIT_SPREAD : LANDSCAPE_SPREAD;
      cards.forEach((card, i) => {
        const place = spread[i] ?? { x: (i - 2) * 2, z: 0, a: 0, s: .7 };
        card.base.set(place.x, -2.585, place.z);
        card.scale = place.s;
        card.holder.position.copy(card.base);
        card.holder.rotation.y = place.a;
        card.holder.scale.setScalar(place.s);
      });
    };
    // the first placement comes from resize(), which runs before the first frame
    const cardGroup = new THREE.Group();
    cards.forEach(c => cardGroup.add(c.holder));
    const workMaterials = new Set<THREE.Material>();
    for (const root of [props, cardGroup]) root.traverse(node => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach(material => {
        material.transparent = true;
        workMaterials.add(material);
      });
    });

    /* Act one is shot in a studio, not in the workshop: a seamless sweep and a stone
       block, lit like a photograph. It is the only passage where the cast is whole,
       so it is the only one that gets a room built for looking rather than working. */
    const cyc = createCyclorama();
    const pedestal = createPedestal();
    const studio = new THREE.Group();
    studio.add(cyc.mesh, pedestal.group);
    scene.add(studio);

    /* One big soft key from the left and a low fill off the sweep, which is the whole
       lighting plan of a plaster shot. Only the key casts; two shadows on a
       cyclorama look like a mistake. */
    /* Narrow enough to throw a pool with a falloff rather than an even wash - a
       46 degree cone at .85 penumbra lights the whole sweep to one value, which is
       what left act one flat. */
    const studioKey = new THREE.SpotLight(0xfff6e8, 0, 34, Math.PI / 5.6, .58, 1.05);
    studioKey.position.set(-5.2, 7.4, 5.6);
    studioKey.target.position.set(-.2, -1.4, 0);
    studioKey.castShadow = true;
    /* 1024, down from 2048. A shadow map is re-rendered from the light's point of
       view every frame that anything under it moves, which here is every frame, and at
       2048 that is four times the fill of 1024 for one lamp in one act. The softness
       comes from the filter radius, not from the resolution. */
    studioKey.shadow.mapSize.set(1024, 1024);
    /* The shadow camera has to be told what it is looking at. Left on its defaults it
       spanned from .5 to 500 against a scene eleven units deep, so the depth buffer
       had almost no precision where the geometry actually is - the striping that
       appeared across the sweep once the column got long enough to reach the floor.
       normalBias handles the rest: a plain bias peels contact shadows off instead. */
    studioKey.shadow.camera.near = 3;
    studioKey.shadow.camera.far = 26;
    studioKey.shadow.bias = -.0005;
    studioKey.shadow.normalBias = .04;
    studioKey.shadow.radius = 3;
    /* A pool thrown at the sweep itself, behind and above the head. This is the one
       thing that separates a photograph of a plaster cast from a render of one: the
       subject is read against a gradient it is standing in front of, not against a
       flat wall. It lights nothing but the paper. */
    const studioHalo = new THREE.SpotLight(0xfff2dc, 0, 24, Math.PI / 6.4, .95, 1.4);
    studioHalo.position.set(1.2, 2.4, 4.2);
    studioHalo.target.position.set(-.3, .9, -8);
    scene.add(studioHalo, studioHalo.target);

    const studioBounce = new THREE.DirectionalLight(0xffe9cf, 0);
    studioBounce.position.set(3.4, -1.2, 4.2);
    scene.add(studioKey, studioKey.target, studioBounce);

    const wall = createBackWall();

    const cardTracks: Trackable[] = [];
    cards.forEach(({ holder }) => {
      for (const corner of [[-1.27, 1.78], [1.27, 1.78], [1.27, -1.78], [-1.27, -1.78], [0, 0]]) {
        cardTracks.push({ local: new THREE.Vector3(corner[0], .03, -corner[1]), owner: holder });
      }
    });

    const deskGroup = new THREE.Group();
    deskGroup.add(desk.mesh, wall.mesh, mat.mesh, sheet.mesh, props, cardGroup);
    scene.add(deskGroup);
    const raycaster = new THREE.Raycaster();
    let cutterHot = false, hovered = -1;

    const pick = () => {
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObjects(cardHolders, true)[0];
      if (!hit) return -1;
      return cards.findIndex(c => {
        let node: THREE.Object3D | null = hit.object;
        while (node) { if (node === c.holder) return true; node = node.parent; }
        return false;
      });
    };
    const onClick = () => { if (hovered >= 0) selectCb.current?.(hovered); };
    renderer.domElement.addEventListener('click', onClick);

    /* --------------------------------------------------------- point cloud */
    /* Eleven thousand of them, sampled off the surface of the cast itself: the same
       object as the shards and the seams, one geometry wearing another appearance. */
    const particleCount = 11000;
    const cloudPositions = bakedShards ? bakedShards.points : surfacePoints(cast!, particleCount, random);
    const phrases = [
      'BORN IN LIMITATIONS,\nBRED IN ISOLATION.',
      'WE DON’T JUST SURVIVE\nTHE RESTRICTIONS;',
      'WE ARCHITECT THEM INTO\nGOLDEN OPPORTUNITIES.',
    ];
    let texts = phrases.map(t => textSamples(t, particleCount, random, 10.6, 4.2));
    const cloud = makeParticles(cloudPositions, texts[0]); scene.add(cloud);
    let phrase = -1, phraseBlend = 1;
    let disposed = false;
    const fontReady = typeof document !== 'undefined' && document.fonts?.check ? document.fonts.check('600 88px Geist') : true;
    if (!fontReady) void document.fonts.ready.then(() => {
      if (!disposed) { texts = phrases.map(t => textSamples(t, particleCount, random, 10.6, 4.2)); phrase = -1; }
    });




    /* ================================================================ ACT V
       WHAT THE LIGHT MAKES

       There is no object here. There is one light, the reader is holding it, and
       what it falls on exists for as long as it falls on it. Suhrawardi's whole
       argument is that darkness is not a substance - it is the absence of light -
       so nothing in this act is ever drawn dark. It is drawn or it is not there.

       No new geometry: the cast is the cast. The act is a lighting state, which is
       also why it is the cheapest thing in the piece. */
    const soleLight = new THREE.PointLight(0xffe9c9, 0, 26, 1.7);
    soleLight.castShadow = false;
    scene.add(soleLight);
    /* a second, far dimmer one trailing behind it, so a fast hand leaves a wake
       rather than teleporting the only source of existence across the frame */
    const soleTrail = new THREE.PointLight(0xffd9a4, 0, 20, 2.2);
    scene.add(soleTrail);
    const solePoint = new THREE.Vector3();
    const soleLag = new THREE.Vector3();

    /* ================================================================ ACT VI
       THEY DISAGREE */
    /* The gold leaves as two of them. See butterflies.ts - the powder one of them
       becomes is the point cloud of the next act, seeded a beat early. */
    /* The anamorph reuses the surface samples the manifesto cloud already took, so the
       figure the fragments rebuild is the same figure, down to the sample. */
    /* The sea is lit by its own sky and nothing else: a warm key sitting on the
       horizon where the bright band of the gradient is, and a hemisphere carrying the
       blue above and the metal below. Every lamp in the original rig is switched off by
       `legacy` through the middle of the piece, so without these the cast hangs over
       the water as a black silhouette. */
    const seaKey = new THREE.DirectionalLight(0xffdcae, 0); seaKey.position.set(-6, 1.4, 7);
    const seaSky = new THREE.HemisphereLight(0xbcd0ea, 0xc98f3c, 0);
    scene.add(seaKey, seaSky);

    const lost = createBewilderment(cloudPositions, random);
    scene.add(lost.group);
    /* Two lamps of its own: the act happens in the dark theatre, and the chips have to
       catch light from the side or the confusion reads as a flat grey fog. */
    const lostKey = new THREE.DirectionalLight(0xffeeda, 0); lostKey.position.set(-4.2, 3.6, 5.4);
    const lostRim = new THREE.DirectionalLight(0x93b0cc, 0); lostRim.position.set(5.2, .8, -4.4);
    scene.add(lostKey, lostRim);

    /* The world with its materials taken off.

       scene.overrideMaterial was the obvious tool and it draws nothing here. It works
       pointed at the main camera through the post chain it produces an empty frame,
       opaque or
       transparent, wireframe or solid. Rather than keep guessing at why, this flips
       `wireframe` on the materials the scene already has.

       It is the better answer anyway. An override throws the lighting away and returns
       a flat diagram; toggling the flag keeps every lamp, every seam and every shadow
       term exactly where they were and simply stops filling the triangles. What the
       reader gets is the same room they were just in, lit the same way, with the
       surfaces gone - which is the thing the gesture is supposed to mean.

       The flag is a boolean with no state to save, so coming back is the same call
       with false. It is only walked when the key changes, never per frame. */
    /* The materials are swapped out, not edited.

       Two earlier attempts failed for two different reasons and both are worth
       recording. scene.overrideMaterial draws nothing at all through this post chain -
       opaque or transparent, wireframe or solid, an empty frame every time. And
       editing the real materials in place does not work either, because almost every
       surface here is a MeshStandardMaterial with an onBeforeCompile patch that
       rewrites diffuse and emissive from its own noise fields: setting `.emissive` on
       the plaster is simply overwritten further down its own shader, so the cast came
       back as a black silhouette while the unpatched backdrop went bright pink.

       Swapping `mesh.material` for one shared unlit material sidesteps both. It is not
       lit, so there is nothing to shade it black; it ignores every patch, because it
       is not the patched material; and putting it back is one assignment per mesh. */
    const zenWire = new THREE.MeshBasicMaterial({
      color: 0xc98a2e,
      wireframe: true,
      /* Tone mapped like everything else. With it off the colour is written straight
         into a buffer the OutputPass is still going to tone map and convert, so it
         gets the transform twice - gold came out magenta, which is what a double sRGB
         encode does to a warm hue. */
      toneMapped: true,
      fog: false,
    });
    const zenSwapped = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    const setZen = (on: boolean) => {
      if (on) {
        zenSwapped.clear();
        scene.traverse(node => {
          const mesh = node as THREE.Mesh;
          // Points and Lines have no faces to draw as wire and go untouched
          if (!mesh.isMesh || !mesh.visible) return;
          zenSwapped.set(mesh, mesh.material);
          mesh.material = zenWire;
        });
      } else {
        for (const [mesh, material] of zenSwapped) mesh.material = material;
        zenSwapped.clear();
      }
    };
    let zenAmount = 0;
    let zenApplied = false;

    const flight = createButterflies(random);
    scene.add(flight.group);
    /* The source they are both reading, and the only lamp in that act. */
    const candle = createCandle();
    candle.group.visible = false;
    scene.add(candle.group);


    /* ================================================================ ACT VII
       THE GOLD SEA */
    const sky = dreamSky();
    const dome = createSkyDome(sky);
    scene.add(dome.mesh);
    /* The painted sky is the placeholder. The real one arrives a moment later and
       takes over all three of its jobs at once - the dome, the sea's reflection, and
       the light on the cast. `skyEnv` is what the middle three acts are lit by; it is
       held here rather than assigned to scene.environment directly, because the seven
       original acts have their own studio environment and must not inherit this one. */
    let skyEnv: THREE.Texture | null = null;
    /* 1.3 MB that nothing in the first four acts looks at. It used to be requested
       while the preloader was still competing for the same connection; it now waits
       until the opening has rendered and the main thread has gone quiet. */
    let cancelSky = () => { };
    let skyEquirect: THREE.Texture | null = null;
    const skyTimer = setTimeout(() => {
      cancelSky = loadRealSky(renderer, '/citrus_orchard_puresky_1k.hdr', (equirect, environment) => {
        dome.material.map = equirect;
        dome.material.needsUpdate = true;
        sea.material.uniforms.tSky.value = equirect;
        skyEnv = environment;
        skyEquirect = equirect;
        sky.dispose();
      });
    }, 3500);
    const ripple = createRipple(renderer);
    const sea = createSea(sky, ripple.texture);
    sea.mesh.visible = false;
    sea.mesh.position.y = -3.1;
    scene.add(sea.mesh);

    /* There is no reflection in the water, and taking it out was the right call.

       The idea was good - the surface showing the cast as it was before it broke, and
       the reader destroying that image every time they touch it - but an additive
       mirrored mesh laid over a moving gold sheet never resolved into a figure. It read
       as a pale smear near the shore, and a smear cannot carry a reveal. The sea is
       better as what it plainly is: the gold, pooled, with the object above it. */

    const seaPress = new THREE.Vector2();
    const seaPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 3.1);
    const seaHit = new THREE.Vector3();
    const lastPress = new THREE.Vector2(.5, .5);

    /* ------------------------------------------------------------ the board

       The last act is a chess set. The cast, repaired, walks to the white king's
       square and takes it: the piece that was broken ends up on the one square the
       whole board exists to defend. */
    const chess = createChessSet(plaster);
    chess.group.visible = false;
    const chessMaterials = new Set<THREE.Material>();
    chess.group.traverse(node => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach(material => {
        material.transparent = true;
        material.opacity = 0;
        chessMaterials.add(material);
      });
    });
    scene.add(chess.group);
    const kingScale = chess.kingHeight / SCULPTURE.height;
    const kingSeat = chess.kingSquare.clone().setY(BOARD.top + SCULPTURE.height * kingScale * .5);

    /* -------------------------------------------------------- the post chain */
    const buffer = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false });
    const composer = new EffectComposer(renderer, buffer);
    const scenePass = new ScenePass(scene, camera);
    /* Occlusion reads the depth ScenePass already keeps, and lands before the bloom
       so a crease darkens instead of glowing. */
    const ao = new AOPass();
    ao.setDepth(scenePass.target.depthTexture! as THREE.Texture);
    /* Defocus after occlusion and before the bloom, so a bokeh disc is a real
       highlight that then blooms, rather than a bloom that gets blurred. */
    const dof = new DofPass();
    dof.setDepth(scenePass.target.depthTexture! as THREE.Texture);
    const glow = new GlowPass();
    glow.strength = .50; glow.threshold = 0.98;
    const grade = new GradePass();
    /* The burn runs in display space, after tone mapping, because it is standing in
       for something that happened to the print rather than to the scene. */
    const burn = new ShaderPass(FilmBurnShader);
    burn.enabled = false;
    const output = new OutputPass();
    // edge cleanup happens in display space, after tone mapping and before the cursor,
    // so the hairlines of the instrument stay razor sharp
    const fxaa = new ShaderPass(FXAAShader);
    const finish = new FinishPass();
    composer.addPass(scenePass);
    composer.addPass(ao);
    composer.addPass(dof);
    composer.addPass(glow);
    composer.addPass(grade);
    composer.addPass(output);
    composer.addPass(burn);
    composer.addPass(fxaa);
    composer.addPass(finish);

    /* Shadow maps are rendered for a light whose intensity is zero.

       three.js decides whether to draw a shadow map from `castShadow`, not from how
       bright the light is - so four casting lamps meant four full shadow passes on
       every frame of every act, including the acts where three of them are off. That
       is most of a frame's budget spent on maps nothing samples.

       Turning `castShadow` off would fix it and cost far more than it saves: the flag
       is part of the program signature, so every material that receives the light is
       recompiled on the way in and again on the way out - a stall on exactly the
       transitions this is meant to smooth. `autoUpdate` is the right lever. It is not
       part of any signature; it just stops the pass. Each lamp then asks for one map
       on the frames it is actually lighting something. */
    const casters = [lamp, stageLight, studioKey];
    casters.forEach(light => { light.shadow.autoUpdate = false; light.shadow.needsUpdate = true; });

    /* ------------------------------------------------------------ the loop */
    let width = 0, height = 0, frame = 0, current = driver.current.progress;

    let last = performance.now(), elapsed = 0, visible = true, zoom = 0, spin = 0;
    const smoothPointer = new THREE.Vector2();
    const pose = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };
    const zeroQuaternion = new THREE.Quaternion();
    const shot = new THREE.Vector3(), look = new THREE.Vector3(), tmp = new THREE.Vector3();
    const lostShot = new THREE.Vector3();
    let lostResolve = 0;
    const up = new THREE.Vector3(0, 1, 0), cardUp = new THREE.Vector3();
    const projected = new THREE.Vector3();
    const screenX: number[] = [], screenY: number[] = [], screenD: number[] = [];
    const trackSlots = new Int32Array(TRACKS).fill(-1);
    const forward = new THREE.Vector3(), sideward = new THREE.Vector3(), coverPoint = new THREE.Vector3();
    const flyLight = new THREE.Vector3(), flySeam = new THREE.Vector3();
    const wipeQuaternion = new THREE.Quaternion();
    const wipeAxis = new THREE.Vector3(.34, .88, .33).normalize();
    const warmA = new THREE.Color('#3a2a1c'), warmB = new THREE.Color('#6a5a3e');
    /* where a cooling filament ends up on its way to nothing */
    const TUNGSTEN_DYING = new THREE.Color('#8c2a06');
    const lampColour = new THREE.Color();
    const SEAM_HOT = new THREE.Color(0xffe8c2);
    const taken = new Set<number>();


    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { scenePass.setShutter(0); finish.material.uniforms.uGrain.value = .012; }

    /* Every shot in the timeline was framed against a wide viewport. A phone held
       upright keeps the vertical field of view but loses most of the horizontal one,
       so the sides of each composition fall outside the frame. Opening the vertical
       angle back up recovers some of that width. The cap matters: fully matching a
       0.46 aspect wants a 99 degree lens, which reads as a fisheye and shrinks the
       subject to nothing. The rest of the answer is composition, not lens - the
       project cards restack along the sheet rather than across it. */
    const BASE_FOV = 34, REF_ASPECT = 16 / 9, MAX_FOV = 44;
    const wantHalfTan = Math.tan(BASE_FOV / 2 * THREE.MathUtils.DEG2RAD) * REF_ASPECT;

    const resize = () => {
      /* The first call can land before the stylesheet has sized the host, and a zero
         here allocates zero-dimension render targets - which the driver rejects for
         every pass in the chain. */
      width = Math.max(1, host.clientWidth); height = Math.max(1, host.clientHeight);
      const aspect = width / height;
      camera.aspect = aspect;
      camera.fov = aspect >= REF_ASPECT ? BASE_FOV : Math.min(
        MAX_FOV, 2 * Math.atan(wantHalfTan / aspect) * THREE.MathUtils.RAD2DEG);
      camera.updateProjectionMatrix();
      layoutCards();
      renderer.setSize(width, height);
      const pr = renderer.getPixelRatio();
      composer.setPixelRatio(pr);
      composer.setSize(width, height);
      scenePass.setSize(Math.round(width * pr), Math.round(height * pr));
      finish.material.uniforms.uAspect.value = width / height;
      fxaa.material.uniforms.resolution.value.set(1 / (width * pr), 1 / (height * pr));
      backdropMaterial.uniforms.uAspect.value = width / height;
    };
    const observer = new ResizeObserver(resize); observer.observe(host); resize();

    /* The cadence is earned, not fixed.

       This used to be held at 24 frames a second everywhere, for the film look and for
       the budget. On a fast machine that read as judder against a page that scrolls at
       the display's own rate; on a slow one, 24 full-resolution frames of a six-pass
       chain were still more than the GPU had. So the frame now has a governor: it
       starts at a tier the device can plausibly hold, measures what it actually
       achieves over a short window, and steps the resolution down first and the frame
       rate second when it falls behind - then back up, carefully, when there is room.

       The loop still *runs* at display rate. Pointer smoothing and the scroll damp are
       stepped every tick so input never feels coarse - only the render is held to the
       cadence, and it is handed the real elapsed time so nothing animates slower. */
    /* Cost is pixels times frames, and both are capped twice: by the tier the device
       has shown it can hold, and by what the frame actually needs. A still frame is
       re-rendered at a third of the rate of a moving one - the grain and the slow
       turn of the cast survive that, and a laptop's fans notice the difference - and
       no tier ever draws more than its pixel budget, whatever the panel's density.
       A 4K screen at 1.5x used to be eight million pixels through a six-pass chain. */
    const maxDpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 2, 2.0);
    const TIERS = [
      { fps: 60, pr: maxDpr, pixels: 8.3e6 },
      { fps: 60, pr: Math.min(maxDpr, 1.75), pixels: 6.0e6 },
      { fps: 60, pr: Math.min(maxDpr, 1.5), pixels: 4.5e6 },
      { fps: 45, pr: Math.min(maxDpr, 1.25), pixels: 3.2e6 },
      { fps: 30, pr: 1.0, pixels: 2.1e6 },
    ];
    const IDLE_FPS = 30;
    const coarse = matchMedia('(pointer: coarse)').matches;
    const lowMemory = ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8) <= 4;
    let tier = coarse || lowMemory ? 2 : 0;
    const downgrades = Array.from({ length: TIERS.length }, () => 0);
    let FRAME_STEP = 1 / TIERS[tier].fps;
    let backlog = 0;
    let windowStart = 0, windowFrames = 0, slowWindows = 0, fastWindows = 0;
    let lastActive = 0, lastPointerX = -1, lastPointerY = -1, drawMs = 0;
    const pointMaterials: THREE.ShaderMaterial[] = [];
    scene.traverse(node => {
      const material = (node as THREE.Mesh).material as THREE.ShaderMaterial | undefined;
      if (material?.uniforms?.uPixel) pointMaterials.push(material);
    });
    const pixelRatioFor = (t: number) => {
      const area = Math.max(1, host.clientWidth * host.clientHeight);
      return Math.max(1.0, Math.min(TIERS[t].pr, maxDpr, Math.sqrt(TIERS[t].pixels / area)));
    };
    const applyTier = (next: number) => {
      tier = Math.max(0, Math.min(TIERS.length - 1, next));
      FRAME_STEP = 1 / TIERS[tier].fps;
      const pr = pixelRatioFor(tier);
      if (Math.abs(renderer.getPixelRatio() - pr) > .01) {
        renderer.setPixelRatio(pr);
        composer.setPixelRatio(pr);
        pointMaterials.forEach(material => { material.uniforms.uPixel.value = Math.min(pr, 2.0); });
        resize();
      }
      windowStart = 0; windowFrames = 0; slowWindows = 0; fastWindows = 0;
    };
    applyTier(tier);
    // the budget is a pixel count, so a window resize can move the ratio too
    const reapply = () => applyTier(tier);
    addEventListener('resize', reapply);
    /* One window is 1.5 s of rendered frames, counted only while the frame is
       moving - an idle frame is held back on purpose and says nothing about the GPU.
       Two slow windows step down; it takes six fast ones to step back up, and a tier
       that has had to be abandoned twice is not tried again, so the governor cannot
       oscillate on a borderline GPU. */
    const govern = (now: number, active: boolean) => {
      if (!active) { windowStart = 0; return; }
      if (!windowStart) { windowStart = now; windowFrames = 0; return; }
      windowFrames++;
      const span = (now - windowStart) / 1000;
      if (span < 1.5) return;
      const achieved = windowFrames / span, target = TIERS[tier].fps;
      windowStart = now; windowFrames = 0;
      signals.perf.fps = achieved;
      if (achieved < target * .82) {
        fastWindows = 0;
        if (++slowWindows >= 2 && tier < TIERS.length - 1) { downgrades[tier]++; applyTier(tier + 1); }
      } else if (achieved > target * .96) {
        slowWindows = 0;
        if (++fastWindows >= 6 && tier > 0 && downgrades[tier - 1] < 2) applyTier(tier - 1);
      } else { slowWindows = 0; fastWindows = 0; }
    };

    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      if (!visible || pause.current) { last = now; windowStart = 0; return; }
      const tick = Math.min((now - last) / 1000, .05); last = now;
      stepPointer(now);

      /* A frame that arrives a hair early is still a frame. Without the tolerance a
         30Hz cadence beating against a 60Hz display drops below target, because some
         ticks land a millisecond short. */
      /* Moving means the page is scrolling or settling, the hand is moving, or the
         camera is diving into a card. Anything else is a still frame. */
      const moved = pointer.x !== lastPointerX || pointer.y !== lastPointerY;
      lastPointerX = pointer.x; lastPointerY = pointer.y;
      if (moved || Math.abs(driver.current.velocity) > .004 || Math.abs(current - driver.current.progress) > .0004
        || (zoom > .001 && zoom < .999) || signals.zen) lastActive = now;
      const active = now - lastActive < 700 || elapsed < 4;
      const step = active ? FRAME_STEP : Math.max(FRAME_STEP, 1 / IDLE_FPS);

      backlog += tick;
      if (backlog < step - .003) return;
      const dt = Math.min(backlog, .05);
      backlog = 0;
      elapsed += dt;
      govern(now, active);
      const drawStart = performance.now();

      const goal = driver.current.progress;
      current = reduced ? goal : THREE.MathUtils.damp(current, goal, 14, dt);
      ndc.set(pointer.x * 2 - 1, pointer.y * 2 - 1);
      if (!pointer.active || reduced) ndc.set(0, 0);
      smoothPointer.lerp(ndc, 1 - Math.exp(-dt * 2));

      /* "mobile" here means a narrow frame, which a tablet held upright also has:
         the shot distances below exist to keep the subject inside a tall viewport. */
      /* "mobile" here means a narrow frame, which a tablet held upright also has. */
      const scroll = current, mobile = width < 700 || width < height;

      /* ---------------------------------------------------------- the remap

         Everything below this line was timed against a document the original seven
         acts owned end to end. Three acts were inserted into the middle of it since,
         which moves every position after the bench - and there are around forty
         hand-set beat numbers downstream, each one composed against a frame.

         So the beats are not asked to move. `p` is the *original* timeline's
         position, reconstructed: the opening stretch is compressed into 0..HEAD_END,
         the closing stretch resumes at TAIL_AT, and in between - the three new acts -
         it simply holds at the seam. The legacy scene is faded out across that gap by
         `legacy`, and the new acts draw over the top of it. */
      const p = scroll <= HEAD_END
        ? scroll / HEAD_END * LEGACY_HEAD
        : scroll >= TAIL_AT
          ? LEGACY_TAIL_FROM + (scroll - TAIL_AT) / (1 - TAIL_AT) * LEGACY_TAIL_SPAN
          : LEGACY_HEAD;

      /* 1 while the original timeline owns the frame, 0 while the three new acts do.
         Every light, group and grade term the old acts drive is scaled by it, so the
         bench does not sit lit underneath a black room for a quarter of the piece. */
      /* The fall starts before the boundary, not at it.

         Killing the desk lamp alone did nothing visible, because the lamp is one of
         six things lighting that bench - the daylight pass, the environment, the
         stage light and the cyclorama are all still up. A blackout has to take the
         whole rig, so it is `legacy` itself that is switched off, a beat early and
         quickly. Everything the original seven acts drive is scaled by this, so one
         curve puts the entire room out at once. */
      const legacy = 1 - windowOpacity(scroll, HEAD_END - .020, TAIL_AT, .016);

      /* local progress for each of the three, 0..1 across its own runway */
      const lightAct = range(scroll, ACT_AT.light, ACT_AT.light + ACT_SPAN.light);
      /* Hoisted up here with the rest of the act windows rather than left beside the
         code that draws the act: the cast's visibility is decided several hundred lines
         earlier, and it needs to know whether the anamorph owns the frame. A const read
         before its declaration is a dead loop, not a warning. */
      const lostOn = windowOpacity(scroll, ACT_AT.bewilder, ACT_AT.bewilder + ACT_SPAN.bewilder, .022);
      const lostAct = range(scroll, ACT_AT.bewilder, ACT_AT.bewilder + ACT_SPAN.bewilder);
      const seaAct = range(scroll, ACT_AT.sea, ACT_AT.sea + ACT_SPAN.sea);
      const flyAct = range(scroll, ACT_AT.butterfly, ACT_AT.butterfly + ACT_SPAN.butterfly);
      const intro = reduced ? 1 : smooth(elapsed, .15, 2.6);
      const explode = 1 - Math.pow(1 - range(p, .135, .19), 2.7);
      const drop = smooth(p, .275, .355);
      const settle = smooth(p, .155, .245);
      // Let the gold read before the flare. The overhead hand-off now happens
      // beneath the longer flash instead of racing the kintsugi ignition.
      const top = smooth(p, .470, .502);
      const lab = smooth(p, .735, .752);
      // Square the camera up as soon as the fragments start returning home. It
      // holds through the rebuild, then releases inside the kintsugi flare.
      const front = smooth(p, .365, .397) * (1 - smooth(p, .478, .501));
      const arrive = smooth(p, .928, .966);     // the cast walks back into frame
      const boardIn = smooth(p, .950, .974);    // the set comes up out of the dark
      const walk = smooth(p, .968, .991);       // the cast takes the king's square
      const settled = smooth(p, .988, .998);    // in close, low, front on
      const stand = boardIn;
      const macro = settled;
      const writing = settled;
      /* and, before all of that, the cloud stops spelling and finds a shape */
      /* Measured against the DOM, not guessed: the manifesto section's own runway
         finishes at p .88, so the convergence has to resolve before that or the
         count in the page has nothing left to be lit inside. */
      // converge is tracked by the manifesto section's own runway at p .88
      // the bench does not slide into frame: it is already standing in the dark,
      // and the crane down plus the lamps coming up are what reveal it
      const desking = smooth(p, .2765, .2815) * (1 - smooth(p, .735, .756));
      // the one passage that runs in daylight needs the whole rig pulled down
      const daylight = smooth(p, .482, .510) * (1 - smooth(p, .672, .702));
      const seamHeat = windowOpacity(p, .427, .465, .007);

      /* the object: tilted and turning until gravity takes it, then flat, and in
         the last act it walks onto the board */
      /* a cast on a turntable: it eases into its turn rather than starting at
         speed, breathes very slightly as it goes, and picks up a tremor in the last
         moment before the crack, so the break is anticipated instead of sprung */
      const wake = reduced ? 1 : smooth(elapsed, .5, 3.6);
      const tremor = smooth(p, .108, .133) * (1 - smooth(p, .133, .142));
      spin += dt * (reduced ? 0 : .075) * wake * (1 - settle);
      spinner.rotation.y = spin * (1 - smooth(p, .15, .235));
      const drift = reduced ? 0 : (1 - settle);
      sculpture.rotation.set(
        (Math.sin(elapsed * .29) * .042 + Math.sin(elapsed * 61) * .006 * tremor) * drift,
        Math.sin(elapsed * .17) * .055 * drift,
        (Math.sin(elapsed * .23) * .03 + Math.sin(elapsed * 57) * .008 * tremor) * drift);
      sculpture.position.set(
        (mobile ? .05 : -.55) * (1 - smooth(p, .16, .27)),
        (mobile ? 0 : .1) * (1 - smooth(p, .16, .27)), 0);
      sculpture.scale.setScalar(THREE.MathUtils.lerp(mobile ? .78 : .94, 1, smooth(p, .16, .27)));
      if (front > 0) sculpture.rotation.y = THREE.MathUtils.lerp(sculpture.rotation.y, -Math.PI / 2, front);

      /* It does not simply appear for the last act. While the final passage of the
         manifesto is still burning off, the cast swings back into frame from the
         left, turning as it comes, and is already squared up by the time the board
         rises under it. */
      if (p > .925) {
        sculpture.position.set(
          THREE.MathUtils.lerp(mobile ? -8.5 : -11.5, 0, arrive),
          THREE.MathUtils.lerp(1.5, 0, arrive),
          THREE.MathUtils.lerp(-3.4, 0, arrive));
        sculpture.rotation.set(
          THREE.MathUtils.lerp(.16, 0, arrive),
          THREE.MathUtils.lerp(-Math.PI / 2 - 4.1, -Math.PI / 2, arrive),
          THREE.MathUtils.lerp(-.26, 0, arrive));
        sculpture.scale.setScalar(THREE.MathUtils.lerp(.58, 1, arrive));
      }
      if (walk > 0) {
        // an arc onto the square, then a small settle as it takes its weight
        const bounce = 1 - Math.abs(Math.sin(Math.min(1, walk) * Math.PI * 1.5)) * (1 - walk) * .06;
        tmp.copy(kingSeat);
        tmp.y += Math.sin(walk * Math.PI) * 1.35;
        sculpture.position.lerp(tmp, walk);
        sculpture.scale.setScalar(THREE.MathUtils.lerp(sculpture.scale.x, kingScale * bounce, walk));
      }
      // The repaired cast leaves inside the white frame. It must never survive
      // into the workbench shot after the flash has cleared.
      /* The solid cast must be gone the instant the burn clears. The `legacy` clause
         is what keeps it on screen through the three inserted acts, and at the far
         seam it was still true for a few frames after the white lifted - so the film
         burned away and revealed the same statue it had just destroyed. The far edge
         is pinned to the seam itself. */
      /* The cast itself is not in the bewilderment act. It cannot be: the fragments
         are a reconstruction of it, and a reconstruction standing next to the original
         has nothing to reconstruct. The one thing the reader is hunting for has to be
         the only place that figure exists. */
      /* The middle clause used to read `legacy < .996`, which is true from the very
         first frame of the legacy fade - and that fade *starts* at the end of the
         bench act. So the cast switched on while the workbench was still fully in
         frame and stood there over the cards, half lit, for the length of the
         hand-off. The cast belongs to the middle acts, so the test is whether a middle
         act is actually running, not whether the fade has begun. */
      const inMiddle = scroll > HEAD_END + .018 && scroll < TAIL_AT - .002;
      sculpture.visible = ((p < .486 || p > .925) || inMiddle) && lostOn < .02;

      const intact = p < .135 || p > .43;
      whole.visible = intact;
      /* The one thing on this site that scroll cannot buy. How much of the break is
         actually filled is a function of real seconds spent in front of the work, so
         a reader who drags the bar to the bottom arrives at a cast that is still
         mostly broken - and nothing anywhere tells them why. */
      /* The cast is introduced whole. Showing the repair before the break would
         hand the reader the end of the act in its first frame - and the page above it
         says WHOLE, which a set of gold cracks flatly contradicts. */
      seams.visible = intact;
      seamMaterial.opacity = 1.0;
      seamMaterial.transparent = false;
      seamHeatUniform.value = seamHeat;
      // cold metal is lit, not lit up; only the ignition puts light into it
      seamMaterial.emissiveIntensity = seamHeat * 7;
      seamMaterial.color.setHex(0xffc84a).lerp(SEAM_HOT, seamHeat);
      /* The reader's path, recorded. Act five resamples it to thirty points and the
         cloud converges on those, so the shape that resolves at the end of the piece
         is the one the person watching has been drawing all along. Nothing here
         touches the shards: they have a rebuild to be present for. */
      flock.step(p, dt, signals.px, signals.py, signals.grip);

      shards.forEach(({ mesh, home }, i) => {
        mesh.visible = !intact;
        if (p < .275) {
          sampleBaked('explosion', explode, i, pose);
          // the cloud keeps opening while it hangs, so the piece that swings past
          // the lens is leaving a group that is already drifting apart
          const drift = smooth(p, .19, .30) * .85;
          if (drift > 0) pose.position.addScaledVector(pose.position, drift * .34);
        }
        else {
          sampleBaked('drop', drop, i, pose);
          if (p > .365) {
            const r = smooth(p, .365 + (i % 7) * .002, .414 + (i % 7) * .002);
            pose.position.lerp(home, r);
            pose.position.y += Math.sin(r * Math.PI) * .42;
            pose.quaternion.slerp(zeroQuaternion, r);
          }
        }
        mesh.position.copy(pose.position);
        mesh.quaternion.copy(pose.quaternion);
        mesh.scale.setScalar(1);
      });

      /* The studio holds through act one and is gone before the cloud opens. It
         fades on the same curve the sculpture uses to leave its stand, so the set
         does not outlive the thing it was built to hold. */
      const inStudio = 1 - smooth(p, .105, .162);
      studio.visible = inStudio > .002 && legacy > .004;
      /* The cast is authored 3.5 tall about the origin, so it stands on -1.75 - but
         only at rest. The entrance scales and lifts it, so the block has to follow
         the base it is actually carrying rather than a number written down once. */
      const castBase = sculpture.position.y - 1.75 * sculpture.scale.y;
      pedestal.group.position.y = castBase + 1.75;
      cyc.mesh.visible = pedestal.group.visible = studio.visible;
      /* The rig below this was built for a black void, where nothing bounces and the
         subject has to be lit hard to exist at all. A white room bounces everything,
         so leaving that rig on and adding a studio on top is simply two rigs at once
         - which is the blow-out. The studio replaces it instead of joining it. */
      studioKey.intensity = intro * inStudio * 30;
      studioBounce.intensity = intro * inStudio * .34;
      studioHalo.intensity = intro * inStudio * 22;
      /* The paper keeps its own value. Darkening the material as well as the light
         was double-counting and turned the sweep to mud: the gradient across a
         cyclorama is the falloff of the key, never a darker paper. */
      (cyc.mesh.material as THREE.MeshStandardMaterial).color.setScalar(inStudio);
      pedestal.material.color.setScalar(inStudio * .94);

      /* the desk rises into frame with gravity and leaves again for the lab */
      deskGroup.visible = desking > .002 && legacy > .004;
      /* Gated by `legacy` like every other lamp in the original set. Without it the
         bench spotlight - which is the brightest thing in the piece at 26 units -
         stayed on right through the three new acts, and act five in particular was
         a fully lit statue with a small extra glow following the cursor. The whole
         argument of that act is that nothing is lit unless the reader lights it. */
      const deskLight = desking * (1 - lab) * legacy;
      deskGroup.position.y = 0;
      deskGroup.scale.setScalar(1);
      /* ------------------------------------- the bench goes out, and that is the cut

         The act after this one is a statue in total darkness that exists only where
         the reader points a light at it. So the transition into it is not a wipe or a
         dissolve laid over two shots - it is the practical in the first shot being
         switched off. The room the work was laid out in stops being lit, and what the
         reader is left holding is the only light there is.

         Tungsten does not stop, it dies. A filament at 3000K falling to nothing passes
         through orange and then through red on the way, and the last of it hangs for a
         moment after the switch. Those two terms - a fast fall and a slow ember behind
         it - are the whole effect, and they are the difference between a lamp going
         out and a number reaching zero. */
      const switchOff = smooth(scroll, HEAD_END - .020, HEAD_END - .006);
      /* the ember: a little of it hangs on after the rest of the room has gone */
      const filament = 1 + (1 - smooth(scroll, HEAD_END - .006, HEAD_END + .022)) * switchOff * 1.8;
      // and it reddens as it cools, which is what says filament rather than dimmer
      lampColour.setHex(0xffd9a4).lerp(TUNGSTEN_DYING, switchOff * .9);
      lamp.color.copy(lampColour);

      lamp.intensity = deskLight * (26 - daylight * 6) * filament;
      overheadFill.intensity = deskLight * 1.05 * filament;
      roomFill.intensity = deskLight * .72 * filament;
      stageLight.intensity = stand * 46;
      edgeBack.intensity = stand * 5.2;
      /* Both shadow casters are left on for the whole run, deliberately. Toggling
         castShadow changes how many shadow-casting lights the shader has to declare,
         so every program that receives them is recompiled and the shadow map is
         reallocated - a multi-frame stall, and the old code paid it again on every
         pass across the boundary. Two 1024 maps a frame is the cheaper trade. */
      (desk.material as THREE.MeshStandardMaterial).color.setScalar((.26 + deskLight * .42));
      (mat.material as THREE.MeshStandardMaterial).color.setScalar((.24 + deskLight * .5));
      // Bring the working instruments up inside the flare so the completed cut
      // reveals a populated desk instead of an empty intermediate frame.
      const boarding = windowOpacity(p, .476, .742, .017);
      props.visible = boarding > .002;
      workMaterials.forEach(material => { material.opacity = boarding; });
      sheet.mesh.visible = boarding > .002;
      (sheet.material as THREE.MeshStandardMaterial).opacity = boarding;
      (sheet.material as THREE.MeshStandardMaterial).transparent = true;
      cardGroup.visible = boarding > .002;
      cutter.position.y = -2.585 + (cutterHot ? .075 : 0);
      cutter.rotation.y = THREE.MathUtils.damp(cutter.rotation.y, cutterHot ? -.3 : -.45, 7, dt);
      cutter.rotation.z = THREE.MathUtils.damp(cutter.rotation.z, cutterHot ? .06 : 0, 7, dt);

      /* the manifesto cloud, and what it turns into

         Three lines are spelled out and burn off. Then the cloud goes looking for a
         shape and finds thirty places to stand, read out of the path the reader has
         been drawing since the first frame: the thing that resolves at the end of
         the act was being drawn by the person watching, the whole way, without ever
         being told. It rides the same crossfade the sentences use. */
      /* the manifesto cloud: spells out the three core phrases and then gracefully dissolves into stardust */
      const cloudVisible = windowOpacity(p, .735, .825, .016);
      cloud.visible = cloudVisible > 0 && legacy > .004;
      cloud.material.uniforms.uOpacity.value = cloudVisible;
      cloud.material.uniforms.uTime.value = reduced ? 0 : elapsed;
      cloud.material.uniforms.uPointer.value.copy(smoothPointer);
      cloud.material.uniforms.uBoost.value = lab;

      const target = cloud.geometry.getAttribute('aText') as THREE.BufferAttribute;
      const was = cloud.geometry.getAttribute('aWas') as THREE.BufferAttribute;
      const pi = Math.min(2, Math.max(0, Math.floor(range(p, .748, .812) * 3)));
      if (pi !== phrase) {
        (was.array as Float32Array).set(target.array as Float32Array);
        (target.array as Float32Array).set(texts[pi]);
        was.needsUpdate = target.needsUpdate = true;
        phraseBlend = phrase < 0 ? 1 : 0;
        phrase = pi;
      }
      phraseBlend = Math.min(1, phraseBlend + dt / 1.15);
      cloud.material.uniforms.uBlend.value = phraseBlend;
      cloud.material.uniforms.uMorph.value = smooth(p, .7355, .7515);
      cloud.scale.setScalar(mobile ? .63 : 1);
      cloud.position.set(0, .1, 0);



      /* ================================================== the three new acts

         All three hang off `legacy`: while it is 1 the original timeline owns the
         frame and none of this is drawn at all. */
      const newActs = 1 - legacy;

      if (newActs > .004) {
        /* The cast belongs to whichever of the three is running. It hangs, turning
           very slowly, and it is the same object in all of them - which is the point
           of the middle act and the reason the sea has anything to reflect. */
        sculpture.position.set(0, THREE.MathUtils.lerp(0, 1.15, seaAct > 0 ? 1 : 0), 0);
        sculpture.rotation.set(
          Math.sin(elapsed * .21) * .05,
          spin * .5 + Math.sin(elapsed * .13) * .12,
          Math.sin(elapsed * .17) * .04);
        sculpture.scale.setScalar(mobile ? .82 : 1);
        whole.visible = true;
        seams.visible = true;
        shards.forEach(({ mesh }) => { mesh.visible = false; });
      }

      /* ---------------------------------------------- ACT V: what the light makes

         The reader's cursor is the only source of existence in the frame. Everything
         else is off - not dimmed, off - because a fill light here would quietly
         contradict the one thing the act is saying. */
      const lit = windowOpacity(scroll, ACT_AT.light, ACT_AT.light + ACT_SPAN.light, .02);
      if (lit > .002) {
        /* the pointer, thrown onto a plane just in front of the cast, so moving the
           mouse moves a lamp through the room rather than sliding a spot across a
           picture of one */
        solePoint.set(smoothPointer.x * 5.4, smoothPointer.y * 3.6 + .4, 3.1);
        soleLag.lerp(solePoint, 1 - Math.exp(-dt * 5.5));

        soleLight.position.copy(solePoint);
        soleTrail.position.copy(soleLag);
        /* It opens as a pinhole and widens across the act. The last beat is the one
           that matters: at full width there is nothing left to find, because the
           light was what was making it. */
        const opening = lightAct;
        soleLight.intensity = lit * (26 + opening * 62) * (1 - Math.pow(opening, 3.4));
        soleTrail.intensity = soleLight.intensity * .32;
        soleLight.distance = 12 + opening * 26;
        soleTrail.distance = soleLight.distance * .8;
      } else {
        soleLight.intensity = soleTrail.intensity = 0;
      }

      /* ------------------------------------------------------ ACT VI: they disagree */
      /* ------------------------------------------------- ACT VIII: one for the light

         It runs over the sea, not after it: the gold lifts off a surface made of gold,
         which is the only reason two insects in a portfolio are not a non sequitur. */
      /* ------------------------------------------- ACT VII: one station only */
      lost.group.visible = lostOn > .002;
      lostKey.intensity = lostOn * 2.6;
      lostRim.intensity = lostOn * 1.5;
      const flyOn = windowOpacity(scroll, ACT_AT.butterfly - .012, ACT_AT.butterfly + ACT_SPAN.butterfly + .008, .022);
      const onTable = flyOn > .002;
      flight.group.visible = onTable;
      candle.group.visible = onTable;
      if (onTable) {
        /* The act is a table with a candle on it and the cast standing beside it -
           not two insects in a void, which is what it was. Everything in frame is lit
           by the flame and nothing else, so the table falls away into black about a
           foot from the wick and the whole thing is one small pool of light. */
        deskGroup.visible = true;
        deskGroup.position.set(0, 0, 0);
        const warm = .30 * flyOn;
        (desk.material as THREE.MeshStandardMaterial).color.setScalar(warm);
        (mat.material as THREE.MeshStandardMaterial).color.setScalar(warm * .8);
        (wall.material as THREE.MeshStandardMaterial).color.setScalar(warm * .34);
        props.visible = false;
        sheet.mesh.visible = false;
        cardGroup.visible = false;

        candle.group.position.set(1.15, -2.62, 1.35);
        candle.group.scale.setScalar(1);

        /* The cast is back on the bench for this one, repaired and at rest. It is what
           the gold is leaving, so it has to be in shot while it leaves. */
        sculpture.visible = true;
        sculpture.position.set(-1.35, -1.05, -.2);
        sculpture.rotation.set(0, -.55, 0);
        sculpture.scale.setScalar(.72);
        whole.visible = true;
        /* The cast goes bare while its repair is in the air.

           This is the line that makes the third one *the* gold rather than a gold
           butterfly: the seams fade out exactly as it forms, and fade back as the
           powder settles into them. If the cast kept its seams the whole way through,
           the insect would simply be a decoration that happened to be the same
           colour. */
        seams.visible = true;
        seamMaterial.transparent = false;
        seamMaterial.opacity = 1.0;

        candle.tip.getWorldPosition(flyLight);
        // the gold leaves from the seams, so that is where they start
        flySeam.copy(sculpture.position).add(tmp.set(.1, .5, .2));
        flight.step(dt, elapsed, flyAct, flySeam, flyLight, reduced);

        /* the flame takes when the second one reaches it */
        const flare = smooth(flyAct, .58, .74) * (1 - smooth(flyAct, .80, .95));
        candle.step(elapsed, flare, flyOn);
      } else {
        candle.light.intensity = 0;
        if (flyAct <= 0) flight.reset();
      }

      /* ------------------------------------------------------- ACT VII: the gold sea */
      const seaOn = windowOpacity(scroll, ACT_AT.sea, ACT_AT.sea + ACT_SPAN.sea, .022);
      sea.mesh.visible = seaOn > .002;
      seaKey.intensity = seaOn * 3.4;
      seaSky.intensity = seaOn * 1.5;
      /* The sky belongs to the sea alone. */
      const skyOn = seaOn;
      dome.mesh.visible = skyOn > .002;
      dome.material.opacity = skyOn;
      if (skyOn > .002) {
        dome.mesh.position.copy(camera.position);
      }
      /* and the same sky is the only thing lighting the cast through the middle */
      if (skyEnv && newActs > .004) {
        if (scene.environment !== skyEnv) scene.environment = skyEnv;
        scene.environmentIntensity = seaOn * 1.15 + lit * .06;
      } else if (scene.environment === skyEnv && skyEnv) {
        scene.environment = environment.texture;
      }
      if (sea.mesh.visible) {
        sea.material.uniforms.uTime.value = reduced ? 0 : elapsed;
        sea.material.uniforms.uOpacity.value = seaOn;
        /* The interactive field is held back at the very start so the first frame of
           the act is glass. If the reader arrives to a surface that is already moving
           they never learn that they are the one moving it. */
        const touch = smooth(seaAct, .06, .2);
        sea.material.uniforms.uTouch.value = touch;

        /* Where the pointer meets the water. Casting the real ray rather than mapping
           the cursor to the plane linearly is what makes the waves start under the
           cursor instead of near it - at this camera angle the difference is most of
           the screen. */
        raycaster.setFromCamera(ndc, camera);
        const press = raycaster.ray.intersectPlane(seaPlane, seaHit)
          ? seaPress.set(seaHit.x / RIPPLE_EXTENT + .5, seaHit.z / RIPPLE_EXTENT + .5)
          : null;
        const onSurface = press && press.x > 0 && press.x < 1 && press.y > 0 && press.y < 1;
        /* Force follows how fast the hand is travelling: resting the cursor leaves a
           slow dimple, dragging it cuts a wake. A constant force made every gesture
           feel the same, which is the fastest way to make an interaction feel dead. */
        const speed = onSurface ? Math.min(lastPress.distanceTo(press!) * 26, 1) : 0;
        if (onSurface) lastPress.copy(press!);
        /* Halved along with the gaussian above: a narrower dent needs less force to
           read, and the two together are the difference between a wake and a swell. */
        ripple.step(reduced ? 0 : dt, onSurface ? press : null, (.005 + speed * .022) * touch);
      }

      /* the board, and the square the cast is walking to */
      chess.group.visible = boardIn > .001 && legacy > .004;
      chess.group.position.y = THREE.MathUtils.lerp(-.62, 0, boardIn);
      chess.group.scale.setScalar(THREE.MathUtils.lerp(.965, 1, boardIn));
      chessMaterials.forEach(material => { material.opacity = boardIn; });
      (chess.boardMaterial as THREE.MeshStandardMaterial).color.setScalar(.15 + boardIn * .85);
      (chess.dark as THREE.MeshStandardMaterial).color.setHex(0x241a12);

      /* camera */
      const burst = windowOpacity(p, .15, .275, .02);
      shot.set(
        smoothPointer.x * (.2 + burst * 1.05),
        smoothPointer.y * (.12 + burst * .55),
        /* Act one is shot close. The cast at 9.3 units was a small object in a large
           empty room; halving the distance doubles it in frame and lets the sweep act
           as a ground rather than as the subject. The pull releases as the fracture
           opens, so every later shot keeps the distance it was composed at. */
        THREE.MathUtils.lerp((mobile ? 10.2 : 8.4), (mobile ? 5.5 : 4.35), inStudio)
          + smooth(p, .1, .19) * 1.6);

      /* The opening frame is taken from below eye level, looking up.

         A statue photographed from its own height is an object on a table. Drop the
         lens under the chin and tilt it up and the same geometry reads as something
         you are standing in front of - the pedestal gets tall, the jaw and the brow
         carry the silhouette, and the sweep behind it becomes sky rather than
         backdrop. It is the oldest trick in monument photography and it costs two
         numbers.

         Both are tied to inStudio, so the angle releases on exactly the beat the
         studio does and every later shot keeps the framing it was composed at. */
      shot.y -= 1.28 * inStudio;
      shot.z -= .35 * inStudio;
      // the table shot for the fall, then the drafting shot for the work
      /* A match cut is a cut, not a move: the camera changes on the single beat the
         passing shard has the lens covered. The cover runs .248 to .308, so it is
         centred at .278 - not the .275 the old window implied. Spreading the change
         over .034 meant most of it happened while the frame was half covered, which
         is what read as a glitch. */
      const table = smooth(p, .2752, .2808);
      shot.lerp(tmp.set(.7, 4.5, 8.4), table);
      shot.lerp(tmp.set(0, 5.9, 7.1), top);
      shot.lerp(tmp.set(0, 0, mobile ? 12.5 : 11.4), lab);
      // the repaired cast is looked at square on, at eye level, before the whiteout
      shot.lerp(tmp.set(0, .05, mobile ? 10.4 : 8.4), front);
      /* and the tilt: the look-at rides up the cast as the camera drops under it,
         which is what turns a low camera into a low *angle* rather than a low shot
         of the pedestal. */
      look.set(0, .62 * inStudio, 0);
      look.lerp(tmp.set(0, -2.15, 0), table);
      look.lerp(tmp.set(0, -2.5, .1), top);
      look.lerp(tmp.set(0, 0, 0), lab);
      look.lerp(tmp.set(0, 0, 0), front);
      // then the board: a wide look down the set, and finally low and close on the king
      shot.lerp(tmp.set(1.1, 1.5, mobile ? 14.5 : 11.6), boardIn);
      shot.lerp(tmp.set(kingSeat.x * .5, BOARD.top + 1.15, kingSeat.z + (mobile ? 6.2 : 4.9)), settled);
      look.lerp(tmp.set(0, BOARD.top + .1, -.6), boardIn);
      look.lerp(tmp.set(kingSeat.x, BOARD.top + .95, kingSeat.z - .1), settled);
      up.set(0, 1, 0);

      /* --------------------------------------------- the three new acts' shots

         Each is blended in over the legacy framing by its own window, so the change
         happens on the same beat the act does and nothing has to be cut. */
      if (lit > .002) {
        /* Straight on and close. The frame does not move at all during this act: the
           only thing travelling is the light, and a camera move would steal the
           authorship of what gets seen away from the hand holding it. */
        tmp.set(0, .2, mobile ? 9.6 : 7.4);
        shot.lerp(tmp, lit);
        look.lerp(tmp.set(0, .1, 0), lit);
      }
      /* This sits with the other inserted acts, after the original timeline has had
         its say about the camera - and that is not tidiness.

         Through the middle of the piece the legacy progress is pinned at .726, which
         means every one of the old camera lerps evaluates at full strength every frame:
         `top` is 1, so the shot is dragged to the overhead bench position no matter
         what was written before it. The first cut of this act set its camera earlier in
         the frame and was quietly overwritten, so the anamorph was being judged from a
         viewpoint six units above the one the reader appeared to be at, and it reported
         zero alignment from everywhere. */
      if (lost.group.visible) {
        /* The camera sweeps past the station rather than sitting on it. Scroll carries
           it across the arc and the pointer steers within that - so the reader can be
           carried past the answer, notice, and come back for it. Handing them the
           station outright would be a picture of a valley rather than a valley. */
        const sweep = (lostAct - .52) * 1.9 - smoothPointer.x * .34;
        const radius = 9.8 - smooth(lostAct, .1, .9) * 1.2;
        lostShot.set(
          Math.sin(sweep) * radius + 2.6 * Math.cos(sweep),
          .55 + smoothPointer.y * .5,
          Math.cos(sweep) * radius);
        shot.lerp(lostShot, lostOn);
        look.lerp(tmp.copy(lost.sweetLook), lostOn);
      }


      if (flyOn > .002) {
        /* Low, close, and on the far side of the candle so the flame is between the
           lens and the cast - a candle shot from above is a bright disc, and shot from
           its own height it is a light source with a room behind it. The push is very
           slight: at this scale a large move would lose the flame off the frame. */
        const near = smooth(flyAct, .1, .95);
        tmp.set(
          .1 + smoothPointer.x * .45,
          -1.35 + smoothPointer.y * .3,
          THREE.MathUtils.lerp(mobile ? 9.6 : 7.4, mobile ? 7.6 : 5.9, near));
        shot.lerp(tmp, flyOn);
        look.lerp(tmp.set(.05, -1.72, .2), flyOn);
      }

      if (seaOn > .002) {
        /* Low, near the water. A high camera turns a sea into a texture; keeping the
           lens just above the surface is what puts the horizon in the frame and gives
           the reflection somewhere to live. */
        tmp.set(smoothPointer.x * .8, -1.15 + smoothPointer.y * .35, mobile ? 12.6 : 10.2);
        shot.lerp(tmp, seaOn);
        look.lerp(tmp.set(0, .35, 0), seaOn);
      }

      /* Dive through the printed card instead of merely inspecting it. The last
         20% deliberately pushes past its edges, leaving a dark frame that matches
         the live project surface when the portal takes over. */
      zoom = THREE.MathUtils.damp(zoom, focusRef.current >= 0 ? 1 : 0, 4.8, dt);
      if (zoom > .001 && cards[Math.max(0, focusRef.current)]) {
        const card = cards[Math.max(0, focusRef.current)];
        cardUp.set(0, 0, -1).applyQuaternion(card.holder.quaternion);
        tmp.copy(card.holder.position).setY(card.holder.position.y + 1.02 * card.scale);
        tmp.add(deskGroup.position);
        shot.lerp(tmp, zoom);
        tmp.copy(card.holder.position).add(deskGroup.position);
        look.lerp(tmp, zoom);
        up.lerp(cardUp, zoom).normalize();
      }

      camera.position.copy(shot);
      camera.up.copy(up);
      camera.lookAt(look);
      camera.updateMatrixWorld(true);

      /* The anamorph is stepped after the camera has been placed, because the only
         input it has is where the camera ended up. Reading alignment before the move
         would answer for the previous frame - a whole frame of lag on the one signal
         the reader is hunting for, which at this sensitivity is visible as the figure
         lagging behind the hand. */
      if (lost.group.visible) {
        /* Eased hard. A linear response makes the figure hover half-assembled across a
           wide band, which reads as a cloud that is always slightly wrong; a steep one
           keeps it noise until the reader is nearly there and then delivers it. */
        const raw = lost.alignment(camera);
        const wanted = raw * raw * raw;
        lostResolve = reduced ? wanted : THREE.MathUtils.damp(lostResolve, wanted, 9, dt);
        lost.step(elapsed, lostResolve, lostOn, reduced);
        signals.aligned = lostResolve;
      } else if (signals.aligned !== 0) signals.aligned = 0;
      scenePass.setCamera(camera);
      ao.setCamera(camera);
      dof.setCamera(camera);
      /* Defocus has to be taken off the manifesto entirely, and the reason is not
         taste. The cloud is a THREE.Points with depthWrite:false, so it puts nothing
         in the depth buffer - and the defocus pass reads that buffer. Every particle
         pixel therefore carries the depth of the empty background behind it, which is
         at the far plane, which is the maximum circle of confusion the pass can
         produce. The result was eleven thousand points of a legible sentence smeared
         into two grey bars. There is nothing else in frame during that act for the
         lens to be doing anything about, so the aperture simply closes. */
      /* Defocus comes off for the two acts whose subject is not at the focus plane.

         The manifesto because its particles write no depth (see below), and the
         The sea keeps a little, because there the far water genuinely should fall
         off. */
      const wantDist = camera.position.distanceTo(look);
      const wantAperture = reduced ? 0 : (mobile ? .008 : .013) * (1 - zoom * .38) * (1 - lab) * (1 - seaOn * .45) * (1 - flyOn * .86) * (1 - lostOn * .95);
      dof.enabled = wantAperture > 0.0005 && !zenApplied;
      dof.setFocus(wantDist, wantAperture);

      /* The cut on a passing object.

         Rather than dissolving the bench in, one shard drifts out of the frozen
         cloud, turns, and passes right across the lens. It fills the frame for a
         handful of frames, the bench and its lights come up behind it while it is
         covering, and it carries on out of shot: the change happens inside the
         object's own movement, which is how it is done on a camera. */
      /* The cover has to outlast the camera move it is hiding. `table` runs .262 to
         .296, so a cover that ends at .292 uncovers the last of the cut. */
      const wipe = range(p, .248, .308);
      if (wipe > .001 && wipe < .999 && shards[wipeIndex]) {
        const shard = shards[wipeIndex].mesh;
        camera.getWorldDirection(forward);
        sideward.crossVectors(forward, camera.up).normalize();

        /* How much of the pass is spent covering: 0 as the piece leaves the cloud,
           1 across the middle, 0 again as it rejoins. */
        const grip = smooth(wipe, .02, .22) * (1 - smooth(wipe, .78, .98));

        /* Distance is derived, not chosen. The piece has to subtend more than the
           frame does, which wants it close - but the moment the camera crosses its
           bounding sphere we are inside the mesh looking at culled back faces, and it
           vanishes instead of covering. That is what the first attempt at this did.
           Sit just outside the sphere instead. 1.06 R rather than the 1.84 R that
           bare angular coverage implies, because the sphere is conservative: the mesh
           is a Voronoi cell, not a ball, so its silhouette leaves corners of the
           frame open at any distance that respects the sphere honestly. */
        const coverScale = 1 + grip * 1.6;
        const coverRadius = widest * coverScale;
        // a slower sweep so the piece dwells over the lens through the whole cut
        const swing = (wipe - .5) * 2.5;
        coverPoint.copy(camera.position)
          .addScaledVector(forward, Math.max(camera.near + 0.38, coverRadius * 1.2) + Math.abs(wipe - .5) * 1.6)
          .addScaledVector(sideward, swing)
          .addScaledVector(camera.up, -.09);
        spinner.worldToLocal(coverPoint);

        shard.position.lerp(coverPoint, grip);
        shard.scale.setScalar(coverScale);
        /* At p = .275 the baked pose underneath this shard swaps from the explosion
           solve to the drop solve. The position lerp reaches coverPoint exactly at
           full grip so that jump is hidden, but a partial slerp left 52% of the
           rotation discontinuity showing - a visible snap on the one shard that is
           filling the lens. Take the rotation the whole way at the peak too. */
        wipeQuaternion.setFromAxisAngle(wipeAxis, .24 + wipe * .38);
        shard.quaternion.slerp(wipeQuaternion, grip);
        shard.visible = true;
      }

      /* what the pointer is over on the table */
      const board = p > .498 && p < .642 && focusRef.current < 0 && cardGroup.visible;
      const found = board ? pick() : -1;
      if (found !== hovered) {
        hovered = found;
        pointer.scene = found >= 0 ? 1 : 0;
        hoverCb.current?.(found);
        if (found >= 0) dispatchEvent(new Event('card-hover'));
      }
      cards.forEach((card, i) => {
        const want = i === hovered ? 1 : 0;
        card.lift = THREE.MathUtils.damp(card.lift, want, 8, dt);
        const t = card.lift;

        // Keep internal card geometry face-up and rock-solid
        card.built.group.rotation.set(-Math.PI / 2, 0, 0);

        // 1. Dynamic architectural lift with subtle weightless float
        const floatY = t > 0.04 ? Math.sin(elapsed * 2.4 + i * 1.1) * 0.02 * t : 0;
        card.holder.position.y = card.base.y + t * 0.58 + floatY;

        // 2. Inspection tilt: tilts card up toward viewer's eye line for crystal-clear legibility
        const inspectPitch = -t * 0.32;

        // 3. Gyroscopic 3D parallax: tilts smoothly following pointer coordinates
        const pointerTiltX = i === hovered ? (ndc.y + 0.1) * 0.12 * t : 0;
        const pointerTiltZ = i === hovered ? -(ndc.x - card.base.x * 0.18) * 0.14 * t : 0;

        card.holder.rotation.x = inspectPitch + pointerTiltX;
        card.holder.rotation.z = pointerTiltZ;

        // 4. Elegant scale accent
        card.holder.scale.setScalar(card.scale * (1 + t * 0.06));
      });

      if (board) {
        raycaster.setFromCamera(ndc, camera);
        const hot = raycaster.intersectObject(cutter, true).length > 0;
        if (hot && !cutterHot) dispatchEvent(new Event('cutter-hover'));
        cutterHot = hot;
      } else cutterHot = false;

      /* light and grade follow the act */
      // how much of the dark-theatre rig survives; almost none of it inside the studio
      const theatre = (1 - inStudio * .86) * legacy;
      key.intensity = intro * (3.4 - deskLight * 1.1 - stand * 2.2) * theatre;
      rim.intensity = intro * (2.6 - deskLight * .6 + stand * 1.2) * theatre;
      goldBackKicker.intensity = intro * 2.8 * theatre;
      /* Some flat ambient stays: it is standing in for the bounce a real white room
         would give back, which there is no global illumination here to provide. */
      ambient.intensity = (.35 + deskLight * .5 - stand * .3) * theatre + inStudio * .15;
      ember.intensity = intro * (2.1 + seamHeat * 16 - lab * 1.5) * theatre;
      /* The board is the one shot that should be lit by a single source falling off
         into black. fill and edge were the only two lamps that never noticed the act
         had changed - they stayed at full to the end and lifted the whole frame off
         the floor, which is what took the drama out of it. */
      fill.intensity = intro * (1.15 - deskLight * .5) * theatre * (1 - stand * .82);
      edge.intensity = intro * (2.9 - deskLight * 2.1) * theatre * (1 - stand * .74);
      // a quarter unit of parallax, enough to feel alive, too little to read as a light being moved
      ember.position.set(4.6 + smoothPointer.x * .26, .4 + smoothPointer.y * .2 - lab * 1.5, -3.2);
      /* Gated by `legacy` with everything else it lights. The middle three acts
         each bring their own answer to where light comes from - one lamp, nine
         one sky - and an ambient environment sitting under all of them would
         quietly contradict the first of those, which is the one act whose entire
         argument is that nothing is lit unless the reader lights it. */
      scene.environmentIntensity = (1.35 - lab * .8 - deskLight * .35 - daylight * .35) * (1 - inStudio * .55) * legacy;
      /* The sweep stands eleven units back, so the theatre's near-black fog was
         dragging the whole wall toward #100904 - the mud no amount of lighting was
         going to lift. In the studio the air is paper coloured and thin. */
      (scene.fog as THREE.FogExp2).density = (.019 + lab * .02 - deskLight * .012) * (1 - inStudio * .82) * legacy;
      (scene.fog as THREE.FogExp2).color.copy(FOG_DARK)
        .lerp(FOG_ROOM, deskLight).lerp(FOG_PAPER, inStudio);
      GROUND_BG.copy(GROUND).lerp(FOG_PAPER, inStudio);

      (wall.material as THREE.MeshStandardMaterial).color.setScalar((.2 + deskLight * .42));

      const bu = backdropMaterial.uniforms;
      bu.uCentre.value.set(
        .42 + top * .1 - boardIn * .12 + smoothPointer.x * .04,
        .5 + top * .06 + smoothPointer.y * .035);
      bu.uWarm.value.copy(warmA).lerp(warmB, deskLight);
      /* Gated by `legacy` with the rest of the original set. It is a dark radial plate
         that sits behind the cast to give the theatre a floor, and every term feeding
         it happened to be at rest through the middle three acts - so it stayed at full
         strength and printed a dark polygon across the sky it was meant to
         be reflecting. */
      bu.uAmount.value = (1 - lab * .86) * intro * (1 - macro * .45) * (1 - deskLight * .5) * (1 - inStudio) * legacy;

      /* At 1.02 the threshold sat below the luma of lit plaster, so the whole cast
         passed the bright test and got a blurred copy of itself laid back on top -
         the film over everything. Only specular hits, the gold and the lamps should
         bloom, and those live well above 1. */
      /* Assigned, never incremented - and turned off rather than up for the wireframe.

         Bloom was what made the gold lines magenta. A wireframe is thousands of
         one-pixel highlights, every one of them over the bright threshold, so the pass
         had something to bloom on almost every pixel; the halos overlapped, clipped,
         and the hue went where clipped warm highlights go. The lines carry their own
         light already. They do not need help.


         `glow.strength` is a setter with no getter - reading it gives undefined, so
         `glow.strength += x` evaluates undefined + x, writes NaN into the bloom
         uniform, and NaN propagates through the composite until the entire frame is
         black. It cost an afternoon. Every term this needs goes in the one expression,
         including the zen boost: gold hairlines on black alias into nothing without a
         little bloom, and bloom is what makes a wireframe read as light rather than as
         a diagram. */
      /* Back to where it was, and the reason is worth keeping.

         Halving this and lifting the threshold did clean the image up and it did save
         a bright pass - and it also took most of the warmth out of the piece. The bloom
         was not sitting on top of the lighting here; it *was* a good part of the
         lighting, and the frames without it read as flat and cold rather than as
         sharper. The savings that mattered were elsewhere: the frame rate, the shadow
         passes and the baked noise field are all worth more than this was, and none of
         them costs a look. */
      glow.strength = (.3 + seamHeat * 1.1 + writing * .32 + lab * .14 - daylight * .18)
        * (1 - zenAmount * .92);
      /* And the bloom comes up off the floor for the same act. The particles are
         additive, so a stroke two points deep already clears the standing threshold
         and every letter grows a halo into the letter beside it. Only the brightest
         cores should carry light here, not the whole sentence. */
      glow.threshold = 1.85 + daylight * .5 + lab * .9;
      /* The vignette used to *deepen* for the manifesto, which crushed both ends of a
         sentence that runs nearly the full width of the frame. It opens up instead. */
      grade.material.uniforms.uVignette.value = .6 - deskLight * .22 - lab * .16 + daylight * .3 - inStudio * .46 - seaOn * .34 + stand * .16;
      /* The sea act is the only one lit by a sky rather than by lamps, so it gets
         the neutral grade the daylight passages get. Left on the warm shadow tint it
         came out the same brown as the dark theatre and the sky read as a smudge. */
      grade.material.uniforms.uNeutral.value = Math.max(inStudio * .9, seaOn * .8);
      /* Chromatic aberration comes off for the manifesto too, and for a reason that
         only shows up on this act. The pass fetches red and blue at opposite offsets
         scaled by distance from centre; on a solid edge that reads as a lens. On a
         sentence built from two-pixel points of light it separates every stroke into
         a red copy and a blue copy with nothing in between, and the whole statement
         comes out magenta - a colour that is nowhere in this palette. */
      grade.material.uniforms.uChroma.value = .0021 * (1 - lab * .92);
      // Hold on the illuminated seams for a clear beat, then use the longer
      // optical flare to cover the sculpture exit and workbench camera hand-off.
      grade.material.uniforms.uLift.value = windowOpacity(p, .460, .500, .008) * 2.3
        + windowOpacity(p, .731, .746, .003) * 2.9;


      /* ------------------------------------------------- the film burns through

         It sits on the seam between the gold sea and the cloud, and it is the only
         cut in the piece that admits to being a cut. Everything else hands off inside
         a move - a shard crossing the lens, a flare, a camera that simply keeps going.
         This one stops the film.

         Out is fast and in is slower: film goes up quickly once it is alight, and the
         return is authored rather than physical. The peak is held for a beat at the
         top, and that beat is where the sea is gone and the cloud is not there yet. */
      /* The cut waits for the powder.

         It used to start thirty thousandths before the seam, which on this runway is
         most of the way through the return - so the film burned away while the gold
         was still crossing the table and the act ended on its own middle. Nothing goes
         until the cast has its seams back. */
      const burnOut = smooth(scroll, TAIL_AT - .011, TAIL_AT + .003);
      /* The white does not burn back in - it dissolves off the front of the act
         behind it, which is both shorter and what an empty gate actually looks like. */
      const burnClear = smooth(scroll, TAIL_AT + .005, TAIL_AT + .030);
      burn.enabled = burnOut > .002 && burnClear < .998;
      if (burn.enabled) {
        burn.material.uniforms.uAmount.value = burnOut;
        burn.material.uniforms.uClear.value = burnClear;
        burn.material.uniforms.uTime.value = elapsed;
        burn.material.uniforms.uAspect.value = width / Math.max(height, 1);
      }

      /* motion blur: the reprojection handles the camera, this is the scroll smear */
      const flick = THREE.MathUtils.clamp(driver.current.velocity, -3.6, 3.6);
      scenePass.setGlobalVelocity(0, reduced ? 0 : flick * .0028);
      scenePass.setShutter(reduced ? 0 : .40 + Math.min(Math.abs(flick) * .08, .30));

      renderer.toneMappingExposure = 1.05 - deskLight * .26 - daylight * .18 + inStudio * .12;
      /* hand the cursor the vertices nearest to it, keeping each bracket on the
         vertex it already holds for as long as that vertex stays in range */
      if (pointer.active && !reduced) {
        scene.updateMatrixWorld();
        const pool = sculpture.visible
          ? (whole.visible ? castTracks : shardTracks)
          : (cardGroup.visible ? cardTracks : null);
        const aspect = width / height;
        if (!pool) {
          for (let i = 0; i < TRACKS; i++) pointer.tracks[i * 3 + 2] *= .84;
        } else {
          screenX.length = 0; screenY.length = 0; screenD.length = 0;
          for (const item of pool) {
            projected.copy(item.local).applyMatrix4(item.owner.matrixWorld).project(camera);
            if (projected.z < -1 || projected.z > 1) { screenD.push(99); screenX.push(0); screenY.push(0); continue; }
            const x = projected.x * .5 + .5, y = projected.y * .5 + .5;
            screenX.push(x); screenY.push(y);
            screenD.push(Math.hypot((x - pointer.x) * aspect, y - pointer.y));
          }

          taken.clear();
          for (let slot = 0; slot < TRACKS; slot++) {
            const held = trackSlots[slot];
            if (held >= 0 && screenD[held] < .33 && !taken.has(held)) { taken.add(held); continue; }
            trackSlots[slot] = -1;
          }
          for (let slot = 0; slot < TRACKS; slot++) {
            if (trackSlots[slot] >= 0) continue;
            let best = -1, bestDistance = .30;
            for (let i = 0; i < screenD.length; i++) {
              if (screenD[i] > bestDistance || screenD[i] < .028 || taken.has(i)) continue;
              // keep the brackets apart so they never stack on one another
              let clash = false;
              for (let other = 0; other < TRACKS; other++) {
                const j = trackSlots[other];
                if (j < 0) continue;
                if (Math.hypot((screenX[i] - screenX[j]) * aspect, screenY[i] - screenY[j]) < .07) { clash = true; break; }
              }
              if (clash) continue;
              best = i; bestDistance = screenD[i];
            }
            if (best >= 0) { trackSlots[slot] = best; taken.add(best); }
          }
          for (let slot = 0; slot < TRACKS; slot++) {
            const i = trackSlots[slot], base = slot * 3;
            if (i < 0) { pointer.tracks[base + 2] *= .84; continue; }
            pointer.tracks[base] = screenX[i];
            pointer.tracks[base + 1] = screenY[i];
            const want = Math.min(1, 1 - screenD[i] / .34);
            pointer.tracks[base + 2] += (want - pointer.tracks[base + 2]) * .16;
          }
        }
      } else {
        for (let i = 0; i < TRACKS; i++) pointer.tracks[i * 3 + 2] *= .84;
      }

      /* Held, not toggled, and eased so it opens rather than snaps. A hard cut to
         wireframe reads as a rendering fault; a quarter second of it arriving reads as
         a layer being lifted off. */
      zenAmount = THREE.MathUtils.damp(zenAmount, signals.zen, 11, dt);
      const zenOn = zenAmount > .35;
      if (zenOn !== zenApplied) { zenApplied = zenOn; setZen(zenOn); }
      /* Occlusion has nothing to say about a wireframe - every line is a depth
         discontinuity, so the pass shades the whole thing solid - and the paper sweep
         behind the studio would print the gold as black on white. Both stand down. */
      /* Occlusion and the grade both stand down. Occlusion has nothing to say about a
         wireframe - every line is a depth discontinuity, so it shades the whole thing
         solid - and the grade is a cinematic curve with a cool shadow tint that, over
         a frame which is black except for one-pixel warm lines, dragged the entire
         thing magenta. This state is not a photograph of a room. It is the arithmetic
         underneath, and it is shown unprocessed. */
      (ao as unknown as { enabled: boolean }).enabled = !zenOn && seaOn < 0.4 && lab < 0.4;
      (grade as unknown as { enabled: boolean }).enabled = !zenOn;
      if (zenOn) (scene.background as THREE.Color).setHex(0x07040f);

      /* And the lens opens all the way. There is nothing here for depth of field to
         say - a diagram has no focal plane - and a hairline is the one thing defocus
         destroys completely rather than softening. */
      if (zenOn) { dof.setFocus(camera.position.distanceTo(look), 0); dof.enabled = false; }

      /* One map per lamp that is doing something, and none for the rest. */
      for (const light of casters) light.shadow.needsUpdate = light.intensity > .01 && (active || (frame & 63) === 0);

      finish.sync(width / height, elapsed);
      composer.render();
      /* CPU time of the frame, for the ?perf panel. The GPU half is not measurable
         from here without a timer query, which most browsers no longer expose. */
      drawMs += (performance.now() - drawStart - drawMs) * .1;
      signals.perf.ms = drawMs;
      signals.perf.tier = tier;
      signals.perf.pr = renderer.getPixelRatio();
      signals.perf.pixels = width * height * signals.perf.pr * signals.perf.pr;
      signals.perf.idle = !active;
    };

    /* Compile every program before the curtain opens.

       A material compiles its shader the first frame it is actually drawn, and that
       compile is synchronous on the main thread. In a piece that is nothing but
       transitions, the first frame of each act is precisely where it lands - which is
       why the stutter was always on a cut and never in the middle of one.

       This list was four groups when there were seven acts. It is now everything the
       timeline will ever reveal: the bench and the board, the panes, the sea and its
       sky, the anamorph, the butterflies, the candle, the cloud. All of it is switched
       on for one compile pass behind the preloader and switched straight back off, and
       the draw loop rewrites every one of these flags on its next frame anyway.

       The two post passes that are toggled rather than always on get the same
       treatment - a disabled pass has never compiled, so the film burn was a stall of
       its own at the one moment in the piece that must not stutter. */
    const warmUp = [
      deskGroup, props, cardGroup, chess.group,
      sea.mesh, dome.mesh,
      lost.group, flight.group, candle.group, cloud,
      whole, seams, studio, pedestal.group, cyc.mesh, wall.mesh,
      ...shards.map(s => s.mesh),
    ].filter(Boolean) as THREE.Object3D[];
    const warmWas = warmUp.map(o => o.visible);
    warmUp.forEach(o => { o.visible = true; });
    burn.enabled = true;
    burn.material.uniforms.uAmount.value = .5;

    // Warm-up full frame through composer and shadow maps so all shaders precompile
    try {
      for (const light of casters) light.shadow.needsUpdate = true;
      composer.render();
    } catch { }

    warmUp.forEach((o, i) => { o.visible = warmWas[i]; });
    burn.enabled = false;
    burn.material.uniforms.uAmount.value = 0;

    frame = requestAnimationFrame(draw);
    ready.current();

    const visibility = () => { visible = !document.hidden; last = performance.now(); };
    document.addEventListener('visibilitychange', visibility);
    // a lost context leaves a dead canvas: stop drawing into it and give the cursor back
    const onContextLost = (e: Event) => {
      e.preventDefault();
      cancelAnimationFrame(frame);
      restoreCursor();
      setFailed('webgl');
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);

    return () => {
      disposed = true;
      clearTimeout(skyTimer);
      cancelSky();
      skyEnv?.dispose(); skyEquirect?.dispose();
      cancelAnimationFrame(frame);
      restoreCursor();
      observer.disconnect();
      document.removeEventListener('visibilitychange', visibility);
      removeEventListener('resize', reapply);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('click', onClick);
      scene.traverse(o => {
        const meshObj = o as THREE.Mesh;
        if (meshObj.isMesh || (o as THREE.Points).isPoints) {
          meshObj.geometry?.dispose();
          (Array.isArray(meshObj.material) ? meshObj.material : [meshObj.material]).forEach(m => m?.dispose());
        }
      });
      ao.dispose(); dof.dispose();
      baked.dispose();
      cyc.map.dispose(); pedestal.map.dispose();
      [...mat.maps, desk.map, desk.roughnessMap, sheet.map, wall.map, ...cards.flatMap(c => c.built.maps)].forEach(t => t.dispose());
      environment.dispose();
      scenePass.dispose(); grade.dispose(); finish.dispose();
      flight.dispose();
      lost.dispose();
      candle.dispose();
      ripple.dispose();
      casters.forEach(light => light.shadow.map?.dispose());
      buffer.dispose();
      zenWire.dispose();
      glow.dispose(); burn.dispose(); output.dispose(); fxaa.dispose(); composer.dispose();
      renderer.dispose(); renderer.domElement.remove();
    };
  }

  const buildRef = useRef(build);
  useEffect(() => {
    buildRef.current = build;
  });

  useEffect(() => {
    let teardown: (() => void) | null = null;
    let cancelled = false;

    void (async () => {
      try {
        /* The cast, the bake and the faces the canvases are drawn in all arrive
           together. The cards and the point-cloud lines are rasterised from those
           fonts at build time, so drawing them before the faces land prints them in
           the fallback and they never recover. */
        const [response, noiseRes, shardsRes] = await Promise.all([
          fetch(SCULPTURE.url),
          fetch('/plaster-noise.bin').catch(() => null),
          fetch('/shards-baked.bin').catch(() => null),
          loadBaked().catch(e => { console.warn('[physics] load caught', e); }),
          Promise.all(['600 88px Geist', '600 64px Geist', '400 30px Geist', '600 26px "Geist Mono"']
            .map(face => document.fonts?.load(face))).catch(() => { }),
        ]);
        if (!response.ok) throw new Error(`Sculpture request failed: ${response.status}`);
        const source = await response.arrayBuffer();
        const noiseData = noiseRes && 'ok' in noiseRes && noiseRes.ok ? new Uint8Array(await (noiseRes as Response).arrayBuffer()) : null;
        const shardsData = shardsRes && 'ok' in shardsRes && shardsRes.ok ? await (shardsRes as Response).arrayBuffer() : null;
        if (!cancelled) teardown = buildRef.current(source, noiseData, shardsData);
      } catch (error) {
        /* Swallowing this is what made the scene impossible to debug from the page:
           the only symptom was a stalled preloader and a sentence about drivers. */
        console.error('[sculpture] scene failed to build', error);
        if (!cancelled) {
          setFailed('error');
          ready.current();
        }
      }
    })();

    return () => {
      cancelled = true;
      teardown?.();
    };
  }, []);

  return (
    <figure id="gl-canvas" ref={mount}>
      <figcaption className="sr-only">A plaster cast turns, fractures, and falls onto a cutting mat, where it is rebuilt in gold. Selected work is laid out on the bench. The cast then comes apart into eleven thousand particles, which converge into thirty.</figcaption>
      {failed === 'webgl' && <p className="gl-fallback">This piece is real-time WebGL. Enable hardware acceleration to see it; the writing below stands on its own.</p>}
      {failed === 'error' && <p className="gl-fallback">The scene did not build. The console has the reason; the writing below stands on its own.</p>}
    </figure>
  );
}
