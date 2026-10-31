/* Depth of field.

   The old defocus lived inside the motion blur resolve: thirteen taps in a fixed
   two-ring pattern, gathered without asking how far away each one was. Three things
   went wrong with that, and all three are what "bad bokeh" actually looks like.

   A fixed kernel that scales with the circle of confusion stops being a blur once
   the radius passes the tap spacing - past that you are looking at thirteen separate
   ghosts arranged in two rings. Gathering without a depth test lets a sharp
   foreground smear outward over the background behind it, which is the halo around
   every silhouette. And averaging linearly throws away the one thing that gives
   bokeh its character: a highlight has to survive being spread over a hundred times
   its own area, and a plain mean divides it away to nothing.

   So: a golden-angle spiral of 40 taps at half resolution, rotated per pixel, so the
   sample density is even at every radius and neighbours do not share a pattern. Each
   tap is weighted by how far its own circle of confusion actually carries - by
   degree, never as a yes or no, because a hard test makes neighbouring pixels
   disagree in whole samples and the frame breaks into glitter. And the source is
   passed through a highlight curve before the gather and brought back after, so
   bright points spread as discs with defined edges instead of dissolving - by a
   bounded amount, because the buffer is HDR and an unbounded one lets a single
   specular swamp the gather and blow out. */

import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const TAPS = 22;

const VERTEX = `varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`;

/* Circle of confusion in uv units, signed so the composite can tell a foreground
   blur from a background one. Shared by the gather and the composite. */
const COC = `
uniform sampler2D tDepth;
uniform float uNear;
uniform float uFar;
uniform float uFocus;
uniform float uAperture;
uniform float uMaxCoc;

float viewDistance(vec2 uv){
  float d = texture2D(tDepth, uv).x;
  if (d >= .9999) return uFar;
  float viewZ = (uNear * uFar) / ((uFar - uNear) * d - uFar);
  return -viewZ;
}

float cocAt(vec2 uv){
  float dist = viewDistance(uv);
  // relative defocus: a metre off focus matters far more up close than far away
  return clamp(abs(dist - uFocus) / max(dist, 1.) * uAperture, 0., uMaxCoc);
}`;

export class DofPass extends Pass {
  private half: THREE.WebGLRenderTarget;
  private gatherMaterial: THREE.ShaderMaterial;
  private compositeMaterial: THREE.ShaderMaterial;
  private quad: FullScreenQuad;
  private depth: THREE.Texture | null = null;

