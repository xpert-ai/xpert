// Invariants: one Nx graph owns API, plugin and UI builds. Keep type checking on.
// Profiles describe task execution/cache restoration, not Docker install/export time.
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { performance } from 'node:perf_hooks'
import { getHeapStatistics } from 'node:v8'

export function summarizeTasks(events) {
  return events
    .filter((event) => event.ph === 'X' && event.args?.target)
    .map((event) => ({
      task: event.name,
      durationMs: event.dur / 1000,
      status: event.args.status
    }))
}

export async function build(root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')) {
  const reportDir = join(root, '.nx/api-build')
  mkdirSync(reportDir, { recursive: true })
  const trace = join(reportDir, 'tasks.json')
  rmSync(trace, { force: true })
  rmSync(join(reportDir, 'webpack.json'), { force: true })
  console.log('API build V8 heap limit (MiB):', getHeapStatistics().heap_size_limit / 1024 / 1024)
  const start = performance.now()
  const child = spawn(
    process.execPath,
    [
      join(root, 'node_modules/nx/bin/nx.js'),
      'run-many',
      '-t',
      'build',
      '-p',
      'api,cli-model-profiles,vlm-default,draft',
      '--parallel=2',
      '--outputStyle=static'
    ],
    {
      cwd: root,
      stdio: 'inherit',
      env: {
        ...process.env,
        NX_DAEMON: 'false',
        NX_PROFILE: relative(root, trace),
        API_BUILD_PROFILE_DIR: relative(root, reportDir)
      }
    }
  )
  const forward = (signal) => child.kill(signal)
  const terminate = () => forward('SIGTERM')
  const interrupt = () => forward('SIGINT')
  process.on('SIGTERM', terminate)
  process.on('SIGINT', interrupt)
  let exitCode
  try {
    exitCode = await new Promise((resolve, reject) => {
      child.on('error', reject)
      child.on('close', (code) => resolve(code ?? 1))
    })
  } finally {
    process.off('SIGTERM', terminate)
    process.off('SIGINT', interrupt)
  }
  let tasks = []
  try {
    tasks = summarizeTasks(JSON.parse(readFileSync(trace, 'utf8')))
  } catch (error) {
    console.warn(`Nx task profile unavailable: ${error.message}`)
  }
  const report = { durationMs: Math.round(performance.now() - start), exitCode, node: process.version, tasks }
  writeFileSync(join(reportDir, 'summary.json'), `${JSON.stringify(report, null, 2)}\n`)
  console.table(tasks)
  console.log(`[api-build] ${report.durationMs} ms; exit ${exitCode}; report .nx/api-build/summary.json`)
  return exitCode
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await build()
}
