import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyRemoteReactComponent } from '../../../server-ai/scripts/build-remote-react.mjs'
const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const workspace = resolve(pluginRoot, '../../..')
await verifyRemoteReactComponent(resolve(pluginRoot, 'remote-components/timeline'))
const dist = resolve(workspace, 'dist/packages/plugins/execution-observability')
for (const file of ['app.js', 'app.css']) {
  const [source, built] = await Promise.all([
    readFile(resolve(pluginRoot, 'remote-components/timeline', file)),
    readFile(resolve(dist, 'remote-components/timeline', file))
  ])
  if (!source.equals(built)) throw Error(`Stale shipped asset: ${resolve(dist, 'remote-components/timeline', file)}`)
}
for (const file of ['index.cjs.js', 'index.esm.js', 'index.d.ts', 'README.md', 'docs/data-contract.md'])
  await readFile(resolve(dist, file))
const manifestFile = '.xpertai-plugin/plugin.json'
const [sourceManifest, builtManifest] = await Promise.all([
  readFile(resolve(pluginRoot, manifestFile)),
  readFile(resolve(dist, manifestFile))
])
if (!sourceManifest.equals(builtManifest)) throw Error('Shipped plugin asset manifest is stale')
const manifest = JSON.parse(builtManifest.toString())
for (const file of new Set([manifest.assets.logo, manifest.assets.composerIcon].filter(Boolean))) {
  const [source, built] = await Promise.all([readFile(resolve(pluginRoot, file)), readFile(resolve(dist, file))])
  if (!source.equals(built)) throw Error(`Stale shipped App icon: ${file}`)
}
for (const file of manifest.assets.screenshots) {
  const [source, built] = await Promise.all([readFile(resolve(pluginRoot, file)), readFile(resolve(dist, file))])
  if (!source.equals(built)) throw Error(`Stale shipped App screenshot: ${file}`)
  if (!built.length || built.length > 5 * 1024 * 1024)
    throw Error(`App screenshot exceeds the host inline asset limit: ${file}`)
}
console.log(
  'Execution observability: generated and shipped View assets, App cover and portable manifest match; package entries and documentation present.'
)
