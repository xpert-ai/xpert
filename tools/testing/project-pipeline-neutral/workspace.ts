// Bounded acceptance adapter, not a shell sandbox. Only generated fixture paths are writable.
// A separate on-disk owner guard detects broken admission even across API process restarts.
import { constants } from 'node:fs'
import { lstat, mkdir, open, realpath, rename, unlink } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { z } from 'zod/v3'
import {
  ProjectPipelineRuntimeAdapterProvider as Adapter,
  type ProjectPipelineOperationContext
} from '@xpert-ai/plugin-sdk'
import { type ProjectPipelineOperationReceipt, projectPipelineResourceReservationSchema } from '@xpert-ai/contracts'
import { resourceRefs } from './configuration.js'

const parameters = z
  .object({ mode: z.enum(['hold', 'recover']), resourceAlias: z.enum(['primary', 'default']) })
  .strict()
const markerSchema = z
  .object({
    operationId: z.string().uuid(),
    owner: z.string().regex(/^[a-f0-9]{64}$/),
    state: z.enum(['pending', 'succeeded', 'cancelled'])
  })
  .strict()
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const isMissing = (error: unknown) => error instanceof Error && 'code' in error && error.code === 'ENOENT'
const isExisting = (error: unknown) => error instanceof Error && 'code' in error && error.code === 'EEXIST'
const ownerKey = (c: ProjectPipelineOperationContext) =>
  hash(JSON.stringify([c.actor.tenantId, c.actor.organizationId, c.projectId]))

async function root() {
  const configured = process.env.XPERT_PIPELINE_ACCEPTANCE_RESOURCE_ROOT
  if (!configured || !isAbsolute(configured)) throw Error('ACCEPTANCE_RESOURCE_ROOT_REQUIRED')
  const stat = await lstat(configured),
    canonical = await realpath(configured)
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.mode & 0o077 ||
    (process.getuid && stat.uid !== process.getuid())
  )
    throw Error('ACCEPTANCE_RESOURCE_ROOT_UNSAFE')
  return canonical
}
async function directory(path: string) {
  await mkdir(path, { mode: 0o700 }).catch((error) => {
    if (!isExisting(error)) throw error
  })
  const stat = await lstat(path)
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.mode & 0o077) throw Error('ACCEPTANCE_DIRECTORY_UNSAFE')
}
async function read(path: string) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    if ((await handle.stat()).size > 4096) throw Error('ACCEPTANCE_MARKER_TOO_LARGE')
    return markerSchema.parse(JSON.parse(await handle.readFile('utf8')))
  } finally {
    await handle.close()
  }
}
async function create(path: string, marker: z.output<typeof markerSchema>) {
  const handle = await open(
    path,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600
  )
  try {
    await handle.writeFile(JSON.stringify(marker))
    await handle.sync()
  } finally {
    await handle.close()
  }
}

