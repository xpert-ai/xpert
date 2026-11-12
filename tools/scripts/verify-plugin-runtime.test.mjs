import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { readRuntimeTarget, verifyRuntimeConvergence } from './verify-plugin-runtime.mjs'

const expected = { pluginEndpoint: 'http://localhost:3000/api/plugin', name: '@fixture/runtime',
  scopeKey: 'org-test', version: '1.0.0', revision: 'runtime:new' }
const requirement = { pluginName: expected.name, scopeKey: expected.scopeKey,
  version: expected.version, runtimeRevision: expected.revision, state: 'loaded' }
const receipt = { schemaVersion: 'xpert-local-plugin-deployment@1',
  plugin: { name: expected.name, installScope: 'organization', tenantId: null, organizationId: 'org-test' },
  deployment: { pluginEndpoint: expected.pluginEndpoint, runtimeConvergence: { generation: 7 }, runtimeRequirements: [requirement] } }
const completed = { generation: 7, status: 'completed', restartId: 'restart-7',
  targetReplicaCount: 2, completedReplicaCount: 2, failedReplicaCount: 0 }
const target = readRuntimeTarget(receipt, expected)

function withDeployment(change) {
  return { ...receipt, deployment: { ...receipt.deployment, ...change } }
}

test('same-version reinstall requires the receipt revision and a completed matching generation', () => {
  assert.throws(() => readRuntimeTarget(withDeployment({ runtimeRequirements: [
    { ...requirement, runtimeRevision: 'runtime:old' }
  ] }), expected), /revision does not match/)
  assert.throws(() => verifyRuntimeConvergence({ ...completed, generation: 6 }, target), /generation does not match/)
  assert.equal(verifyRuntimeConvergence(completed, target).runtimeConvergenceVerified, true)
})

test('a desired target or an untracked/invalid generation cannot establish completion', () => {
  for (const generation of [undefined, 0, -1, 1.5, '7']) {
    assert.throws(() => readRuntimeTarget(withDeployment({ runtimeConvergence: { generation } }), expected), /no tracked runtime generation/)
  }
  assert.throws(() => verifyRuntimeConvergence(null, target), /generation does not match/)
  assert.throws(() => verifyRuntimeConvergence({ generation: 7, runtimeRequirements: [requirement] }, target), /not completed/)
})

test('rejects receipts from another instance, scope, plugin, version or absent target', () => {
  assert.throws(() => readRuntimeTarget(withDeployment({ pluginEndpoint: 'http://another/api/plugin' }), expected), /different API endpoint/)
  assert.throws(() => readRuntimeTarget({ ...receipt, plugin: { name: 'another' } }, expected), /plugin does not match/)
  for (const runtimeRequirements of [[], [requirement, requirement], [{ ...requirement, scopeKey: 'another' }]]) {
    assert.throws(() => readRuntimeTarget(withDeployment({ runtimeRequirements }), expected), /exactly one/)
  }
  assert.throws(() => readRuntimeTarget(withDeployment({ runtimeRequirements: [{ ...requirement, state: 'absent' }] }), expected), /does not require loading/)
  assert.throws(() => readRuntimeTarget(receipt, { ...expected, version: '2.0.0' }), /version does not match/)
})

test('convergence evidence is sanitized and explicitly excludes current-runtime and business acceptance', () => {
  const sanitized = readRuntimeTarget(withDeployment({ runtimeRequirements: [
    { ...requirement, config: { password: 'fixture-secret' } }
  ] }), expected)
  const result = verifyRuntimeConvergence({ ...completed, token: 'fixture-secret' }, sanitized)
  assert.equal(result.currentRuntimeVerified, false)
  assert.equal(result.businessAcceptance, false)
  assert.deepEqual(result.target, requirement)
  assert.doesNotMatch(JSON.stringify(result), /fixture-secret/)
})

