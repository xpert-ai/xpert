// Run against committed snapshots in disposable directories. Never edit the checkout.
// Source-change scenarios reuse Docker layers, not an artificially warm Nx directory.
import { spawnSync, spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, openSync, closeSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { performance } from 'node:perf_hooks'

export function compilationTimings(log) {
  const steps = new Map()
  const durations = new Map()
  for (const line of log.split('\n')) {
    const command = line.match(/^#(\d+) \[.*\] RUN (.*)/)
    if (command && /(?:pnpm build:plugins|pnpm nx build api|node \.deploy\/api\/build\.mjs)/.test(command[2])) {
      steps.set(command[1], command[2])
    }
    const done = line.match(/^#(\d+) DONE ([\d.]+)s/)
    if (done) durations.set(done[1], Number(done[2]))
  }
  if (!steps.size) throw new Error('No API compilation steps found')
  const result = [...steps].map(([id, command]) => {
    if (!durations.has(id)) throw new Error(`Compilation step ${id} did not execute successfully (possibly cached)`)
    return { command, seconds: durations.get(id) }
  })
  return { seconds: result.reduce((sum, step) => sum + step.seconds, 0), steps: result }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr || result.status}`)
  return result.stdout?.trim()
}

async function build(context, logFile, platform, cold) {
  const output = openSync(logFile, 'w')
  const args = [
    'buildx',
    'build',
    '--platform',
    platform,
    '--target',
    'build',
    '--progress=plain',
    '--output=type=cacheonly',
    '-f',
    '.deploy/api/Dockerfile'
  ]
  if (cold) args.push('--no-cache-filter', 'build')
  args.push('.')
  const started = performance.now()
  try {
    await new Promise((resolve, reject) => {
      const child = spawn('docker', args, { cwd: context, stdio: ['ignore', output, output] })
      child.on('error', reject)
      child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`Docker build failed; see ${logFile}`))))
    })
  } finally {
    closeSync(output)
  }
  return {
    dockerSeconds: Math.round((performance.now() - started) / 100) / 10,
    compilation: compilationTimings(readFileSync(logFile, 'utf8'))
  }
}

async function benchmark() {
  const { values } = parseArgs({
    options: {
      baseline: { type: 'string' },
      candidate: { type: 'string', default: 'HEAD' },
      platform: { type: 'string', default: 'linux/amd64' },
      output: { type: 'string' }
    }
  })
  if (!values.baseline)
    throw new Error(
      'Usage: node .deploy/api/benchmark-build.mjs --baseline <commit> [--candidate HEAD] [--platform linux/arm64] [--output <directory>]'
    )
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
  const baseline = run('git', ['rev-parse', '--verify', `${values.baseline}^{commit}`], { cwd: root })
  const candidate = run('git', ['rev-parse', '--verify', `${values.candidate}^{commit}`], { cwd: root })
  const read = (ref, file) => run('git', ['show', `${ref}:${file}`], { cwd: root })
  if (read(baseline, '.deploy/api/pnpm-lock.build.yaml') !== read(candidate, '.deploy/api/pnpm-lock.build.yaml')) {
    throw new Error('Compare commits with identical API build dependency locks')
  }
  const output = values.output ? resolve(values.output) : mkdtempSync(join(tmpdir(), 'xpert-api-benchmark-'))
  mkdirSync(output, { recursive: true })
  const work = mkdtempSync(join(tmpdir(), 'xpert-api-benchmark-context-'))
  const results = {
    baseline,
    candidate,
    platform: values.platform,
    docker: run('docker', ['version', '--format', '{{.Server.Version}}']),
    scenarios: []
  }
  console.log(`Benchmark reports: ${output}`)
  try {
    for (const [label, revision] of [
      ['baseline', baseline],
      ['candidate', candidate]
    ]) {
      const context = join(work, label)
      mkdirSync(context)
      const archive = join(work, `${label}.tar`)
      const fd = openSync(archive, 'w')
      try {
        run('git', ['archive', revision], { cwd: root, stdio: ['ignore', fd, 'pipe'] })
      } finally {
        closeSync(fd)
      }
      run('tar', ['-xf', archive, '-C', context])
      const api = join(context, 'apps/api/src/main.ts')
      const server = join(context, 'packages/server-ai/src/index.ts')
      const apiSource = readFileSync(api, 'utf8')
      const serverSource = readFileSync(server, 'utf8')
      for (const scenario of ['cold', 'api-only', 'server-ai-only']) {
        writeFileSync(api, apiSource + (scenario === 'api-only' ? `\n// API compile benchmark ${candidate}\n` : ''))
        writeFileSync(
          server,
          serverSource + (scenario === 'server-ai-only' ? `\n// server-ai compile benchmark ${candidate}\n` : '')
        )
        const logFile = join(output, `${label}-${scenario}.log`)
        console.log(`${label}: ${scenario} (${revision.slice(0, 12)})`)
        const timing = await build(context, logFile, values.platform, scenario === 'cold')
        results.scenarios.push({ label, scenario, ...timing })
        writeFileSync(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`)
        console.log(`Compilation: ${timing.compilation.seconds.toFixed(1)}s; Docker: ${timing.dockerSeconds}s`)
      }
    }
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await benchmark()
