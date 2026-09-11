/* Ambient occlusion.

   What the chain was missing. Every other pass works on the image; this is the only
   one that knows the scene has shape. Without it the crevices between shards, the
   groove either side of every seam and the point where the cast meets the mat all
   receive the same ambient as the faces around them, and the object reads as pasted
   onto the frame rather than sitting in it.

   It samples the depth ScenePass already keeps for the motion blur, so there is no
   second geometry pass and no normal buffer: normals come from the derivatives of
   the reconstructed view position, the kernel is a golden-angle spiral rotated by a
   per-pixel hash so the noise is high frequency, and a depth-aware cross blur at
   half resolution takes it back out. It runs before the bloom, so a crease cannot
   end up glowing. */

import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const SAMPLES = 12;

const VERTEX = `varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`;

const VIEW_POS = `
uniform sampler2D tDepth;
uniform mat4 uProj;
uniform mat4 uProjInv;
varying vec2 vUv;

float hash12(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

/* view space position of whatever is written at this pixel */
vec3 viewPos(vec2 uv, float d){
  vec4 clip = vec4(uv * 2. - 1., d * 2. - 1., 1.);
  vec4 v = uProjInv * clip;
  return v.xyz / v.w;
}`;

export class AOPass extends Pass {
  private targets: THREE.WebGLRenderTarget[];
  private aoMaterial: THREE.ShaderMaterial;
  private blurMaterial: THREE.ShaderMaterial;
  private compositeMaterial: THREE.ShaderMaterial;
  private quad: FullScreenQuad;
  private depth: THREE.Texture | null = null;

