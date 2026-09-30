import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { isPlatformReleaseRef, releaseSources, waitForRuntimeRelease } from './runtime-platform-release.mjs'

const sha = 'a'.repeat(40)
const repository = 'xpert-ai/xpert'
const script = fileURLToPath(new URL('./runtime-platform-release.mjs', import.meta.url))
const matrix = {
  include: ['browser', 'document'].map((family) => ({
    family,
    versionTag: `1.3.0-${family}`,
    repositories: {
      ghcr: `ghcr.io/xpert-ai/xpert-sandbox-${family}`,
      dockerhub: `metadc/xpert-sandbox-${family}`,
      acr: `registry.cn-hangzhou.aliyuncs.com/metad/xpert-sandbox-${family}`
    }
  }))
}
const sources = releaseSources(matrix)
const publisher = (status, conclusion = null) => ({
  id: 42,
  head_sha: sha,
  head_branch: 'main',
  event: 'push',
  status,
  conclusion,
  html_url: 'https://github.com/xpert-ai/xpert/actions/runs/42'
})
const defaults = { matrix, repository, sha, log: () => {} }

test('only platform versions are eligible for aliases', () => {
  for (const tag of ['3.18.7', 'v3.18.7', '3.19.0-rc.1', 'v3.19.0-beta-test.0']) {
    assert.equal(isPlatformReleaseRef(`refs/tags/${tag}`), true, tag)
  }
  for (const tag of [
    'desktop-v0.2.0',
    '@xpert-ai/sdk@1.0.0',
    'latest',
    '3.18',
    '3.18.07',
    '3.18.7-01',
    '3.18.7-rc..1',
    '3.18.7+build.1',
    `3.18.7-${'a'.repeat(128)}`
  ]) {
    assert.equal(isPlatformReleaseRef(`refs/tags/${tag}`), false, tag)
  }
  assert.equal(isPlatformReleaseRef('refs/heads/3.18.7'), false)
  assert.equal(isPlatformReleaseRef(undefined), false)
})

test('source preflight includes all families and registries, rejecting an empty or malformed matrix', () => {
  assert.equal(sources.length, 6)
  assert.ok(sources.includes('registry.cn-hangzhou.aliyuncs.com/metad/xpert-sandbox-document:1.3.0-document'))
  for (const invalid of [
    {},
    { include: [] },
    { include: [{ versionTag: '1.3.0', repositories: {} }] },
    { include: [{ versionTag: '1.3.0+build', repositories: matrix.include[0].repositories }] }
  ]) {
    assert.throws(() => releaseSources(invalid), /Runtime/)
  }
})

test('an already published Runtime version does not need a publisher for this platform commit', async () => {
  const inspected = []
  await waitForRuntimeRelease({
    ...defaults,
    inspect: async (source) => {
      inspected.push(source)
      return true
    },
    listRuns: async () => {
      assert.fail('Existing releases must not wait for another publication')
    }
  })
  assert.deepEqual(inspected, sources)
})

test('a tag arriving during publication waits and rechecks every registry after success', async () => {
  let tick = 0
  const inspected = []
  await waitForRuntimeRelease({
    ...defaults,
    inspect: async (source) => {
      inspected.push(source)
      return tick === 2
    },
    listRuns: async () => [
      publisher(tick === 0 ? 'queued' : tick === 1 ? 'in_progress' : 'completed', tick === 2 ? 'success' : null)
    ],
    pause: async () => {
      tick++
    }
  })
  assert.equal(tick, 2)
  assert.deepEqual(inspected, [...sources, ...sources])
})

test('a successful publisher with even one missing registry blocks all aliases', async () => {
  await assert.rejects(
    waitForRuntimeRelease({
      ...defaults,
      inspect: async (source) => source !== sources[5],
      listRuns: async () => [publisher('completed', 'success')]
    }),
    /completed without all required version tags[\s\S]*aliyuncs\.com\/metad\/xpert-sandbox-document/
  )
})

test('failed or cancelled publishers stop waiting and report the upstream run', async () => {
  for (const conclusion of ['failure', 'cancelled', 'timed_out']) {
    await assert.rejects(
      waitForRuntimeRelease({
        ...defaults,
        inspect: async () => false,
        listRuns: async () => [publisher('completed', conclusion)],
        pause: async () => {
          assert.fail('A failed release must not keep polling')
        }
      }),
      new RegExp(`did not succeed[\\s\\S]*actions/runs/42[\\s\\S]*${conclusion}[\\s\\S]*Missing Runtime sources`)
    )
  }
})

test('unrelated commits, branches and pull requests cannot satisfy the release dependency', async () => {
  await assert.rejects(
    waitForRuntimeRelease({
      ...defaults,
      inspect: async () => false,
      listRuns: async () => [
        { ...publisher('completed', 'success'), head_sha: 'b'.repeat(40) },
        { ...publisher('completed', 'success'), head_branch: 'develop' },
        { ...publisher('completed', 'success'), event: 'pull_request' }
      ]
    }),
    /No publish-npm-packages.yml run[\s\S]*Missing Runtime sources/
  )
})

