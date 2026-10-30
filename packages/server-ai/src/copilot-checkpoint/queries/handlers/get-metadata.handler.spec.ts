import { createNamespace, getNamespace } from 'cls-hooked'
import { IsNull, type FindOneOptions, type Repository } from 'typeorm'
import { CopilotCheckpoint } from '../../copilot-checkpoint.entity'
import { CopilotCheckpointService } from '../../copilot-checkpoint.service'
import { CopilotCheckpointWrites } from '../../writes/writes.entity'
import { CopilotCheckpointWritesService } from '../../writes/writes.service'
import { CopilotCheckpointGetMetadataQuery } from '../get-metadata.query'
import { CopilotCheckpointGetMetadataHandler } from './get-metadata.handler'

describe('CopilotCheckpointGetMetadataHandler', () => {
    const configurable = { thread_id: 'thread', checkpoint_ns: '', checkpoint_id: 'input' }
    let findOne: jest.Mock<Promise<CopilotCheckpoint | null>, [FindOneOptions<CopilotCheckpoint>]>
    let service: CopilotCheckpointService
    let handler: CopilotCheckpointGetMetadataHandler
    let writes: CopilotCheckpointWritesService

    function read(organizationId: string | null = 'organization') {
        const namespace = getNamespace('RequestContext') ?? createNamespace('RequestContext')
        return namespace.runPromise(async () => {
            namespace.set('RequestContext', {
                request: {
                    user: { id: 'user', tenantId: 'tenant' },
                    headers: organizationId ? { 'organization-id': organizationId } : {}
                }
            })
            return handler.execute(new CopilotCheckpointGetMetadataQuery(configurable))
        })
    }
    beforeEach(() => {
        findOne = jest.fn().mockResolvedValue(null)
        writes = new CopilotCheckpointWritesService({} as Repository<CopilotCheckpointWrites>)
        service = new CopilotCheckpointService({ findOne } as unknown as Repository<CopilotCheckpoint>, writes)
        handler = new CopilotCheckpointGetMetadataHandler(service)
    })

    it.each(['organization', null])(
        'selects only metadata and identity with organization scope %s',
        async (organizationId) => {
            const row = Object.assign(new CopilotCheckpoint(), configurable, {
                type: 'json',
                metadata: Buffer.from('{"source":"input","step":-1,"parents":{}}')
            })
            Object.defineProperty(row, 'checkpoint', {
                get() {
                    throw new Error('Full state must not be read')
                }
            })
            findOne.mockResolvedValue(row)
            const fullRead = jest.spyOn(service, 'getTuple')
            const writesRead = jest.spyOn(writes, 'findAll')
            await expect(read(organizationId)).resolves.toEqual({
                config: { configurable },
                metadata: { source: 'input' }
            })
            expect(findOne).toHaveBeenCalledWith({
                select: {
                    id: true,
                    thread_id: true,
                    checkpoint_ns: true,
                    checkpoint_id: true,
                    type: true,
                    metadata: true
                },
                loadEagerRelations: false,
                where: { ...configurable, tenant: { id: 'tenant' }, organizationId: organizationId ?? IsNull() }
            })
            expect(fullRead).not.toHaveBeenCalled()
            expect(writesRead).not.toHaveBeenCalled()
        }
    )

    it('returns null for a missing scoped checkpoint without falling back to the latest state', async () => {
        await expect(read()).resolves.toBeNull()
        expect(findOne).toHaveBeenCalledTimes(1)
    })

    it.each(['loop', 'update', 'fork'] as const)('preserves the non-input source %s', async (source) => {
        findOne.mockResolvedValue(
            Object.assign(new CopilotCheckpoint(), configurable, {
                metadata: Buffer.from(JSON.stringify({ source }))
            })
        )
        await expect(read()).resolves.toMatchObject({ metadata: { source } })
    })

    it.each(['null', '{}', '{"source":"unknown"}'])('rejects metadata with no valid source: %s', async (metadata) => {
        findOne.mockResolvedValue(
            Object.assign(new CopilotCheckpoint(), configurable, { metadata: Buffer.from(metadata) })
        )
        await expect(read()).resolves.toBeNull()
    })

    it('propagates database failures instead of treating them as missing checkpoints', async () => {
        const error = new Error('Checkpoint database unavailable')
        findOne.mockRejectedValue(error)
        await expect(read()).rejects.toBe(error)
    })

    it('propagates deserialization failures without loading full state', async () => {
        findOne.mockResolvedValue(Object.assign(new CopilotCheckpoint(), configurable, { metadata: Buffer.from('{') }))
        await expect(read()).rejects.toBeInstanceOf(SyntaxError)
        expect(findOne).toHaveBeenCalledTimes(1)
    })
})
