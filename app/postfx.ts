/* Post chain for the whole experience.

   ScenePass    renders the scene into an HDR target that carries a depth texture,
                then resolves it through a real per-pixel motion blur: world
                position is rebuilt from depth, reprojected with the previous
                frame's view-projection matrix, and the difference is the velocity
                each pixel is smeared along. A second, uniform velocity term is fed
                in from the scroller so a fast flick smears the entire frame.
   GradePass    linear-space grade: radial chromatic aberration, umber shadows,
                gold highlights, vignette.
   FinishPass   runs after tone mapping, in display space: the WebGL cursor
                (refracting lens, tapered trail, click ripple) plus film grain and
                an ordered-ish dither that keeps the dark gradients from banding.
*/

import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { TRAIL, TRACKS, pointer } from './pointer';

const HASH = `
float hash12(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}`;

/* ------------------------------------------------------------------ scene + motion blur */

const MOTION_SAMPLES = 12;

export class ScenePass extends Pass {
  scene: THREE.Scene;
  camera: THREE.Camera;
  target: THREE.WebGLRenderTarget;
  quad: FullScreenQuad;
  material: THREE.ShaderMaterial;
  private prev = new THREE.Matrix4();
  private current = new THREE.Matrix4();
  private hasPrev = false;

  constructor(scene: THREE.Scene, camera: THREE.Camera) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.needsSwap = true;

