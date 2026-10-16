import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { build, summarizeTasks } from './build.mjs'

test('timings distinguish executed tasks, cache restoration and failures', () => {
  assert.deepEqual(
    summarizeTasks([
      { ph: 'M', name: 'thread_name' },
      ...['success', 'local-cache', 'failure'].map((status) => ({
        ph: 'X',
        name: `api:${status}`,
        dur: 1250000,
        args: { target: { project: 'api' }, status }
      }))
    ]),
    ['success', 'local-cache', 'failure'].map((status) => ({
      task: `api:${status}`,
      durationMs: 1250,
      status
    }))
  )
})

test('build runner preserves compiler failures and writes a fresh failure report', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'api-build-test-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(join(root, 'node_modules/nx/bin'), { recursive: true })
  mkdirSync(join(root, '.nx/api-build'), { recursive: true })
  writeFileSync(join(root, '.nx/api-build/tasks.json'), JSON.stringify([{ ph: 'X', args: { target: {} } }]))
  writeFileSync(join(root, '.nx/api-build/webpack.json'), '{}')
  writeFileSync(join(root, 'node_modules/nx/bin/nx.js'), 'process.exit(7)')
  assert.equal(await build(root), 7)
  const summary = JSON.parse(readFileSync(join(root, '.nx/api-build/summary.json')))
  assert.equal(summary.exitCode, 7)
  assert.deepEqual(summary.tasks, [])
  assert.throws(() => readFileSync(join(root, '.nx/api-build/webpack.json')), { code: 'ENOENT' })
})

test('API and compatibility commands share the single remote UI owner', () => {
  const read = (path) => JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url)))
  const api = read('apps/api/project.json').targets
  const server = read('packages/server-ai/project.json').targets
  assert.deepEqual(api.build.dependsOn, ['^build'])
  assert.equal(api.build.configurations.production.buildLibsFromSource, false)
  assert.equal(api.build.configurations.development.buildLibsFromSource, undefined)
  assert.equal(api.build.options.buildLibsFromSource, undefined)
  for (const name of ['build-agent-results', 'build-coding-execution', 'build-conversation-map']) {
    assert.equal(api[name].executor, 'nx:noop')
    assert.deepEqual(api[name].dependsOn, [{ target: 'build-remote-components', projects: ['server-ai'] }])
    assert.equal(api[name].outputs, undefined)
  }
  assert.equal(server['build-remote-components'].cache, true)
  assert.deepEqual(server['build-remote-components'].dependsOn, [{ target: 'build', projects: ['plugin-sdk'] }])
  for (const extension of ['js', 'css']) {
    assert.ok(
      server['build-remote-components'].inputs.includes(`!{projectRoot}/src/**/remote-components/**/app.${extension}`)
    )
  }
})
