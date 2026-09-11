/**
 * Bundles the shared engine into one Node script for a host that cannot load
 * TypeScript in-process.
 *
 * VS Code never uses this: it bundles core into `out/extension.js` and calls it
 * directly. The IntelliJ plugin spawns the output of this file. Same source,
 * two deliveries. See spec Section 19.
 */
import { build } from 'esbuild'
import { readFileSync } from 'node:fs'

const out = process.argv[2] ?? '../intellij-plugin/build/sidecar/sidecar.js'
const { version } = JSON.parse(readFileSync('package.json', 'utf8'))

await build({
  entryPoints: ['src/sidecar/main.ts'],
  bundle: true,
  outfile: out,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: true,
  // Baked in so the handshake can refuse a plugin and a bundle that disagree,
  // rather than failing later and further away.
  define: { 'process.env.AI_DEV_CORE_VERSION': JSON.stringify(version) },
})

console.log(`sidecar → ${out} (core ${version})`)
