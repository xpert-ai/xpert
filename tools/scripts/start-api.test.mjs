import assert from 'node:assert/strict'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { test } from 'node:test'
import { runApiWorkflow, runCommand } from './start-api.mjs'

function recordRuns(failAt) {
  const calls = []
  return {
    calls,
    run: async (command, args, options) => {
      calls.push({ command, args, options })
      if (calls.length === failAt) throw new Error('Fixture failure')
    },
    log: () => {}
  }
}

function actions(calls) {
  return calls.map(({ args }) =>
    args.includes('--action') ? args.at(-1) : args[0].endsWith('main.js') ? 'serve' : args.join(' ')
  )
}

test('every startup builds migration assets, applies and verifies before serving the same bundle', async () => {
  const fixture = recordRuns()
  for (let attempt = 0; attempt < 2; attempt++) await runApiWorkflow(fixture)
  const expected = ['pnpm b:p:all', 'pnpm nx build api --configuration=development', 'apply', 'verify', 'serve']
  assert.deepEqual(actions(fixture.calls), [...expected, ...expected])
  assert.equal(fixture.calls[2].args[0], fixture.calls[4].args[0])
  assert.equal(fixture.calls[3].args[0], fixture.calls[4].args[0])
  assert.ok(fixture.calls.every(({ options }) => options.env.NODE_ENV === 'development'))
})

for (const [index, name] of ['libraries', 'API build', 'apply', 'verify'].entries()) {
  test(`${name} failure stops startup without serving or adopting a baseline`, async () => {
    const fixture = recordRuns(index + 1)
    await assert.rejects(runApiWorkflow(fixture), /failed; API was not started/)
    assert.equal(fixture.calls.length, index + 1)
    assert.ok(!actions(fixture.calls).includes('serve'))
    assert.ok(!actions(fixture.calls).includes('baseline'))
  })
}

test('schema maintenance exits after verification; baseline adoption is explicit and must pass', async () => {
  const schema = recordRuns()
  await runApiWorkflow({ ...schema, mode: 'schema' })
  assert.deepEqual(actions(schema.calls).slice(2), ['apply', 'verify'])
  const baseline = recordRuns()
  await runApiWorkflow({ ...baseline, mode: 'baseline' })
  assert.deepEqual(actions(baseline.calls).slice(2), ['baseline', 'apply', 'verify'])
  const failure = recordRuns(3)
  await assert.rejects(runApiWorkflow({ ...failure, mode: 'baseline' }), /Fixture failure/)
  assert.deepEqual(actions(failure.calls).slice(2), ['baseline'])
})

test('debug only opens the inspector on the final API, preserving the schema gate', async () => {
  const fixture = recordRuns()
  await runApiWorkflow({ ...fixture, inspect: true })
  assert.ok(fixture.calls.slice(0, -1).every(({ args }) => !args.some((arg) => arg.startsWith('--inspect'))))
  assert.equal(fixture.calls.at(-1).args[0], '--inspect=127.0.0.1:9229')
  assert.equal(fixture.calls.at(-1).args[1], fixture.calls[2].args[0])
})

test('cancellation between stages never proceeds to database mutation or serving', async () => {
  const controller = new AbortController()
  let count = 0
  await assert.rejects(
    runApiWorkflow({
      signal: controller.signal,
      log: () => {},
      run: async () => {
        count++
        controller.abort(new Error('Fixture cancellation'))
      }
    }),
    /Fixture cancellation/
  )
  assert.equal(count, 1)
})

test('real subprocess exit codes and missing executables reject the gate', async () => {
  const options = { cwd: process.cwd(), env: process.env, stdio: 'ignore' }
  await runCommand(process.execPath, ['-e', 'process.exit(0)'], options)
  await assert.rejects(runCommand(process.execPath, ['-e', 'process.exit(7)'], options), /7/)
  await assert.rejects(runCommand('xpert-nonexistent-command-fixture', [], options), /ENOENT/)
})

async function waitFor(check) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await check()) return
    await delay(50)
  }
  assert.fail('Timed out waiting for subprocess fixture')
}

function isAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if (error.code === 'ESRCH') return false
    throw error
  }
}

test(
  'restart cancellation kills the child and a descendant that ignores SIGTERM',
  {
    skip: process.platform === 'win32',
    timeout: 15_000
  },
  async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'xpert-api-start-'))
    const pidFile = path.join(directory, 'ready.json')
    const controller = new AbortController()
    const descendant = `
    process.on('SIGTERM', () => {});
    require('node:fs').writeFileSync(process.env.FIXTURE_PID_FILE, JSON.stringify([process.ppid, process.pid]));
    setInterval(() => {}, 1000);
  `
    const parent = `
    require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}], { stdio: 'ignore' });
    setInterval(() => {}, 1000);
  `
    const running = runCommand(process.execPath, ['-e', parent], {
      cwd: directory,
      env: { ...process.env, FIXTURE_PID_FILE: pidFile },
      signal: controller.signal,
      stdio: 'ignore'
    })
    const rejected = assert.rejects(running, /Fixture restart/)
    let pids = []
    try {
      await waitFor(async () => {
        try {
          pids = JSON.parse(await readFile(pidFile, 'utf8'))
          return true
        } catch {
          return false
        }
      })
      controller.abort(new Error('Fixture restart'))
      await rejected
      await waitFor(() => pids.every((pid) => !isAlive(pid)))
    } finally {
      if (!controller.signal.aborted) controller.abort(new Error('Fixture restart'))
      await rejected
      for (const pid of pids) if (isAlive(pid)) process.kill(pid, 'SIGKILL')
      await rm(directory, { recursive: true, force: true })
    }
  }
)

