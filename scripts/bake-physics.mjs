/* Runs the rigid-body simulation once, offline, and writes the poses to
   public/physics-baked.json. The site then scrubs those poses with the scroll
   instead of simulating at runtime, which is what makes the fall reversible. */
import { build } from 'esbuild';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const threeRoot = path.resolve(existsSync('node_modules/three/package.json') ? 'node_modules/three' : 'work/three-package/package');
mkdirSync('work', { recursive: true });

const entry = [
  "import { readFileSync, writeFileSync } from 'node:fs';",
  "import { parseGlb, normaliseMesh, shardSeeds, fractureShell } from './app/sculpture-model';",
  "import { bakePhysics } from './app/physics';",
  "import { SCULPTURE } from './app/story';",
  "const file = readFileSync('public/sculpture.glb');",
  'const raw = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);',
  'const mesh = normaliseMesh(parseGlb(raw), SCULPTURE.height);',
  'let seed = 41;',
  'const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };',
  'const seeds = shardSeeds(mesh, SCULPTURE.shards, random);',
  'const shards = fractureShell(mesh, seeds, SCULPTURE.thickness);',
  'const data = shards.map(s => ({ geometry: s.geometry, center: s.centre }));',
  'const frames = bakePhysics(data);',
  'const convert = series => series.map(frame => frame.flatMap(p => [...p.position.toArray(), ...p.quaternion.toArray()].map(n => Number(n.toFixed(5)))));',
  "writeFileSync('public/physics-baked.json', JSON.stringify({ shards: data.length, explosion: convert(frames.explosion), drop: convert(frames.drop) }));",
  "console.log('Baked ' + data.length + ' shell shards; rebuild the site to pick up the new poses.');",
].join('\n');

await build({
  stdin: { contents: entry, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'work/bake-runner.mjs',
  plugins: [{
    name: 'three-local',
    setup(builder) {
      builder.onResolve({ filter: /^three($|\/)/ }, args => ({
        path: args.path === 'three'
          ? path.join(threeRoot, 'build/three.module.js')
          : path.join(threeRoot, args.path.replace('three/addons/', 'examples/jsm/').replace(/^three\//, '')),
      }));
    },
  }],
});

await import(pathToFileURL(path.resolve('work/bake-runner.mjs')).href);