  constructor() {
    super();
    this.needsSwap = true;

    this.half = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    });

    this.gatherMaterial = new THREE.ShaderMaterial({
      depthTest: false, depthWrite: false,
      uniforms: {
        tDiffuse: { value: null },
        tDepth: { value: null },
        uNear: { value: .1 },
        uFar: { value: 90 },
        uFocus: { value: 8 },
        uAperture: { value: .024 },
        uMaxCoc: { value: .022 },
        uAspect: { value: 1.78 },
      },
      vertexShader: VERTEX,
      fragmentShader: COC + `
        uniform sampler2D tDiffuse;
        uniform float uAspect;
        varying vec2 vUv;

        float luma(vec3 c){ return dot(c, vec3(.2126, .7152, .0722)); }

        /* Bokeh lives in the highlights, so bright samples have to count for more
           than dim ones - weighting by the inverse of brightness, the way a denoiser
           would, is exactly wrong here.

           But the buffer this reads is HDR and unbounded. An unbounded boost meant a
           single specular at luma 20 arrived weighing 400, swamped the other
           thirty-nine taps, and painted itself across the whole disc; because the
           spiral is rotated per pixel, neighbours caught or missed it independently
           and the result was clusters of blown sparkle around every chess piece.
           Cap the boost, and normalise by the same weights that were applied, so the
           gather stays an average and cannot gain energy. */
        float bokehWeight(vec3 c){ return 1. + min(luma(c), 2.5); }

        float hash12(vec2 p){
          vec3 p3 = fract(vec3(p.xyx) * .1031);
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.x + p3.y) * p3.z);
        }

        void main(){
          /* Distance first, circle of confusion from it: the gather needs both, and
             one depth fetch answers both questions. */
          float centreDist = viewDistance(vUv);
          float centreCoc = clamp(abs(centreDist - uFocus) / max(centreDist, 1.) * uAperture, 0., uMaxCoc);
          if (centreCoc < .0004) { gl_FragColor = texture2D(tDiffuse, vUv); return; }

          /* Every pixel walked the same forty angles, and every pixel took a hard
             yes or no on each tap. Neighbours therefore disagreed in whole samples,
             which is what turned a bright background into loose glitter. Rotating
             the spiral per pixel decorrelates the pattern, and accepting a tap by
             degree rather than by decision removes the step that was sparkling. */
          float spin = hash12(gl_FragCoord.xy) * 6.2831853;
          float cs = cos(spin), sn = sin(spin);

          vec3 centre = texture2D(tDiffuse, vUv).rgb;
          float w0 = bokehWeight(centre);
          vec3 sum = centre * w0;
          float weight = w0;

          for (int i = 0; i < ` + TAPS + `; i++){
            float t = (float(i) + .5) / float(` + TAPS + `);
            /* golden angle: successive taps never line up, so the disc fills evenly
               instead of banding into the rings a fixed pattern produces */
            float a = (float(i) + .5) * 2.39996323;
            vec2 dir = vec2(cos(a), sin(a));
            dir = vec2(dir.x * cs - dir.y * sn, dir.x * sn + dir.y * cs);
            vec2 offset = dir * sqrt(t) * centreCoc;
            offset.x /= max(uAspect, .001);
            vec2 uv = vUv + offset;

            /* Accept by degree, but let depth order decide who may spread onto whom.

               Anything at or behind this pixel is its own background and always
               counts. Anything in front is a different object, and it may only reach
               here if its own circle of confusion is genuinely this wide.

               Weighing every tap by its own blur alone was not enough, and the
               shards are where it showed. Right against a silhouette the first taps
               sit a fraction of a pixel away, so the bar they had to clear was
               nearly zero and a shard in perfect focus cleared it - it leaked a few
               pixels out into the dark on every side. Because the spiral is rotated
               per pixel, neighbours leaked by different amounts, and that is the
               speckled aura that sat around every piece of stone. In front is now a
               separate case with a floor under it, so a sharp edge stays an edge. */
            float reach = sqrt(t) * centreCoc;
            float dist = viewDistance(uv);
            float coc = clamp(abs(dist - uFocus) / max(dist, 1.) * uAperture, 0., uMaxCoc);
            float w = dist >= centreDist
                    ? smoothstep(reach * .35, reach * .95, coc)
                    : smoothstep(max(reach * .5, uMaxCoc * .04), reach * 1.05, coc);
            if (w <= .001) continue;

            vec3 c = texture2D(tDiffuse, uv).rgb;
            float bw = bokehWeight(c) * w;
            sum += c * bw;
            weight += bw;
          }

          gl_FragColor = vec4(sum / max(weight, 1e-4), 1.);
        }`,
    });

    this.compositeMaterial = new THREE.ShaderMaterial({
      depthTest: false, depthWrite: false,
      uniforms: {
        tDiffuse: { value: null },
        tBlur: { value: null },
        tDepth: { value: null },
        uNear: { value: .1 },
        uFar: { value: 90 },
        uFocus: { value: 8 },
        uAperture: { value: .024 },
        uMaxCoc: { value: .022 },
        uBlurTexel: { value: new THREE.Vector2() },
      },
      vertexShader: VERTEX,
      fragmentShader: COC + `
        uniform sampler2D tDiffuse;
        uniform sampler2D tBlur;
        uniform vec2 uBlurTexel;
        varying vec2 vUv;

        void main(){
          vec4 sharp = texture2D(tDiffuse, vUv);
          float coc = cocAt(vUv);

          /* Four bilinear taps on the diagonals, which is a tent over the half
             resolution buffer for the price of four fetches.

             The spiral is rotated per pixel so that neighbours do not share a
             pattern, and along a silhouette - where half the disc is stone and half
             is the dark behind it - that means neighbours land on different
             proportions of each and disagree. That disagreement is the speckled aura
             that sat around every shard. It is noise at exactly one texel, which is
             the one thing a tent this small removes completely, and since this buffer
             is the defocused layer there is nothing here to keep sharp. */
          vec3 blurred = (
            texture2D(tBlur, vUv + vec2(-uBlurTexel.x, -uBlurTexel.y)).rgb +
            texture2D(tBlur, vUv + vec2( uBlurTexel.x, -uBlurTexel.y)).rgb +
            texture2D(tBlur, vUv + vec2(-uBlurTexel.x,  uBlurTexel.y)).rgb +
            texture2D(tBlur, vUv + vec2( uBlurTexel.x,  uBlurTexel.y)).rgb) * .25;

          // the half resolution buffer is only worth reaching for once the blur is
          // wider than the pixels it was rendered into
          float mixAmount = (isnan(coc) || isinf(coc)) ? 0.0 : smoothstep(.0020, .0090, coc);
          gl_FragColor = vec4(mix(sharp.rgb, blurred, mixAmount), sharp.a);
        }`,
    });

    this.quad = new FullScreenQuad(this.gatherMaterial);
  }

  /** the depth texture ScenePass renders alongside its colour */
  setDepth(texture: THREE.Texture): void { this.depth = texture; }

  setCamera(camera: THREE.PerspectiveCamera): void {
    for (const m of [this.gatherMaterial, this.compositeMaterial]) {
      m.uniforms.uNear.value = camera.near;
      m.uniforms.uFar.value = camera.far;
    }
    this.gatherMaterial.uniforms.uAspect.value = camera.aspect;
  }

  /** distance the lens is focused at, and how hard it falls off either side */
  setFocus(distance: number, aperture: number): void {
    for (const m of [this.gatherMaterial, this.compositeMaterial]) {
      m.uniforms.uFocus.value = distance;
      m.uniforms.uAperture.value = aperture;
    }
  }

  setSize(width: number, height: number): void {
    const w = Math.max(1, Math.floor(width / 2));
    const h = Math.max(1, Math.floor(height / 2));
    this.half.setSize(w, h);
    this.compositeMaterial.uniforms.uBlurTexel.value.set(1 / w, 1 / h);
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    this.gatherMaterial.uniforms.tDiffuse.value = readBuffer.texture;
    this.gatherMaterial.uniforms.tDepth.value = this.depth;
    this.quad.material = this.gatherMaterial;
    renderer.setRenderTarget(this.half);
    this.quad.render(renderer);

    const composite = this.compositeMaterial.uniforms;
    composite.tDiffuse.value = readBuffer.texture;
    composite.tBlur.value = this.half.texture;
    composite.tDepth.value = this.depth;
    this.quad.material = this.compositeMaterial;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.clear) renderer.clear();
    this.quad.render(renderer);
  }

  dispose(): void {
    this.half.dispose();
    this.gatherMaterial.dispose();
    this.compositeMaterial.dispose();
    this.quad.dispose();
  }
}