  constructor() {
    super();
    this.needsSwap = true;

    const options: THREE.RenderTargetOptions = {
      type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    };
    this.targets = [
      new THREE.WebGLRenderTarget(1, 1, options),
      new THREE.WebGLRenderTarget(1, 1, options),
    ];

    this.aoMaterial = new THREE.ShaderMaterial({
      depthTest: false, depthWrite: false,
      uniforms: {
        tDepth: { value: null },
        uProj: { value: new THREE.Matrix4() },
        uProjInv: { value: new THREE.Matrix4() },
        uRadius: { value: .32 },
        uBias: { value: .02 },
        /* view units past which occlusion stops being computed at all; the sweep in
           act one stands at eleven, the bench in act four at about nine */
        uReach: { value: 5.5 },
        uTexel: { value: new THREE.Vector2() },
      },
      vertexShader: VERTEX,
      fragmentShader: VIEW_POS + `
        uniform float uRadius;
        uniform float uBias;
        uniform float uReach;
        uniform vec2 uTexel;

        void main(){
          float d = texture2D(tDepth, vUv).x;
          // the far plane is sky, and sky is occluded by nothing
          if (d >= .9999) { gl_FragColor = vec4(1.); return; }

          vec3 p = viewPos(vUv, d);

          /* Occlusion is a local effect and the depth buffer is not linear. Past a
             few units the stored depth quantises hard, reconstructing position from
             it steps rather than slopes, and taking a derivative of those steps turns
             the quantisation into banding - which on a surface as large and as far
             away as the cyclorama printed as vertical bars right across it. A radius
             of a third of a unit cannot darken anything at fifteen units anyway, so
             there is nothing to compute out there. Stop before the precision does. */
          float away = -p.z;
          float reach = 1. - smoothstep(uReach, uReach * 1.45, away);
          if (reach < .01) { gl_FragColor = vec4(1.); return; }
          /* Derivatives are taken here, outside every branch and loop, so the whole
             quad agrees on them. Taken inside, they are undefined along silhouettes
             and print a rim of false occlusion down every edge. */
          vec3 dx = dFdx(p), dy = dFdy(p);
          vec3 n = normalize(cross(dx, dy));

          /* Even taken safely, a derivative across a silhouette is a normal invented
             from two surfaces metres apart. That is what put the speckled fringe
             around every shard. Where the quad straddles an edge the plane is a lie,
             so the occlusion it implies is thrown away rather than trusted. */
          float edge = max(length(dx), length(dy)) / max(uRadius, 1e-4);
          float trust = 1. - smoothstep(.9, 2.2, edge);
          if (trust < .01) { gl_FragColor = vec4(1.); return; }

          float angle = hash12(gl_FragCoord.xy) * 6.2831853;
          float ca = cos(angle), sa = sin(angle);
          float occluded = 0.;

          for (int i = 0; i < ` + SAMPLES + `; i++){
            /* A golden-angle spiral over the hemisphere: even coverage without
               uploading a kernel, and the radius grows with the index so the first
               samples sit tight against the surface where contact shadow lives. */
            float t = (float(i) + .5) / float(` + SAMPLES + `);
            float phi = (float(i) + .5) * 2.39996323;
            vec2 disc = vec2(cos(phi), sin(phi)) * sqrt(t);
            vec2 rot = vec2(disc.x * ca - disc.y * sa, disc.x * sa + disc.y * ca);
            vec3 dir = normalize(vec3(rot, .55 + t * .45));
            // fold any sample that landed under the surface back above it
            if (dot(dir, n) < 0.) dir = reflect(dir, n);

            vec3 s = p + dir * uRadius * (.35 + t * .65);
            vec4 clip = uProj * vec4(s, 1.);
            vec2 suv = (clip.xy / clip.w) * .5 + .5;
            if (suv.x < 0. || suv.x > 1. || suv.y < 0. || suv.y > 1.) continue;

            float sd = texture2D(tDepth, suv).x;
            if (sd >= .9999) continue;
            vec3 sp = viewPos(suv, sd);

            // view space looks down -z, so a greater z is nearer the lens
            if (sp.z - s.z > uBias) {
              // an object metres in front is not a crease: fall off with distance
              occluded += clamp(uRadius / max(abs(p.z - sp.z), 1e-4), 0., 1.);
            }
          }

          gl_FragColor = vec4(clamp(1. - trust * reach * occluded / float(` + SAMPLES + `), 0., 1.));
        }`,
    });

    this.blurMaterial = new THREE.ShaderMaterial({
      depthTest: false, depthWrite: false,
      uniforms: {
        tAO: { value: null },
        tDepth: { value: null },
        uStep: { value: new THREE.Vector2() },
        uNear: { value: .1 },
        uFar: { value: 90 },
      },
      vertexShader: VERTEX,
      fragmentShader: `
        uniform sampler2D tAO;
        uniform sampler2D tDepth;
        uniform vec2 uStep;
        uniform float uNear;
        uniform float uFar;
        varying vec2 vUv;

        float linear(float d){
          float z = d * 2. - 1.;
          return (2. * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
        }

        void main(){
          float centre = linear(texture2D(tDepth, vUv).x);
          float sum = 0., weight = 0.;
          /* Depth aware, so the blur takes out the sampling noise without dragging
             the shadow of one shard across the edge of the one behind it. */
          for (int i = -3; i <= 3; i++){
            vec2 uv = vUv + uStep * float(i);
            float w = exp(-float(i * i) / 6.);
            float dz = abs(linear(texture2D(tDepth, uv).x) - centre);
            w *= exp(-dz * dz * 200.);
            sum += texture2D(tAO, uv).x * w;
            weight += w;
          }
          gl_FragColor = vec4(sum / max(weight, 1e-4));
        }`,
    });

    this.compositeMaterial = new THREE.ShaderMaterial({
      depthTest: false, depthWrite: false,
      uniforms: {
        tDiffuse: { value: null },
        tAO: { value: null },
        tDepth: { value: null },
        uIntensity: { value: .8 },
        uNear: { value: .1 },
        uFar: { value: 90 },
        uHalfTexel: { value: new THREE.Vector2() },
        uTint: { value: new THREE.Color(0x33200f) },
      },
      vertexShader: VERTEX,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform sampler2D tAO;
        uniform sampler2D tDepth;
        uniform float uIntensity;
        uniform float uNear;
        uniform float uFar;
        uniform vec2 uHalfTexel;
        uniform vec3 uTint;
        varying vec2 vUv;

        /* Distances have to be compared in view units. Raw depth is non-linear: past
           a few units it is packed so close to 1 that neighbouring texels differ only
           by quantisation, and a weight taken from that difference flips between two
           extremes texel by texel. Weighted with those, the upsample banded at the
           half-resolution texel pitch - the vertical bars across the cyclorama. */
        float linear(float d){
          float z = d * 2. - 1.;
          return (2. * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
        }

        void main(){
          vec4 colour = texture2D(tDiffuse, vUv);

          /* Nothing behind the geometry has an occlusion to compute.

             There is no depth written where the scene did not draw, so those pixels
             come back at the far plane, every neighbour disagrees with every other,
             and the upsample resolves to full shade - which is then multiplied by a
             warm umber tint. On a black void that is invisible and this pass has run
             for months without anyone noticing. Put a sky behind the geometry and it
             is very visible indeed: it arrives as a flat brown smear with a horizon
             line across it, which is exactly what happened to the gold sea's sky.

             The guard is a single compare. Anything at or past the far plane is not a
             surface, so it keeps the colour it came in with. */
          float raw = texture2D(tDepth, vUv).x;
          if (raw >= .9995) { gl_FragColor = colour; return; }

          /* The occlusion buffer is half size, so a straight fetch is a bilinear
             blend of texels that may sit either side of a silhouette - the far
             surface's occlusion smeared onto the near one, which reads as a halo.
             Weight the four neighbours by how well their depth matches this pixel's
             instead, and edges stay where the geometry put them. */
          float centre = linear(texture2D(tDepth, vUv).x);
          float ao = 0., total = 0.;
          for (int i = 0; i < 4; i++){
            vec2 o = vec2(i == 0 || i == 3 ? -1. : 1., i < 2 ? -1. : 1.) * uHalfTexel;
            // a tenth of a view unit of disagreement halves a neighbour's say
            float dz = abs(linear(texture2D(tDepth, vUv + o).x) - centre);
            float w = exp(-dz * dz * 120.);
            ao += texture2D(tAO, vUv + o).x * w;
            total += w;
          }
          /* Every one of the four can disagree at once. On the sweep, seen almost
             edge on, half a texel of screen is metres of depth, so all four weights
             underflow together - and dividing by a floor turned a total of nothing
             into an occlusion of zero, which is *full* shade. That is what printed
             the vertical bars down the cyclorama and the dashes across the plinth.
             When no neighbour is trustworthy, take the texel under the pixel rather
             than the dark. */
          ao = clamp(total > 1e-3 ? ao / total : texture2D(tAO, vUv).x, 0., 1.);
          /* The clamp above is not tidiness. A normalised weighted average of texels
             that all hold 1 comes back as 1 plus a rounding error, and pow() of the
             negative number that leaves is undefined - it returned NaN, the clamp
             below could not rescue it, and every pixel it happened on printed as a
             black hairline across the mat and the bench. */
          // bend the response so flat faces are untouched and only real creases go
          float shade = clamp(1. - pow(1. - ao, 1.7) * uIntensity, 0., 1.);
          /* Creases in this room are not neutral grey. What little light reaches them
             has bounced off umber wood and warm plaster, so the occluded end of the
             ramp carries that rather than going dead. */
          colour.rgb = mix(colour.rgb * uTint, colour.rgb, shade);
          gl_FragColor = colour;
        }`,
    });

    this.quad = new FullScreenQuad(this.aoMaterial);
  }

  /** the depth texture ScenePass renders alongside its colour */
  setDepth(texture: THREE.Texture): void { this.depth = texture; }

  set intensity(v: number) { this.compositeMaterial.uniforms.uIntensity.value = v; }
  set radius(v: number) { this.aoMaterial.uniforms.uRadius.value = v; }
  set reach(v: number) { this.aoMaterial.uniforms.uReach.value = v; }

  /** the projection the frame was rendered with; the depth cannot be unprojected without it */
  setCamera(camera: THREE.PerspectiveCamera): void {
    this.aoMaterial.uniforms.uProj.value.copy(camera.projectionMatrix);
    this.aoMaterial.uniforms.uProjInv.value.copy(camera.projectionMatrixInverse);
    this.blurMaterial.uniforms.uNear.value = camera.near;
    this.blurMaterial.uniforms.uFar.value = camera.far;
    this.compositeMaterial.uniforms.uNear.value = camera.near;
    this.compositeMaterial.uniforms.uFar.value = camera.far;
  }

  setSize(width: number, height: number): void {
    const w = Math.max(1, Math.floor(width / 2));
    const h = Math.max(1, Math.floor(height / 2));
    this.targets.forEach(t => t.setSize(w, h));
    this.aoMaterial.uniforms.uTexel.value.set(1 / w, 1 / h);
    this.compositeMaterial.uniforms.uHalfTexel.value.set(1 / w, 1 / h);
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    const [a, b] = this.targets;
    const composite = this.compositeMaterial.uniforms;
    composite.tDiffuse.value = readBuffer.texture;

    if (this.depth) {
      this.aoMaterial.uniforms.tDepth.value = this.depth;
      this.quad.material = this.aoMaterial;
      renderer.setRenderTarget(a);
      this.quad.render(renderer);

      const step = this.blurMaterial.uniforms.uStep.value as THREE.Vector2;
      const texel = this.aoMaterial.uniforms.uTexel.value as THREE.Vector2;
      this.blurMaterial.uniforms.tDepth.value = this.depth;
      this.quad.material = this.blurMaterial;

      this.blurMaterial.uniforms.tAO.value = a.texture;
      step.set(texel.x, 0);
      renderer.setRenderTarget(b);
      this.quad.render(renderer);

      this.blurMaterial.uniforms.tAO.value = b.texture;
      step.set(0, texel.y);
      renderer.setRenderTarget(a);
      this.quad.render(renderer);

      composite.tAO.value = a.texture;
      composite.tDepth.value = this.depth;
    }

    this.quad.material = this.compositeMaterial;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.clear) renderer.clear();
    this.quad.render(renderer);
  }

  dispose(): void {
    this.targets.forEach(t => t.dispose());
    this.aoMaterial.dispose(); this.blurMaterial.dispose();
    this.compositeMaterial.dispose(); this.quad.dispose();
  }
}