test('the latest matching publication attempt controls readiness', async () => {
  let inspected = 0
  await waitForRuntimeRelease({
    ...defaults,
    inspect: async () => inspected++ >= sources.length,
    listRuns: async () => [
      publisher('completed', 'failure'),
      { ...publisher('completed', 'success'), id: 43, event: 'workflow_dispatch' }
    ]
  })
})

test('waiting for publication has a bounded deadline', async () => {
  let time = 0
  await assert.rejects(
    waitForRuntimeRelease({
      ...defaults,
      inspect: async () => false,
      listRuns: async () => [publisher('in_progress')],
      now: () => time,
      pause: async (delay) => {
        time += delay
      },
      timeoutMs: 65,
      pollMs: 30
    }),
    /Timed out[\s\S]*actions\/runs\/42[\s\S]*Missing Runtime sources/
  )
  assert.equal(time, 65)
})

test('GitHub API errors stop the gate instead of assuming publication succeeded', async () => {
  await assert.rejects(
    waitForRuntimeRelease({
      ...defaults,
      inspect: async () => false,
      listRuns: async () => {
        throw new Error('GitHub API: forbidden')
      }
    }),
    /GitHub API: forbidden/
  )
})

function cliFixture(t, failure = 'not found') {
  const root = mkdtempSync(path.join(tmpdir(), 'runtime-platform-release-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const state = path.join(root, 'state.json')
  const calls = path.join(root, 'calls.jsonl')
  writeFileSync(state, JSON.stringify({ ready: false, failure, run: publisher('completed', 'success') }))
  const fake = `#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
const state = JSON.parse(fs.readFileSync(process.env.FIXTURE_STATE, 'utf8'))
const tool = path.basename(process.argv[1])
const args = process.argv.slice(2)
fs.appendFileSync(process.env.FIXTURE_CALLS, JSON.stringify({tool, args}) + '\\n')
if (tool === 'gh') {
  fs.writeFileSync(process.env.FIXTURE_STATE, JSON.stringify({...state, ready: true}))
  process.stdout.write(JSON.stringify([{workflow_runs: [state.run]}]))
} else if (!state.ready) {
  process.stderr.write('ERROR: ' + state.failure + '\\n')
  process.exitCode = 1
}
`
  writeFileSync(path.join(root, 'package.json'), '{"type":"module"}')
  for (const tool of ['docker', 'gh']) {
    writeFileSync(path.join(root, tool), fake)
    chmodSync(path.join(root, tool), 0o755)
  }
  return {
    calls: () =>
      readFileSync(calls, 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line)),
    run: (mode = 'wait', overrides = {}) =>
      execFileSync(process.execPath, [script, mode], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          PATH: `${root}${path.delimiter}${process.env.PATH}`,
          FIXTURE_STATE: state,
          FIXTURE_CALLS: calls,
          GITHUB_EVENT_NAME: 'push',
          GITHUB_REF: 'refs/tags/3.18.7',
          GITHUB_REPOSITORY: repository,
          GITHUB_SHA: sha,
          RUNTIME_MATRIX: JSON.stringify(matrix),
          ...overrides
        }
      })
  }
}

test('CLI checks manifests, queries the exact publisher and only performs read operations', (t) => {
  const fixture = cliFixture(t)
  assert.match(fixture.run(), /All 6 immutable Runtime sources are available after publication/)
  const calls = fixture.calls()
  assert.equal(calls.filter((call) => call.tool === 'docker').length, 12)
  assert.ok(
    calls
      .filter((call) => call.tool === 'docker')
      .every((call) => call.args.slice(0, 3).join(' ') === 'buildx imagetools inspect')
  )
  assert.deepEqual(calls.find((call) => call.tool === 'gh').args, [
    'api',
    '--paginate',
    '--slurp',
    `repos/${repository}/actions/workflows/publish-npm-packages.yml/runs?head_sha=${sha}&branch=main&per_page=100`
  ])
})

test('CLI does not retry authentication failures as missing images', (t) => {
  const fixture = cliFixture(t, 'unauthorized: authentication required')
  assert.throws(() => fixture.run(), /Cannot inspect Runtime source[\s\S]*unauthorized/)
  assert.ok(fixture.calls().every((call) => call.tool === 'docker'))
})

test('CLI denies desktop tags and non-push events before registry access', (t) => {
  const fixture = cliFixture(t)
  assert.equal(fixture.run('check-ref').trim(), 'true')
  for (const overrides of [{ GITHUB_REF: 'refs/tags/desktop-v0.2.0' }, { GITHUB_EVENT_NAME: 'workflow_dispatch' }]) {
    assert.equal(fixture.run('check-ref', overrides).trim(), 'false')
    assert.throws(() => fixture.run('wait', overrides), /require a platform version tag push/)
  }
})
