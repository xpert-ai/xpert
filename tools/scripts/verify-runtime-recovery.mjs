#!/usr/bin/env node
// Own disposable PostgreSQL/Redis only. Never use the platform's business database or queue.
import { spawn, execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, open, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const output = await mkdtemp(join(tmpdir(), 'xpert-runtime-recovery-'))
const containers = []
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
try {
  const suffix = randomUUID().slice(0, 8)
  const pg = `xpert-recovery-test-pg-${suffix}`,
    redis = `xpert-recovery-test-redis-${suffix}`
  for (const [name, port, image, args] of [
    [
      pg,
      5432,
      'postgres:16-alpine',
      ['-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-e', 'POSTGRES_DB=xpert_execution_test_recovery']
    ],
    [redis, 6379, 'redis:7-alpine', []]
  ]) {
    docker(
      'run',
      '-d',
      '--name',
      name,
      '--label',
      'ai.xpert.test=runtime-recovery',
      '-p',
      `127.0.0.1::${port}`,
      ...args,
      image,
      ...(port === 6379 ? ['redis-server', '--appendonly', 'yes', '--appendfsync', 'always'] : [])
    )
    containers.push(name)
  }
  for (let i = 0; i < 60; i++) {
    try {
      docker('exec', pg, 'pg_isready', '-U', 'postgres')
      docker('exec', redis, 'redis-cli', 'ping')
      break
    } catch {
      if (i === 59) throw new Error('Test infrastructure did not become ready')
      await delay(500)
    }
  }
  const port = (name, internal) => docker('port', name, `${internal}/tcp`).split(':').at(-1)
  const log = await open(join(output, 'tests.log'), 'w', 0o600)
  const code = await new Promise((resolve, reject) => {
    const child = spawn(
      'corepack',
      [
        'pnpm',
        'exec',
        'nx',
        'run',
        'server-ai:test',
        '--skipNxCache',
        '--runInBand',
        '--testFile=packages/server-ai/src/xpert-project/runtime/project-task-dispatch.integration.spec.ts'
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          NX_DAEMON: 'false',
          XPERT_EXECUTION_TEST_DATABASE_URL: `postgres://postgres@127.0.0.1:${port(pg, 5432)}/xpert_execution_test_recovery`,
          XPERT_EXECUTION_TEST_REDIS_URL: `redis://127.0.0.1:${port(redis, 6379)}`,
          XPERT_EXECUTION_TEST_REDIS_CONTAINER: redis
        },
        stdio: ['ignore', log.fd, log.fd]
      }
    )
    child.once('error', reject)
    child.once('exit', resolve)
  })
  await log.close()
  await writeFile(
    join(output, 'verification.json'),
    JSON.stringify(
      {
        passed: code === 0,
        completedAt: new Date().toISOString(),
        boundaries:
          'Real PostgreSQL, Redis restart, killed worker processes; deterministic authorization and model boundaries.'
      },
      null,
      2
    ),
    { mode: 0o600 }
  )
  console.log(JSON.stringify({ passed: code === 0, log: join(output, 'tests.log') }))
  process.exitCode = code === 0 ? 0 : 1
} finally {
  for (const container of containers.reverse()) docker('rm', '-f', '-v', container)
}
