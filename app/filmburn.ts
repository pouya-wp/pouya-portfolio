/* The film burns through.

   The frame catches at a point off centre, the burn eats outward along a torn edge
   with a hot rim running ahead of it, the emulsion bleaches, and the image is gone.
   Then it comes back the same way and there is a different act behind it.

   WHY A POST PASS AND NOT AN OVERLAY

   The obvious way is a video or a sprite sheet of real burning film multiplied over
   the frame. It looks like a video of burning film laid over a website, because that
   is what it is: the burn does not know where the image is, so it cannot eat it. Here
   the pass owns the final frame, so what is burning is the render - the hole is the
   absence of the picture, not a texture on top of it.

   HOW THE EDGE IS BUILT

   One fbm field, sampled once, thresholded three times. Everything else falls out of
   the distance between those thresholds:

     beyond the threshold      still the image
     just past it              the char - a thin dark scorch
     a little further          the rim - white through yellow into red
     past that                 gone

   The field is warped by a second, slower one before it is thresholded, which is what
   keeps the edge from reading as a circle with noise on it. Real film tears along the
   grain; the warp is the grain.

   The burn is not symmetrical in time. Film goes fast once it is alight and the
   return is authored, not physical, so the two halves are shaped separately by the
   caller through `amount`. */

import * as THREE from 'three';

export const FilmBurnShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    /** 0 clean, 1 nothing left */
    uAmount: { value: 0 },
    /** 0 the burn as it stands, 1 the frame behind it - the white dissolving away */
    uClear: { value: 0 },
    uTime: { value: 0 },
    /** where the frame catches, in uv */
    uSeed: { value: new THREE.Vector2(.68, .34) },
    uAspect: { value: 1 },
    /** the hot edge, and the scorch behind it */
    uHot: { value: new THREE.Color('#fff0c4') },
    uFlame: { value: new THREE.Color('#ff7a18') },
    uChar: { value: new THREE.Color('#1a0f07') },
  },

  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main(){
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */`
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform float uAmount, uClear, uTime, uAspect;
    uniform vec2 uSeed;
    uniform vec3 uHot, uFlame, uChar;
    varying vec2 vUv;

    float hash(vec2 p){
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    float noise(vec2 p){
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1,0)), f.x),
                 mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
    }

    float fbm(vec2 p){
      float v = 0.0, a = 0.5;
      for (int i = 0; i < 5; i++){ v += noise(p) * a; p *= 2.03; a *= 0.5; }
      return v;
    }

    void main(){
      vec4 source = texture2D(tDiffuse, vUv);
      if (uAmount <= 0.0001 || uClear >= 0.9999){ gl_FragColor = source; return; }

      vec2 p = vec2(vUv.x * uAspect, vUv.y);
      vec2 seed = vec2(uSeed.x * uAspect, uSeed.y);

      /* The field. Distance from the ignition point decides the broad shape, fbm
         decides where the edge actually is, and a slower warp bends the sampling
         before the detail is taken - without it the tear is a ring of static rather
         than something that ran along the grain. */
      vec2 warp = vec2(fbm(p * 1.7 + uTime * .05), fbm(p * 1.7 - uTime * .04)) - .5;
      float grain = fbm(p * 4.2 + warp * 1.9);
      float radial = length(p - seed) * .78;
      float field = radial * .72 + grain * .52;

      /* The threshold sweeps past the whole range of the field, with enough overshoot
         at each end that the first frame is genuinely untouched and the last is
         genuinely empty. */
      float front = mix(-0.18, 1.34, uAmount);

      float gone = smoothstep(front - 0.012, front + 0.012, field);
      float rim = smoothstep(front + 0.10, front + 0.008, field) * gone;
      float char = smoothstep(front + 0.185, front + 0.075, field) * gone;

      /* Emulsion ahead of the flame. Heat reaches the picture before the flame does:
         it lifts, loses its colour and blows out just before it is eaten, which is
         most of what makes a burn read as film rather than as a mask. */
      float heat = smoothstep(front + 0.42, front + 0.02, field) * gone;
      vec3 colour = source.rgb;
      float luma = dot(colour, vec3(.2126, .7152, .0722));
      colour = mix(colour, vec3(luma), heat * .55);
      colour *= 1.0 + heat * 1.5;

      // scorch, then the rim running ahead of it
      colour = mix(colour, uChar, char * .92);
      vec3 fire = mix(uFlame, uHot, smoothstep(front + 0.055, front, field));
      colour = mix(colour, fire, rim * 1.0);

      /* What is left behind is nothing - the lamp with no film in the gate. Held just
         off pure white so the following act does not arrive out of a clipped frame. */
      colour = mix(vec3(0.96, 0.94, 0.90), colour, gone);

      /* And then the white simply goes.

         The first cut of this ran the burn backwards to bring the next act in, which
         is wrong twice over: it doubles the length of a transition that should be the
         shortest thing in the piece, and it says the film is being repaired, which is
         not a thing that happens to film. What happens is the gate is empty, the lamp
         is still on, and the next frame arrives in that light. So the white is not the
         end of the last act - it is the first frame of the next one, and it dissolves
         off the front of it. */
      gl_FragColor = vec4(mix(colour, source.rgb, uClear), source.a);
    }
  `,
};