@Injectable()
@Adapter('resource', resourceRefs.resolver)
export class NeutralWorkspaceResources {
  readonly kind = 'resource'
  readonly ref = resourceRefs.resolver
  async resolve(c: ProjectPipelineOperationContext) {
    parameters.parse(c.parameters)
    // Both allowed aliases refer to this one physical writer. Scope is not part of its lock identity.
    return [{ key: hash(`acceptance-workspace-v1:${await root()}`), mode: 'exclusive' as const }]
  }
}
@Injectable()
@Adapter('operation', resourceRefs.operation)
export class NeutralWorkspaceOperation {
  readonly kind = 'operation'
  readonly ref = resourceRefs.operation
  private async paths(c: ProjectPipelineOperationContext) {
    const operationId = z.string().uuid().parse(c.idempotencyKey)
    if (operationId !== c.work.operationId) throw Error('ACCEPTANCE_OPERATION_IDENTITY_INVALID')
    const claims = await new NeutralWorkspaceResources().resolve(c)
    const reservation = projectPipelineResourceReservationSchema.parse(c.resources)
    if (
      reservation.resolverRef !== resourceRefs.resolver ||
      JSON.stringify(reservation.claims) !== JSON.stringify(claims)
    )
      throw Error('ACCEPTANCE_RESOURCE_IDENTITY_INVALID')
    const base = await root(),
      owner = ownerKey(c),
      workspace = join(base, owner, operationId)
    for (const path of [join(base, owner), workspace]) {
      const stat = await lstat(path).catch((error) => {
        if (isMissing(error)) return null
        throw error
      })
      if (!stat) break
      if (!stat.isDirectory() || stat.isSymbolicLink() || stat.mode & 0o077) throw Error('ACCEPTANCE_DIRECTORY_UNSAFE')
    }
    return {
      base,
      owner,
      workspace,
      operationId,
      guard: join(base, 'writer.json'),
      marker: join(workspace, 'result.json')
    }
  }
  async execute(c: ProjectPipelineOperationContext): Promise<ProjectPipelineOperationReceipt> {
    const paths = await this.paths(c),
      marker = { operationId: paths.operationId, owner: paths.owner, state: 'pending' as const }
    const existing = await read(paths.marker).catch((error) => {
      if (isMissing(error)) return null
      throw error
    })
    if (existing) {
      if (existing.owner !== paths.owner || existing.operationId !== paths.operationId)
        throw Error('ACCEPTANCE_WORKSPACE_OWNER_MISMATCH')
      if (existing.state !== 'pending') return this.inspect(c)
    }
    await create(paths.guard, marker).catch(async (error) => {
      if (!isExisting(error)) throw error
      const held = await read(paths.guard)
      if (held.operationId !== paths.operationId || held.owner !== paths.owner)
        throw Error('ACCEPTANCE_PHYSICAL_WRITER_COLLISION')
    })
    await directory(join(paths.base, paths.owner))
    await directory(paths.workspace)
    await create(paths.marker, marker).catch(async (error) => {
      if (!isExisting(error)) throw error
      const previous = await read(paths.marker)
      if (previous.operationId !== paths.operationId || previous.owner !== paths.owner)
        throw Error('ACCEPTANCE_WORKSPACE_OWNER_MISMATCH')
    })
    return {
      status: parameters.parse(c.parameters).mode === 'recover' ? 'unknown' : 'pending',
      receiptKey: c.idempotencyKey
    }
  }
  async inspect(c: ProjectPipelineOperationContext): Promise<ProjectPipelineOperationReceipt> {
    const paths = await this.paths(c)
    const marker = await read(paths.marker).catch((error) => {
      if (isMissing(error)) return null
      throw error
    })
    if (!marker) return { status: 'unknown', receiptKey: c.idempotencyKey }
    if (marker.owner !== paths.owner || marker.operationId !== paths.operationId)
      throw Error('ACCEPTANCE_WORKSPACE_OWNER_MISMATCH')
    if (marker.state !== 'pending') {
      await this.releaseGuard(paths)
      return marker.state === 'succeeded'
        ? { status: 'succeeded', receiptKey: c.idempotencyKey, outputs: {} }
        : { status: 'cancelled', receiptKey: c.idempotencyKey }
    }
    const finish = z.string().datetime().parse(c.subjects[0]?.version)
    if (Date.now() < Date.parse(finish)) return { status: 'pending', receiptKey: c.idempotencyKey }
    return this.finish(c, 'succeeded')
  }
  async cancel(c: ProjectPipelineOperationContext) {
    return this.finish(c, 'cancelled')
  }
  private async finish(
    c: ProjectPipelineOperationContext,
    state: 'succeeded' | 'cancelled'
  ): Promise<ProjectPipelineOperationReceipt> {
    const paths = await this.paths(c),
      marker = await read(paths.marker)
    if (marker.state !== 'pending') return this.inspect(c)
    const guard = await read(paths.guard)
    if (
      marker.owner !== paths.owner ||
      marker.operationId !== paths.operationId ||
      guard.owner !== paths.owner ||
      guard.operationId !== paths.operationId
    )
      throw Error('ACCEPTANCE_WORKSPACE_OWNER_MISMATCH')
    // Atomic terminal marker precedes release; inspect finishes cleanup after a process interruption.
    const temporary = join(paths.workspace, `${randomUUID()}.tmp`)
    await create(temporary, { ...marker, state })
    await rename(temporary, paths.marker)
    await this.releaseGuard(paths)
    return state === 'succeeded'
      ? { status: 'succeeded', receiptKey: c.idempotencyKey, outputs: {} }
      : { status: 'cancelled', receiptKey: c.idempotencyKey }
  }
  private async releaseGuard(paths: { guard: string; owner: string; operationId: string }) {
    const held = await read(paths.guard).catch((error) => {
      if (isMissing(error)) return null
      throw error
    })
    if (held?.owner === paths.owner && held.operationId === paths.operationId) await unlink(paths.guard)
  }
}
