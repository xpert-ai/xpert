import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, chmod, readdir, rm, symlink, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { NeutralWorkspaceOperation, NeutralWorkspaceResources } from './dist/index.js'

const resolver = new NeutralWorkspaceResources(),
  executor = new NeutralWorkspaceOperation()
async function context(overrides = {}) {
  const operationId = randomUUID(),
    c = {
      projectId: randomUUID(),
      actor: { tenantId: randomUUID(), userId: randomUUID() },
      work: { operationId },
      idempotencyKey: operationId,
      parameters: { mode: 'hold', resourceAlias: 'primary' },
      subjects: [{ version: new Date(Date.now() + 60_000).toISOString() }],
      ...overrides
    }
  return { ...c, resources: { resolverRef: resolver.ref, claims: await resolver.resolve(c) } }
}
async function fixture(work) {
  const previous = process.env.XPERT_PIPELINE_ACCEPTANCE_RESOURCE_ROOT,
    root = await mkdtemp(join(tmpdir(), 'pipeline-resource-test-'))
  await chmod(root, 0o700)
  process.env.XPERT_PIPELINE_ACCEPTANCE_RESOURCE_ROOT = root
  try {
    await work(root)
  } finally {
    if (previous === undefined) delete process.env.XPERT_PIPELINE_ACCEPTANCE_RESOURCE_ROOT
    else process.env.XPERT_PIPELINE_ACCEPTANCE_RESOURCE_ROOT = previous
    await rm(root, { recursive: true, force: true })
  }
}
test('aliases and foreign Projects resolve the same physical resource and cannot bypass its writer guard', async () =>
  fixture(async (root) => {
    const a = await context(),
      b = await context({ parameters: { mode: 'hold', resourceAlias: 'default' } })
    assert.deepEqual(a.resources, b.resources)
    assert.equal((await executor.execute(a)).status, 'pending')
    await assert.rejects(executor.execute(b), /PHYSICAL_WRITER_COLLISION/)
    assert.equal((await executor.cancel(a)).status, 'cancelled')
    assert.equal((await executor.execute(b)).status, 'pending')
    assert.equal((await executor.inspect(a)).status, 'cancelled') // Cannot remove B's current guard.
    assert.equal(JSON.parse(await readFile(join(root, 'writer.json'))).operationId, b.idempotencyKey)
    assert.equal((await executor.cancel(b)).status, 'cancelled')
    const owners = await readdir(root)
    assert.equal(owners.length, 2)
    const files = await Promise.all(
      owners.map(async (owner) => {
        const operations = await readdir(join(root, owner))
        assert.equal(operations.length, 1)
        return JSON.parse(await readFile(join(root, owner, operations[0], 'result.json')))
      })
    )
    assert.deepEqual(new Set(files.map((file) => file.operationId)), new Set([a.idempotencyKey, b.idempotencyKey]))
  }))
test('unknown work resumes from disk without a second execute; terminal receipts are stable', async () =>
  fixture(async () => {
    const c = await context({
      parameters: { mode: 'recover', resourceAlias: 'primary' },
      subjects: [{ version: new Date(0).toISOString() }]
    })
    assert.equal((await executor.execute(c)).status, 'unknown')
    assert.equal((await new NeutralWorkspaceOperation().inspect(c)).status, 'succeeded')
    assert.equal((await executor.inspect(c)).status, 'succeeded')
    assert.equal((await executor.cancel(c)).status, 'succeeded')
    assert.equal((await executor.execute(c)).status, 'succeeded')
  }))
test('rejects absent/mismatched grants, path injection, foreign work identity and symlinked roots', async () =>
  fixture(async (root) => {
    const c = await context()
    await assert.rejects(executor.execute({ ...c, resources: undefined }))
    await assert.rejects(
      executor.execute({ ...c, resources: { ...c.resources, claims: [{ key: 'a'.repeat(64), mode: 'exclusive' }] } }),
      /IDENTITY_INVALID/
    )
    await assert.rejects(executor.execute({ ...c, parameters: { ...c.parameters, path: '/tmp' } }))
    await assert.rejects(executor.execute({ ...c, work: { operationId: randomUUID() } }), /OPERATION_IDENTITY/)
    await symlink(root, join(root, 'alias'))
    process.env.XPERT_PIPELINE_ACCEPTANCE_RESOURCE_ROOT = join(root, 'alias')
    await assert.rejects(resolver.resolve(c), /ROOT_UNSAFE/)
  }))
