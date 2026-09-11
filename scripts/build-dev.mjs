/* Unminified build with inline sourcemaps, written straight into work/preview so the
   local server serves it. Use it when a runtime stack trace needs real names. */
import { build } from 'esbuild';
import { existsSync } from 'node:fs';
import path from 'node:path';

const threeRoot = path.resolve(existsSync('node_modules/three/package.json') ? 'node_modules/three' : 'work/three-package/package');

await build({
  stdin: {
    contents: "import React from 'react';import{createRoot}from'react-dom/client';import Home from './app/page';createRoot(document.getElementById('root')).render(React.createElement(Home));",
    resolveDir: process.cwd(),
    loader: 'tsx',
  },
  outfile: 'work/preview/app.js',
  bundle: true,
  format: 'esm',
  jsx: 'automatic',
  minify: false,
  sourcemap: 'inline',
  target: 'es2022',
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
  define: { 'process.env.NODE_ENV': '"development"' },
});
console.log('dev bundle written to work/preview/app.js');