    const depth = new THREE.DepthTexture(1, 1);
    depth.type = THREE.UnsignedIntType;
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      depthTexture: depth,
      depthBuffer: true,
      stencilBuffer: false,
      // no multisampling here on purpose: a multisampled colour buffer cannot resolve
      // into an attached depth texture, and the motion blur reads that depth. The
      // edges are cleaned up by the FXAA pass at the end of the chain instead.
    });

    this.material = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tDiffuse: { value: null },
        tDepth: { value: depth },
        uInvViewProj: { value: new THREE.Matrix4() },
        uPrevViewProj: { value: new THREE.Matrix4() },
        uGlobal: { value: new THREE.Vector2() },
        uStrength: { value: 0.28 },
        uMax: { value: 0.045 },
        uNear: { value: .1 },
        uFar: { value: 90 },
        uAspect: { value: 1 },
        uTime: { value: 0 },
      },
      vertexShader: `varying vec2 vUv;
        void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
      fragmentShader: `
        precision highp float;
        uniform sampler2D tDiffuse, tDepth;
        uniform mat4 uInvViewProj, uPrevViewProj;
        uniform vec2 uGlobal;
        uniform float uStrength, uMax, uNear, uFar, uAspect, uTime;
        varying vec2 vUv;
        ${HASH}
        void main(){
          vec4 sharp = texture2D(tDiffuse, vUv);
          float depth = texture2D(tDepth, vUv).x;
          vec2 vel = uGlobal;
          if(depth < 0.9999){
            vec4 ndc = vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
            vec4 world = uInvViewProj * ndc;
            if(abs(world.w) > 0.0001){
              world /= world.w;
              vec4 back = uPrevViewProj * world;
              if(back.w > 0.0001){
                back /= back.w;
                vec2 reprojected = back.xy * 0.5 + 0.5;
                vec2 diff = (vUv - reprojected) * uStrength;
                if(abs(diff.x) < 0.35 && abs(diff.y) < 0.35){
                  vel += diff;
                }
              }
            }
          }
          float len = length(vel);
          if(isnan(len) || isinf(len) || len < 0.0018){
            gl_FragColor = sharp;
            return;
          }
          if(len > uMax) vel *= uMax / len;

          float jitter = hash12(gl_FragCoord.xy + fract(uTime) * 137.0) - 0.5;
          vec4 sum = vec4(0.0);
          for(int i = 0; i < ${MOTION_SAMPLES}; i++){
            float t = (float(i) + 0.5 + jitter) / float(${MOTION_SAMPLES}) - 0.5;
            vec2 sampleUv = clamp(vUv - vel * t, 0.0, 1.0);
            sum += texture2D(tDiffuse, sampleUv);
          }
          vec4 base = sum / float(${MOTION_SAMPLES});
          if(isnan(base.r) || isnan(base.g) || isnan(base.b) || isinf(base.r) || isinf(base.g) || isinf(base.b)){
            base = sharp;
          }
          gl_FragColor = base;
        }`,
    });
    this.quad = new FullScreenQuad(this.material);
  }

  /** Swapping between the perspective and the orthographic camera must not smear. */
  setCamera(camera: THREE.Camera): void {
    if (camera === this.camera) return;
    this.camera = camera;
    this.hasPrev = false;
  }

  /** uv units per frame; the scroller feeds this so DOM-speed motion is felt in 3D too. */
  setGlobalVelocity(x: number, y: number): void {
    this.material.uniforms.uGlobal.value.set(x, y);
  }

  setShutter(v: number): void { this.material.uniforms.uStrength.value = v; }

  setSize(width: number, height: number): void {
    this.target.setSize(width, height);
    this.material.uniforms.uAspect.value = width / Math.max(height, 1);
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget): void {
    const camera = this.camera as THREE.PerspectiveCamera;
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(this.scene, camera);

    const u = this.material.uniforms;
    u.uNear.value = camera.near;
    u.uFar.value = camera.far;
    u.uInvViewProj.value.multiplyMatrices(camera.matrixWorld, camera.projectionMatrixInverse);
    const current = this.current.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    if (!this.hasPrev) { this.prev.copy(current); this.hasPrev = true; }
    u.uPrevViewProj.value.copy(this.prev);
    u.tDiffuse.value = this.target.texture;
    u.uTime.value = performance.now() / 1000;

    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.clear) renderer.clear();
    this.quad.render(renderer);

    this.prev.copy(current);
  }

  dispose(): void { this.target.dispose(); this.material.dispose(); this.quad.dispose(); }
}

/* -------------------------------------------------------------------------- grade */

export class GradePass extends Pass {
  material: THREE.ShaderMaterial;
  quad: FullScreenQuad;

  constructor() {
    super();
    this.material = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tDiffuse: { value: null },
        uChroma: { value: 0.0006 },
        uVignette: { value: 0.62 },
        uShadow: { value: new THREE.Color(0.86, 0.79, 0.7) },
        uHighlight: { value: new THREE.Color(1.05, 0.98, 0.86) },
        uLift: { value: 0.0 },
        /* 0 keeps the umber-and-gold grade the dark acts are built on; 1 takes it to
           neutral. The studio needs neutral: a cyclorama graded toward tan stops
           reading as paper and starts reading as a brown wall. */
        uNeutral: { value: 0.0 },
      },
      vertexShader: `varying vec2 vUv;
        void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
      /* The grade stays a balance, not a print.

         There was a full colourist chain in here for a while - ASC-CDL, a filmic
         shoulder, split toning, saturation against luminance - and it was a worse
         picture. It is instructive why. This scene is already lit like a photograph:
         the umber and the gold are in the lamps, in the seams, in the environment map.
         Grading a warm frame warmer at one end and cold at the other does not add a
         look to it, it fights the look that is already there - the plaster went blue in
         the shadows and the whole thing started reading as a colour-managed still
         rather than as a lit room.

         So this is the original, and the original is two moves: a lateral chromatic
         aberration that grows toward the corners the way a real lens does, and a
         two-ended balance that warms the shadows very slightly and the highlights very
         slightly more. The look belongs to the lighting. */
      fragmentShader: `
        precision highp float;
        uniform sampler2D tDiffuse;
        uniform float uChroma, uVignette, uLift, uNeutral;
        uniform vec3 uShadow, uHighlight;
        varying vec2 vUv;
        void main(){
          vec2 c = vUv - 0.5;
          float r2 = dot(c, c);
          float ca = uChroma * (0.35 + r2 * 3.2);
          vec3 col;
          col.r = texture2D(tDiffuse, vUv - c * ca).r;
          col.g = texture2D(tDiffuse, vUv).g;
          col.b = texture2D(tDiffuse, vUv + c * ca).b;

          float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
          vec3 shadow = mix(uShadow, vec3(1.0), uNeutral);
          vec3 highlight = mix(uHighlight, vec3(1.0), uNeutral);
          col = mix(col * shadow, col, smoothstep(0.0, 0.30, l));
          col = mix(col, col * highlight, smoothstep(0.42, 1.0, l));
          col += uLift;
          col *= 1.0 - uVignette * smoothstep(0.10, 0.80, r2);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.quad = new FullScreenQuad(this.material);
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    this.material.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.clear) renderer.clear();
    this.quad.render(renderer);
  }

  dispose(): void { this.material.dispose(); this.quad.dispose(); }
}

/* ---------------------------------------------------------------------- glow */

/* A bright pass blurred separably at quarter resolution, in two octaves.

   It used to run one pass at sigma 2.2 texels - about nine pixels of reach at full
   size. That is far too tight to read as bloom: the halo never leaves the object it
   came from, so it lays over the surface as a film instead of spilling around it.
   Widening one Gaussian would only smear; what a halo actually needs is scale, so
   the blur runs twice, the second four times wider, and the two are summed. */
export class GlowPass extends Pass {
  private targets: THREE.WebGLRenderTarget[];
  private brightMaterial: THREE.ShaderMaterial;
  private blurMaterial: THREE.ShaderMaterial;
  private compositeMaterial: THREE.ShaderMaterial;
  quad: FullScreenQuad;

  constructor() {
    super();
    const options: THREE.RenderTargetOptions = {
      type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    };
    // two working buffers plus one to hold the wide octave while the tight one composites
    this.targets = [
      new THREE.WebGLRenderTarget(1, 1, options),
      new THREE.WebGLRenderTarget(1, 1, options),
      new THREE.WebGLRenderTarget(1, 1, options),
    ];

    const vertex = `varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`;

    this.brightMaterial = new THREE.ShaderMaterial({
      depthTest: false, depthWrite: false,
      uniforms: { tDiffuse: { value: null }, uThreshold: { value: 1.0 }, uKnee: { value: .35 } },
      vertexShader: vertex,
      fragmentShader: `
        precision highp float;
        uniform sampler2D tDiffuse;
        uniform float uThreshold, uKnee;
        varying vec2 vUv;
        void main(){
          vec3 c = texture2D(tDiffuse, vUv).rgb;
          float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
          // a soft knee so the glow does not switch on at a hard edge
          float weight = smoothstep(uThreshold, uThreshold + uKnee, luma);
          gl_FragColor = vec4(c * weight, 1.0);
        }`,
    });

    this.blurMaterial = new THREE.ShaderMaterial({
      depthTest: false, depthWrite: false,
      uniforms: { tDiffuse: { value: null }, uStep: { value: new THREE.Vector2() }, uSpread: { value: 1 } },
      vertexShader: vertex,
      fragmentShader: `
        precision highp float;
        uniform sampler2D tDiffuse;
        uniform vec2 uStep;
        uniform float uSpread;
        varying vec2 vUv;
        void main(){
          // sigma ~2.2 in texels, normalised
          float w[5];
          w[0] = 0.2270; w[1] = 0.1945; w[2] = 0.1216; w[3] = 0.0540; w[4] = 0.0162;
          vec3 sum = texture2D(tDiffuse, vUv).rgb * w[0];
          for(int i = 1; i < 5; i++){
            vec2 offset = uStep * float(i) * uSpread;
            sum += texture2D(tDiffuse, vUv + offset).rgb * w[i];
            sum += texture2D(tDiffuse, vUv - offset).rgb * w[i];
          }
          gl_FragColor = vec4(sum, 1.0);
        }`,
    });

    this.compositeMaterial = new THREE.ShaderMaterial({
      depthTest: false, depthWrite: false,
      uniforms: { tDiffuse: { value: null }, tGlow: { value: null }, tWide: { value: null }, uStrength: { value: .4 } },
      vertexShader: vertex,
      fragmentShader: `
        precision highp float;
        uniform sampler2D tDiffuse, tGlow, tWide;
        uniform float uStrength;
        varying vec2 vUv;
        void main(){
          vec3 base = texture2D(tDiffuse, vUv).rgb;
          vec3 halo = texture2D(tGlow, vUv).rgb + texture2D(tWide, vUv).rgb * 1.35;
          gl_FragColor = vec4(base + halo * uStrength, 1.0);
        }`,
    });

    this.quad = new FullScreenQuad(this.brightMaterial);
  }

  set strength(v: number) { this.compositeMaterial.uniforms.uStrength.value = v; }
  set threshold(v: number) { this.brightMaterial.uniforms.uThreshold.value = v; }

  private texel = new THREE.Vector2();

  setSize(width: number, height: number): void {
    const w = Math.max(1, Math.floor(width / 4));
    const h = Math.max(1, Math.floor(height / 4));
    this.targets.forEach(t => t.setSize(w, h));
    this.texel.set(1 / w, 1 / h);
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    const [a, b, wide] = this.targets;
    const u = this.blurMaterial.uniforms;

    this.brightMaterial.uniforms.tDiffuse.value = readBuffer.texture;
    this.quad.material = this.brightMaterial;
    renderer.setRenderTarget(a);
    this.quad.render(renderer);

    /* One separable pass, then a second over its own result at four times the step.
       Running the wide octave on the already-blurred image rather than on the bright
       pass is what keeps it smooth: at that spacing the taps would otherwise be far
       enough apart to alias into rings. */
    const octave = (source: THREE.Texture, spread: number, into: THREE.WebGLRenderTarget) => {
      this.quad.material = this.blurMaterial;
      u.uSpread.value = spread;
      u.tDiffuse.value = source;
      u.uStep.value.set(this.texel.x, 0);
      renderer.setRenderTarget(b);
      this.quad.render(renderer);

      u.tDiffuse.value = b.texture;
      u.uStep.value.set(0, this.texel.y);
      renderer.setRenderTarget(into);
      this.quad.render(renderer);
    };

    octave(a.texture, 1, a);
    octave(a.texture, 4, wide);

    this.compositeMaterial.uniforms.tDiffuse.value = readBuffer.texture;
    this.compositeMaterial.uniforms.tGlow.value = a.texture;
    this.compositeMaterial.uniforms.tWide.value = wide.texture;
    this.quad.material = this.compositeMaterial;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.clear) renderer.clear();
    this.quad.render(renderer);
  }

  dispose(): void {
    this.targets.forEach(t => t.dispose());
    this.brightMaterial.dispose();
    this.blurMaterial.dispose();
    this.compositeMaterial.dispose();
    this.quad.dispose();
  }
}

/* ---------------------------------------------- cursor, tracker, grain, dither */

/* The cursor is a tracker, and what it tracks is the model itself.

   Every frame the scene projects a sample of the sculpture's own vertices into
   screen space and hands the nearest few to this pass. Hairlines run out from the
   crosshair to those vertices and square a bracket on each one, so moving the mouse
   walks the brackets across real geometry - an ear, a shoulder, the lip of a shard -
   instead of chasing whatever happened to be bright in the picture. */

const CURVE_SEGMENTS = 14;

export class FinishPass extends Pass {
  material: THREE.ShaderMaterial;
  quad: FullScreenQuad;

  constructor() {
    super();
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i < TRAIL; i++) pts.push(new THREE.Vector2(0.5, 0.5));
    const tracks: THREE.Vector3[] = [];
    for (let i = 0; i < TRACKS; i++) tracks.push(new THREE.Vector3());

    this.material = new THREE.ShaderMaterial({
      depthTest: false, depthWrite: false,
      uniforms: {
        tDiffuse: { value: null },
        uPts: { value: pts },
        uTracks: { value: tracks },
        uAspect: { value: 1 },
        uRadius: { value: 0.011 },
        uHover: { value: 0 },
        uPress: { value: 0 },
        uPresence: { value: 0 },
        uRipple: { value: 0 },
        uTime: { value: 0 },
        uGrain: { value: 0.012 },
        uTint: { value: new THREE.Color('#F0B45C') },
        uBone: { value: new THREE.Color('#FFEDD7') },
      },
      vertexShader: `varying vec2 vUv;
        void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
      fragmentShader: `
        precision highp float;
        uniform sampler2D tDiffuse;
        uniform vec2 uPts[${TRAIL}];
        uniform vec3 uTracks[${TRACKS}];
        uniform float uAspect, uRadius, uHover, uPress, uPresence, uRipple, uTime, uGrain;
        uniform vec3 uTint, uBone;
        varying vec2 vUv;
        ${HASH}

        float seg(vec2 p, vec2 a, vec2 b, float w){
          vec2 pa = p - a, ba = b - a;
          float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-7), 0.0, 1.0);
          return 1.0 - smoothstep(w * 0.55, w, length(pa - ba * h));
        }

        void main(){
          vec3 col = texture2D(tDiffuse, vUv).rgb;

          if(uPresence > 0.002){
            vec2 st = vec2(vUv.x * uAspect, vUv.y);
            vec2 head = vec2(uPts[0].x * uAspect, uPts[0].y);
            float hair = 0.00072;
            float R = uRadius * (1.0 + uHover * 1.5 - uPress * 0.25);

            /* An open aperture, not a crosshair. Four arms and a pip is a targeting
               reticle - a different instrument from the one this page is about, and
               it fought the type. A single thin ring reads as the lens the whole
               piece is shot through, and it leaves its own centre empty so the
               tracker lines can start from a point rather than from behind a mark. */
            float ink = 0.0;
            float ringR = R * 1.15;
            ink += 1.0 - smoothstep(hair * 0.75, hair * 1.7, abs(length(st - head) - ringR));

            /* the tracked vertices */
            float track = 0.0;
            for(int i = 0; i < ${TRACKS}; i++){
              float amp = uTracks[i].z;
              if(amp < 0.01) continue;
              vec2 pt = vec2(uTracks[i].x * uAspect, uTracks[i].y);
              // the bow never leaves the chord by more than a few hundredths, so a
              // cheap distance to the chord rejects almost every pixel before the
              // fourteen-segment walk below
              if(seg(st, head, pt, 0.075) < 0.001) continue;

              vec2 d = pt - head;
              // alternate the bow so the fan reads as drawn, not as a starburst
              vec2 bow = vec2(-d.y, d.x) * (mod(float(i), 2.0) == 0.0 ? 0.14 : -0.14);
              vec2 ctrl = head + d * 0.5 + bow;

              float line = 0.0;
              // start at the centre itself: offsetting the first point along d gave
              // every line a different origin on a ring, which read as an arrowhead
              vec2 prev = head;
              for(int k = 1; k <= ${CURVE_SEGMENTS}; k++){
                float t = float(k) / float(${CURVE_SEGMENTS});
                vec2 q = mix(mix(head, ctrl, t), mix(ctrl, pt, t), t);
                line = max(line, seg(st, prev, q, hair * 0.8));
                prev = q;
              }

              float b = 0.0082;
              vec2 q = abs(st - pt);
              float outline = 1.0 - smoothstep(hair * 0.7, hair * 1.5, abs(max(q.x, q.y) - b));
              float corners = step(b * 0.44, min(q.x, q.y)) * step(max(q.x, q.y), b * 1.1);
              float pip = 1.0 - smoothstep(hair * 0.9, hair * 1.7, length(st - pt));

              track += (line * 0.95 + outline * corners * 1.25 + pip * 0.9) * amp;
            }

            /* over a target the instrument squares up on the target itself */
            float B = R * 3.1, arm2 = R * 1.05;
            float bracket = 0.0;
            for(int i = 0; i < 4; i++){
              float sx = (i == 0 || i == 3) ? -1.0 : 1.0;
              float sy = (i < 2) ? 1.0 : -1.0;
              vec2 corner = head + vec2(sx, sy) * B;
              bracket += seg(st, corner, corner - vec2(sx * arm2, 0.0), hair);
              bracket += seg(st, corner, corner - vec2(0.0, sy * arm2), hair);
            }

            float ripple = 0.0;
            if(uRipple > 0.0001){
              float r = R * 1.6 + uRipple * 0.055;
              ripple = (1.0 - smoothstep(hair * 0.8, hair * 1.6, abs(length(st - head) - r)))
                     * (1.0 - uRipple);
            }

            /* The reticle ring is rendered at the top layer via hardware SVG cursor so it is unified
               everywhere over modals and DOM. Here in WebGL we preserve the 3D vertex illumination
               tracks and click ripple radiating into the 3D scene. */
            float bone = clamp(track * 0.85, 0.0, 1.0) * uPresence;
            float hot = clamp(ripple + track * 0.28, 0.0, 1.0) * uPresence;

            // a whisper of shadow keeps the hairlines readable on a bright sheet
            col *= 1.0 - clamp(bone + hot, 0.0, 1.0) * 0.20;
            col = mix(col, uBone, bone);
            col = mix(col, uTint, hot);
          }

          float g = hash12(gl_FragCoord.xy + fract(uTime) * 311.0);
          col += (g - 0.5) * uGrain;
          col += (hash12(gl_FragCoord.xy * 1.61) - 0.5) / 220.0;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.quad = new FullScreenQuad(this.material);
  }

  sync(aspect: number, time: number): void {
    const u = this.material.uniforms;
    const pts = u.uPts.value as THREE.Vector2[];
    for (let i = 0; i < TRAIL; i++) pts[i].set(pointer.trail[i * 2], pointer.trail[i * 2 + 1]);
    const tracks = u.uTracks.value as THREE.Vector3[];
    for (let i = 0; i < TRACKS; i++) {
      tracks[i].set(pointer.tracks[i * 3], pointer.tracks[i * 3 + 1], pointer.tracks[i * 3 + 2]);
    }
    u.uAspect.value = aspect;
    u.uHover.value = pointer.hover;
    u.uPress.value = pointer.press;
    u.uPresence.value = pointer.presence;
    u.uRipple.value = pointer.ripple;
    u.uTime.value = time;
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    this.material.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.clear) renderer.clear();
    this.quad.render(renderer);
  }

  dispose(): void {
    this.material.dispose();
    this.quad.dispose();
  }
}
