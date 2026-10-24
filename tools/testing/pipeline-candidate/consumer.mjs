// Consume unpacked tarballs through public package exports, never workspace aliases.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const output = path.resolve(process.argv[2]),
  consumer = path.join(output, 'consumer')
fs.mkdirSync(`${consumer}/node_modules/@xpert-ai`, { recursive: true })
for (const name of fs.readdirSync('node_modules')) {
  if (name === '.bin' || name === '@xpert-ai') continue
  const dest = `${consumer}/node_modules/${name}`
  if (!fs.existsSync(dest)) fs.symlinkSync(path.resolve('node_modules', name), dest)
}
for (const name of fs.readdirSync('node_modules/@xpert-ai')) {
  if (['contracts', 'plugin-sdk'].includes(name)) continue
  const dest = `${consumer}/node_modules/@xpert-ai/${name}`
  if (!fs.existsSync(dest)) fs.symlinkSync(path.resolve('node_modules/@xpert-ai', name), dest)
}
for (const name of ['contracts', 'plugin-sdk']) {
  const files = fs.readdirSync(output).filter((file) => file.startsWith(`xpert-ai-${name}-`) && file.endsWith('.tgz'))
  assert.equal(files.length, 1, 'Use one frozen candidate package pair')
  const dest = `${consumer}/node_modules/@xpert-ai/${name}`
  fs.rmSync(dest, { force: true, recursive: true })
  fs.mkdirSync(dest)
  execFileSync('tar', ['-xzf', path.join(output, files[0]), '--strip-components=1', '-C', dest])
}
const checks = `
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const c = require('@xpert-ai/contracts'), s = require('@xpert-ai/plugin-sdk');
assert.equal(s.projectPipelineContributionSchema, c.projectPipelineContributionSchema);
const contractsManifest = require('@xpert-ai/contracts/package.json');
const sdkManifest = require('@xpert-ai/plugin-sdk/package.json');
assert.equal(sdkManifest.dependencies['@xpert-ai/contracts'], contractsManifest.version);
assert.equal((await import('@xpert-ai/plugin-sdk')).projectPipelineContributionSchema, (await import('@xpert-ai/contracts')).projectPipelineContributionSchema);
assert.equal(c.projectPipelineContributionSchema.safeParse({}).success, false);
for (const name of ['contracts', 'plugin-sdk']) {
  const manifest = require('@xpert-ai/' + name + '/package.json');
  for (const key of Object.keys(manifest.exports)) {
    if (key === './package.json') continue;
    const specifier = '@xpert-ai/' + name + (key === '.' ? '' : key.slice(1));
    const cjs = require(specifier), esm = await import(specifier);
    assert.ok(Object.keys(cjs).length || key === './connector');
    if (key === '.') assert.equal(typeof esm.projectPipelineContributionSchema.safeParse, 'function');
    console.log('CJS + ESM:', specifier);
  }
}
`
fs.writeFileSync(`${consumer}/runtime.mjs`, checks)
execFileSync(process.execPath, [`${consumer}/runtime.mjs`], { stdio: 'inherit' })
fs.copyFileSync('packages/plugin-sdk/testing/pipeline-declarations.consumer.ts', `${consumer}/consumer.ts`)
for (const [module, moduleResolution] of [
  ['commonjs', 'node'],
  ['NodeNext', 'NodeNext'],
  ['esnext', 'bundler']
]) {
  const config = `${consumer}/tsconfig.json`
  fs.writeFileSync(
    config,
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        target: 'es2022',
        module,
        moduleResolution,
        types: []
      },
      files: ['./consumer.ts']
    })
  )
  execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', config], { stdio: 'inherit' })
  console.log('Strict consumer:', moduleResolution)
}
