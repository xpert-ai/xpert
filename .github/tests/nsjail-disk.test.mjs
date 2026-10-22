import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const script = fileURLToPath(new URL('../scripts/prepare-nsjail-disk.sh', import.meta.url))

function run(t, overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'nsjail-disk-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const log = join(root, 'commands.log')
  writeFileSync(log, '')
  // Never run real sudo, cleanup or Docker commands in this regression suite.
  for (const name of ['sudo', 'docker', 'df']) {
    const executable = join(root, name)
    writeFileSync(
      executable,
      `#!/bin/sh\nprintf '%s\\n' '${name}'" $*" >> "$TEST_COMMAND_LOG"\n` +
        (name === 'df'
          ? `printf 'Filesystem 1024-blocks Used Available Capacity Mounted\\n/dev/test 99999999 1 %s 1%% /\\n' "$TEST_AVAILABLE_KIB"\n`
          : '')
    )
    chmodSync(executable, 0o755)
  }
  const result = spawnSync('bash', [script], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${root}:${process.env.PATH}`,
      GITHUB_ACTIONS: 'true',
      RUNNER_ENVIRONMENT: 'github-hosted',
      RUNNER_OS: 'Linux',
      TEST_AVAILABLE_KIB: String(30 * 1024 * 1024),
      TEST_COMMAND_LOG: log,
      ...overrides
    }
  })
  return { ...result, commands: readFileSync(log, 'utf8').trim().split('\n').filter(Boolean) }
}

test('cleanup is limited to unused SDKs on a hosted runner', (t) => {
  const result = run(t)
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(
    result.commands.filter((command) => command.startsWith('sudo ')),
    [
      'sudo rm -rf -- /usr/local/lib/android /usr/share/dotnet /usr/share/swift /usr/local/.ghcup /opt/ghc /opt/hostedtoolcache/CodeQL',
      'sudo apt-get clean'
    ]
  )
  assert.ok(result.commands.includes('df -Pk /var/lib/docker'))
  assert.doesNotMatch(result.commands.join('\n'), /prune/)
})

test('local, self-hosted and non-Linux environments fail before any cleanup', (t) => {
  for (const overrides of [
    { GITHUB_ACTIONS: '' },
    { RUNNER_ENVIRONMENT: 'self-hosted' },
    { RUNNER_ENVIRONMENT: '' },
    { RUNNER_OS: 'macOS' }
  ]) {
    const result = run(t, overrides)
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /Refusing SDK cleanup/)
    assert.deepEqual(result.commands, [])
  }
})

test('insufficient or unreadable Docker filesystem capacity stops the build early', (t) => {
  for (const available of [String(25 * 1024 * 1024 - 1), 'unknown']) {
    const result = run(t, { TEST_AVAILABLE_KIB: available })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /requires at least 25 GiB free/)
  }
  assert.equal(run(t, { TEST_AVAILABLE_KIB: String(25 * 1024 * 1024) }).status, 0)
})

test('workflow reserves space before building and retains isolation probes and diagnostics', () => {
  const workflow = readFileSync(new URL('../workflows/nsjail-runner-validate.yml', import.meta.url), 'utf8')
  const reserve = workflow.indexOf('run: bash .github/scripts/prepare-nsjail-disk.sh')
  const build = workflow.indexOf('run: docker build --progress=plain')
  const probe = workflow.indexOf('- name: Run Runner isolation probe')
  assert.ok(reserve >= 0 && reserve < build && build < probe)
  assert.match(workflow, /name: Reserve disk space[^\n]*\n\s+if: env.RUN_PRIVILEGED_PROBE == 'true'/)
  assert.match(
    workflow,
    /name: Report Runner build disk usage\n\s+if: always\(\) && env.RUN_PRIVILEGED_PROBE == 'true'/
  )
  for (const file of ['poc_validate.py', 'verify_compute.py', 'verify_documents.py']) {
    assert.ok(workflow.includes(`docker exec xpert-nsjail-runner-ci python3 /app/${file}`))
  }
})