test('already-converged operations with zero restart targets pass, inconsistent counts fail', () => {
  assert.equal(verifyRuntimeConvergence({ ...completed, targetReplicaCount: 0, completedReplicaCount: 0 }, target).runtimeConvergenceVerified, true)
  for (const change of [{ failedReplicaCount: 1 }, { completedReplicaCount: 1 },
    { targetReplicaCount: -1 }, { completedReplicaCount: undefined }]) {
    assert.throws(() => verifyRuntimeConvergence({ ...completed, ...change }, target), /replica counts/)
  }
})

async function runVerification(t, body, { statusCode = 200, changeManifest, orgId = 'org-test' } = {}) {
  const requests = []
  const server = http.createServer((request, response) => {
    requests.push({ path: request.url, method: request.method, organization: request.headers['organization-id'] })
    response.writeHead(statusCode, { 'content-type': 'application/json' })
    response.end(JSON.stringify(body))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xpert-runtime-verify-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const endpoint = `http://127.0.0.1:${server.address().port}/prefix/api/plugin`
  const manifest = withDeployment({ pluginEndpoint: endpoint })
  if (changeManifest) changeManifest(manifest)
  const manifestFile = path.join(dir, 'deployment.json')
  const evidence = path.join(dir, 'evidence.json')
  fs.writeFileSync(manifestFile, JSON.stringify(manifest))
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('XPERT_')))
  const args = ['--manifest-file', manifestFile, '--plugin-name', expected.name, '--scope-key', expected.scopeKey,
    '--expected-revision', expected.revision, '--expected-version', expected.version, '--endpoint', endpoint,
    '--org-id', orgId, '--no-keychain', '--evidence', evidence]
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(new URL('./verify-plugin-runtime.mjs', import.meta.url)), ...args],
      { env: { ...env, XPERT_TOKEN: 'fixture-secret-token' }, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = '', stderr = ''
    child.stdout.on('data', data => { stdout += data })
    child.stderr.on('data', data => { stderr += data })
    child.on('error', reject)
    child.on('close', code => resolve({ code, stdout, stderr }))
  })
  assert.doesNotMatch(result.stdout + result.stderr, /fixture-secret-token/)
  return { ...result, requests, evidence: fs.existsSync(evidence) ? JSON.parse(fs.readFileSync(evidence, 'utf8')) : null }
}

test('CLI queries the existing scoped convergence route once and writes bounded evidence', async t => {
  const result = await runVerification(t, completed)
  assert.equal(result.code, 0, result.stderr)
  assert.deepEqual(result.requests, [{ path: '/prefix/api/system/runtime/plugin-convergence/7', method: 'GET', organization: 'org-test' }])
  assert.equal(result.evidence.operation.generation, 7)
  assert.equal(result.evidence.currentRuntimeVerified, false)
  assert.equal(result.evidence.businessAcceptance, false)
})

for (const status of ['in_progress', 'awaiting_restart', 'failed']) {
  test(`CLI fails for ${status} without restarting or retrying`, async t => {
    const result = await runVerification(t, { ...completed, status })
    assert.notEqual(result.code, 0)
    assert.match(result.stderr, new RegExp(`not completed: ${status}`))
    assert.equal(result.requests.length, 1)
    assert.equal(result.evidence, null)
  })
}

for (const statusCode of [403, 404]) {
  test(`CLI fails on HTTP ${statusCode} without fallback or fabricated evidence`, async t => {
    const result = await runVerification(t, { message: 'Unavailable' }, { statusCode })
    assert.notEqual(result.code, 0)
    assert.match(result.stderr, new RegExp(`HTTP ${statusCode}`))
    assert.equal(result.requests.length, 1)
    assert.equal(result.evidence, null)
  })
}

test('CLI rejects incomplete legacy manifests and mismatched auth scopes before querying status', async t => {
  for (const options of [{ changeManifest: manifest => { delete manifest.deployment.runtimeConvergence } }, { orgId: 'another' }]) {
    const result = await runVerification(t, completed, options)
    assert.notEqual(result.code, 0)
    assert.equal(result.requests.length, 0)
    assert.equal(result.evidence, null)
  }
})