test('supported local entrypoints and watched SQL use the gate without watching generated bundles', async () => {
  const readJson = async (relative) => JSON.parse(await readFile(new URL(`../../${relative}`, import.meta.url), 'utf8'))
  const { scripts } = await readJson('package.json')
  const normal = await readJson('nodemon.json')
  const debug = await readJson('nodemon-debug.json')
  assert.equal(scripts['start:api'], 'nodemon --config nodemon.json')
  assert.equal(scripts['start:api:dev'], 'pnpm start:api')
  assert.equal(scripts['start:api:debug'], 'nodemon --config nodemon-debug.json')
  assert.equal(normal.exec, 'node tools/scripts/start-api.mjs')
  assert.equal(debug.exec, `${normal.exec} --inspect`)
  for (const config of [normal, debug]) {
    assert.equal(config.signal, 'SIGTERM')
    assert.ok(config.ext.split(',').includes('sql'))
    assert.ok(config.watch.includes('.deploy/api/database-migrations.json'))
    assert.ok(config.watch.includes('packages/contracts/src'))
    assert.ok(config.ignore.includes('**/dist/**'))
    assert.ok(config.ignore.includes('**/remote-components/**/app.js'))
  }
})

test(
  'real nodemon restarts rerun the gate for SQL changes and never serve after a failed upgrade',
  {
    skip: process.platform === 'win32',
    timeout: 30_000
  },
  async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'xpert-api-watch-'))
    const eventsFile = path.join(root, 'events.jsonl')
    const sqlFile = path.join(root, 'packages/server/src/example/migrations/change.sql')
    const outputFile = path.join(root, 'packages/server-ai/src/example/remote-components/view/app.js')
    const failureFile = path.join(root, 'fail-apply')
    const events = async () => {
      try {
        return (await readFile(eventsFile, 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse)
      } catch (error) {
        if (error.code === 'ENOENT') return []
        throw error
      }
    }
    const record = `
    const fs = require('node:fs');
    const record = stage => fs.appendFileSync(process.env.FIXTURE_EVENTS, JSON.stringify({stage, pid: process.pid, parent: process.ppid}) + '\\n');
  `
    let watcher
    let closed
    let output = ''
    try {
      for (const dir of [
        'bin',
        'tools/scripts',
        'dist/apps/api',
        path.dirname(path.relative(root, sqlFile)),
        path.dirname(path.relative(root, outputFile))
      ]) {
        await mkdir(path.join(root, dir), { recursive: true })
      }
      await copyFile(new URL('./start-api.mjs', import.meta.url), path.join(root, 'tools/scripts/start-api.mjs'))
      await copyFile(new URL('../../nodemon.json', import.meta.url), path.join(root, 'nodemon.json'))
      await writeFile(sqlFile, '-- initial\n')
      await writeFile(outputFile, '// initial\n')
      // Exercise the real launcher/watcher with harmless build and database commands.
      await writeFile(
        path.join(root, 'bin/corepack'),
        `#!/usr/bin/env node\n${record}
      record(process.argv.includes('b:p:all') ? 'build-libraries' : 'build-api');
    `,
        { mode: 0o755 }
      )
      await writeFile(
        path.join(root, 'dist/apps/api/main.js'),
        `${record}
      const actionIndex = process.argv.indexOf('--action');
      const action = actionIndex < 0 ? 'serve' : process.argv[actionIndex + 1];
      record(action);
      if (action === 'apply' && fs.existsSync(process.env.FIXTURE_FAILURE)) process.exit(7);
      if (action === 'serve') setInterval(() => {}, 1000);
    `
      )
      const require = createRequire(import.meta.url)
      watcher = spawn(process.execPath, [require.resolve('nodemon/bin/nodemon.js'), '--config', 'nodemon.json'], {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${path.join(root, 'bin')}${path.delimiter}${process.env.PATH}`,
          FIXTURE_EVENTS: eventsFile,
          FIXTURE_FAILURE: failureFile
        },
        stdio: ['ignore', 'pipe', 'pipe']
      })
      watcher.stdout.on('data', (data) => {
        output += data
      })
      watcher.stderr.on('data', (data) => {
        output += data
      })
      closed = new Promise((resolve) => watcher.once('close', resolve))
      await waitFor(async () => (await events()).filter(({ stage }) => stage === 'serve').length === 1)
      await delay(300)
      await writeFile(outputFile, '// generated bundle must not restart startup\n')
      await delay(500)
      assert.equal((await events()).length, 5, output)
      await writeFile(sqlFile, '-- source change\n')
      await waitFor(async () => (await events()).filter(({ stage }) => stage === 'serve').length === 2)
      const expected = ['build-libraries', 'build-api', 'apply', 'verify', 'serve']
      assert.deepEqual(
        (await events()).map(({ stage }) => stage),
        [...expected, ...expected],
        output
      )
      const previousApi = (await events())[4].pid
      assert.equal(isAlive(previousApi), false, 'previous API must exit before its replacement starts')
      await writeFile(failureFile, 'fail')
      await writeFile(sqlFile, '-- failing migration\n')
      await waitFor(() => output.includes('app crashed'))
      assert.deepEqual(
        (await events()).map(({ stage }) => stage),
        [...expected, ...expected, 'build-libraries', 'build-api', 'apply'],
        output
      )
      assert.equal(isAlive((await events())[9].pid), false)
    } finally {
      watcher?.kill('SIGTERM')
      if (closed) await closed
      // Best-effort cleanup also covers assertion failures in the fixture.
      for (const event of await events()) {
        for (const pid of [event.pid, event.parent]) {
          if (pid !== process.pid && isAlive(pid)) process.kill(pid, 'SIGKILL')
        }
      }
      await rm(root, { recursive: true, force: true })
    }
  }
)
