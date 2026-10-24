// Freeze a single local candidate before regression. No server startup, installation,
// migration, publishing or model execution is part of this build.
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { parse } from 'yaml'
const require = createRequire(import.meta.url)
const root = process.cwd(),
  output = path.resolve(process.argv[2])
if (execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim())
  throw Error('Commit candidate sources before building')
if (fs.existsSync(output)) throw Error('Use a new candidate directory')
fs.mkdirSync(output, { recursive: true })
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const receipt = {
  commit,
  node: process.version,
  platform: `${process.platform}/${process.arch}`,
  steps: [],
  artifacts: []
}
const save = () => fs.writeFileSync(`${output}/manifest.json`, JSON.stringify(receipt, null, 2) + '\n')
function run(name, file, args, cwd = root, extraEnv = {}) {
  const log = fs.openSync(`${output}/${name}.log`, 'w')
  const started = new Date().toISOString()
  try {
    execFileSync(file, args, {
      cwd,
      env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=12288', ...extraEnv },
      stdio: ['ignore', log, log]
    })
    receipt.steps.push({ name, started, status: 'passed' })
    save()
    console.log(`PASS ${name}`)
  } catch (error) {
    receipt.steps.push({ name, started, status: 'failed' })
    save()
    throw error
  } finally {
    fs.closeSync(log)
  }
}
const node = (name, script, args = []) => run(name, process.execPath, [script, ...args])
node('packages', 'tools/testing/pipeline-candidate/packages.mjs', [output])
node('consumer', 'tools/testing/pipeline-candidate/consumer.mjs', [output])
node('remote', 'packages/server-ai/scripts/build-remote-components.mjs')
run('remote-types', 'corepack', [
  'pnpm',
  'exec',
  'tsc',
  '-p',
  'packages/server-ai/src/xpert-project/remote-components/project-tasks/tsconfig.check.json'
])
node('api', 'tools/testing/pipeline-candidate/server.mjs', [output])
run(
  'api-lock',
  'corepack',
  ['pnpm', 'install', '--prod', '--lockfile-only', '--ignore-scripts', '--offline'],
  `${output}/api`
)
// Workspace links/version metadata may change; third-party versions must not drift.
const original = parse(fs.readFileSync('.deploy/api/pnpm-lock.production.yaml', 'utf8'))
const candidate = parse(fs.readFileSync(`${output}/api/pnpm-lock.yaml`, 'utf8'))
if (Object.keys(candidate.packages).some((key) => !original.packages[key]))
  throw Error('Unreviewed runtime dependency version')
run('api-install', 'corepack', ['pnpm', 'install', '--prod', '--frozen-lockfile', '--ignore-scripts'], `${output}/api`)
run(
  'api-load',
  process.execPath,
  [
    '-e',
    `require('reflect-metadata');const c=require('@xpert-ai/contracts'),s=require('@xpert-ai/plugin-sdk');if(c.projectPipelineContributionSchema!==s.projectPipelineContributionSchema)throw Error('Duplicate schema');require('./packages/server-ai/src/xpert-project/pipeline/projection/pipeline-projection.service.js');console.log('PASS: compiled API pipeline loads with one Contracts implementation')`
  ],
  `${output}/api`,
  { NODE_ENV: 'test' }
)
node('cloud', 'tools/testing/pipeline-candidate/cloud.mjs')
node('desktop-native', 'apps/desktop/scripts/build-audio-capture-native.mjs')
run('desktop-types', 'corepack', ['pnpm', 'exec', 'tsc', '--noEmit'], `${root}/apps/desktop`)
run('desktop-renderer', 'corepack', ['pnpm', 'exec', 'vite', 'build'], `${root}/apps/desktop`)
require('../../../.deploy/desktop/dependencies.cjs').prepare(`${output}/desktop-stage`, true)
fs.cpSync('apps/desktop/dist', `${output}/desktop-stage/apps/desktop/dist`, { recursive: true })
fs.cpSync('packages/contracts/dist', `${output}/desktop-stage/packages/contracts/dist`, { recursive: true })
run(
  'desktop-install',
  'corepack',
  ['pnpm', 'install', '--prod', '--frozen-lockfile', '--ignore-scripts', '--offline'],
  `${output}/desktop-stage`
)
run('desktop-package', 'corepack', ['pnpm', 'exec', 'node', 'tools/testing/pipeline-candidate/desktop.mjs', output])
fs.cpSync('dist/apps/cloud', `${output}/cloud`, { recursive: true })
for (const [name, cwd, args] of [
  ['api', output, ['--exclude=node_modules', 'api']],
  ['cloud', output, ['cloud']],
  ['desktop-mac-arm64', `${output}/desktop`, ['mac-arm64']]
])
  run(`archive-${name}`, 'tar', ['-czf', `${output}/${name}.tar.gz`, ...args], cwd)
for (const file of fs.readdirSync(output).filter((file) => /\.(tgz|tar.gz)$/.test(file))) {
  receipt.artifacts.push({
    file,
    bytes: fs.statSync(`${output}/${file}`).size,
    sha256: createHash('sha256')
      .update(fs.readFileSync(`${output}/${file}`))
      .digest('hex')
  })
}
receipt.dependencies = Object.fromEntries(
  ['@xpert-ai/chatkit-ui', '@xpert-ai/chatkit-types', '@xpert-ai/chatkit-web-component'].map((name) => {
    const pkg = JSON.parse(fs.readFileSync(`node_modules/${name}/package.json`))
    return [name, pkg.version]
  })
)
receipt.runtimeLockSha256 = createHash('sha256')
  .update(fs.readFileSync(`${output}/api/pnpm-lock.yaml`))
  .digest('hex')
save()
console.log('Candidate artifacts frozen; no deployment or push performed')
