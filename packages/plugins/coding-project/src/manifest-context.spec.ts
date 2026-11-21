import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common'
import { createHash, randomUUID } from 'node:crypto'
import { ProjectFilesRuntimeCapability } from '@xpert-ai/plugin-sdk'
import { deliveryFixture } from './delivery.fixture'
import { CodingDeliveryService } from './delivery.service'
import { CodingDeliveryWork } from './entities'
import { manifestContextPath, prepareManifestContext } from './manifest-context'

let f: Awaited<ReturnType<typeof deliveryFixture>>
beforeEach(async () => {
  f = await deliveryFixture()
})
afterEach(async () => {
  jest.restoreAllMocks()
  await f.db.destroy()
})

it.each(['development', 'deployment', 'git'] as const)(
  'prepares exact %s identity and reuses identical bytes',
  async (phase) => {
    const first = await prepareManifestContext(f.capabilities, f.context, phase)
    expect(JSON.parse(f.projectFiles.get(first.path)!.toString())).toEqual({ version: 1, phase, work: f.context.work })
    expect(await prepareManifestContext(f.capabilities, f.context, phase)).toEqual(first)
    expect(f.projectFiles.size).toBe(1)
  }
)

it('loads a persisted stage and keeps the legacy identity file and its digest', async () => {
  const work = { runId: f.context.work.runId, ...Object.fromEntries(Object.entries(f.context.work).reverse()) }
  const path = manifestContextPath(f.context.work.operationId)
  const bytes = Buffer.from(JSON.stringify({ version: 1, phase: 'development', work }, null, 2) + '\n')
  f.projectFiles.set(path, bytes)
  await f.store.begin(f.context, 'development')
  const persisted = await f.store.operation(f.context, f.context.work.operationId)
  expect(Object.keys(work)).not.toEqual(Object.keys(persisted.context.work))
  const result = await new CodingDeliveryService(f.store, f.evidence).context(f.context, f.context.work.operationId)
  expect(result.requirement).toEqual(f.requirement)
  expect(await prepareManifestContext(f.capabilities, persisted.context, 'development')).toEqual({
    path,
    sha256: createHash('sha256').update(bytes).digest('hex')
  })
  expect(f.projectFiles.get(path)).toBe(bytes)
})

it.each(['inputDigest', 'operationId'] as const)('rejects a different %s in a legacy file', async (field) => {
  const work = { ...f.context.work, [field]: field === 'inputDigest' ? 'b'.repeat(64) : randomUUID() }
  const path = manifestContextPath(f.context.work.operationId)
  const bytes = Buffer.from(JSON.stringify({ version: 1, phase: 'development', work }))
  f.projectFiles.set(path, bytes)
  await expect(prepareManifestContext(f.capabilities, f.context, 'development')).rejects.toMatchObject({
    response: { code: 'CODING_MANIFEST_WORK_MISMATCH' }
  })
  expect(f.projectFiles.get(path)).toBe(bytes)
})

it('preserves a conflicting identity file instead of overwriting it', async () => {
  const path = manifestContextPath(f.context.work.operationId)
  f.projectFiles.set(path, Buffer.from('changed'))
  await expect(prepareManifestContext(f.capabilities, f.context, 'development')).rejects.toMatchObject({
    response: { code: 'CODING_MANIFEST_WORK_MISMATCH' }
  })
  expect(f.projectFiles.get(path)!.toString()).toBe('changed')
})

it('gives a retry a distinct file while preserving the original attempt identity', async () => {
  const first = await prepareManifestContext(f.capabilities, f.context, 'development')
  const original = Buffer.from(f.projectFiles.get(first.path)!)
  const retry = { ...f.context, work: { ...f.context.work, operationId: randomUUID() } }
  const next = await prepareManifestContext(f.capabilities, retry, 'development')
  expect(next.path).not.toBe(first.path)
  expect(f.projectFiles.get(first.path)).toEqual(original)
  expect(JSON.parse(f.projectFiles.get(next.path)!.toString()).work).toEqual(retry.work)
})

it.each([
  new ForbiddenException('Edit access revoked'),
  new ServiceUnavailableException('Storage unavailable'),
  new Error('I/O failed')
])('does not hide a write failure behind an existing matching file: %s', async (error) => {
  await prepareManifestContext(f.capabilities, f.context, 'development')
  const files = f.capabilities.require(ProjectFilesRuntimeCapability)
  jest.spyOn(files, 'write').mockRejectedValue(error)
  const read = jest.spyOn(files, 'read')
  await expect(prepareManifestContext(f.capabilities, f.context, 'development')).rejects.toBe(error)
  expect(read).not.toHaveBeenCalled()
})

it('propagates loss of read access during create-conflict verification', async () => {
  await prepareManifestContext(f.capabilities, f.context, 'development')
  const error = new ForbiddenException('Read access revoked')
  jest.spyOn(f.capabilities.require(ProjectFilesRuntimeCapability), 'read').mockRejectedValue(error)
  await expect(prepareManifestContext(f.capabilities, f.context, 'development')).rejects.toBe(error)
})

it('materializes an older stage identity on context access using the current actor', async () => {
  await f.store.begin(f.context, 'development')
  const actor = { ...f.context.actor, userId: randomUUID() }
  const write = jest.spyOn(f.capabilities.require(ProjectFilesRuntimeCapability), 'write')
  const result = await new CodingDeliveryService(f.store, f.evidence).context(
    { ...f.context, actor },
    f.context.work.operationId
  )
  expect(JSON.parse(f.projectFiles.get(result.manifestContextPath)?.toString() ?? 'null')).toEqual({
    version: 1,
    phase: 'development',
    work: f.context.work
  })
  expect(write).toHaveBeenCalledWith(expect.objectContaining({ actor, projectId: f.projectId }))
})

it('prepares the identity file before returning the stage brief without creating duplicate work', async () => {
  const result = await f.operations.prepare(f.context, 'development')
  const path = manifestContextPath(f.context.work.operationId)
  expect(f.projectFiles.has(path)).toBe(true)
  expect(result.prompt).toContain(path)
  expect(result.prompt).not.toContain(f.context.work.roundId)
  expect(await f.operations.prepare(f.context, 'development')).toEqual(result)
  expect(await f.db.getRepository(CodingDeliveryWork).count()).toBe(1)
})
