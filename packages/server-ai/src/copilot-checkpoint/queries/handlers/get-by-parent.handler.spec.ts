import { createNamespace, getNamespace } from 'cls-hooked'
import { IsNull, type FindManyOptions, type Repository } from 'typeorm'
import { CopilotCheckpoint } from '../../copilot-checkpoint.entity'
import { CopilotCheckpointService } from '../../copilot-checkpoint.service'
import { CopilotCheckpointWrites } from '../../writes/writes.entity'
import { CopilotCheckpointWritesService } from '../../writes/writes.service'
import { GetCopilotCheckpointsByParentQuery } from '../get-by-parent.query'
import { GetCopilotCheckpointsByParentHandler } from './get-by-parent.handler'

describe('GetCopilotCheckpointsByParentHandler', () => {
    let findAndCount: jest.Mock<Promise<[CopilotCheckpoint[], number]>, [FindManyOptions<CopilotCheckpoint>]>
    let handler: GetCopilotCheckpointsByParentHandler

    function read(checkpointNs = '', organizationId: string | null = 'organization') {
        const namespace = getNamespace('RequestContext') ?? createNamespace('RequestContext')
        return namespace.runPromise(async () => {
            namespace.set('RequestContext', {
                request: {
                    user: { id: 'user', tenantId: 'tenant' },
                    headers: organizationId ? { 'organization-id': organizationId } : {}
                }
            })
            return handler.execute(
                new GetCopilotCheckpointsByParentQuery({
                    thread_id: 'thread',
                    checkpoint_ns: checkpointNs,
                    checkpoint_id: 'parent'
                })
            )
        })
    }

    beforeEach(() => {
        findAndCount = jest.fn().mockResolvedValue([[], 0])
        const service = new CopilotCheckpointService(
            { findAndCount } as unknown as Repository<CopilotCheckpoint>,
            new CopilotCheckpointWritesService({} as Repository<CopilotCheckpointWrites>)
        )
        handler = new GetCopilotCheckpointsByParentHandler(service)
    })

    it.each(['', 'agent:child'])(
        'reads only child IDs with the original scope in namespace "%s"',
        async (checkpointNs) => {
            const rows = ['child-b', 'child-a'].map((checkpoint_id) =>
                Object.assign(new CopilotCheckpoint(), { checkpoint_id })
            )
            findAndCount.mockResolvedValue([rows, rows.length])

            await expect(read(checkpointNs)).resolves.toEqual([
                { checkpoint_id: 'child-b' },
                { checkpoint_id: 'child-a' }
            ])

            expect(findAndCount).toHaveBeenCalledWith({
                select: { checkpoint_id: true },
                where: {
                    thread_id: 'thread',
                    checkpoint_ns: checkpointNs,
                    parent_id: 'parent',
                    tenant: { id: 'tenant' },
                    organizationId: 'organization'
                }
            })
        }
    )

    it('returns an empty list when no child checkpoint exists', async () => {
        await expect(read()).resolves.toEqual([])
        expect(findAndCount).toHaveBeenCalledTimes(1)
    })

    it('preserves the null-organization filter for tenant-scoped reads', async () => {
        await read('', null)
        expect(findAndCount).toHaveBeenCalledWith({
            select: { checkpoint_id: true },
            where: {
                thread_id: 'thread',
                checkpoint_ns: '',
                parent_id: 'parent',
                tenant: { id: 'tenant' },
                organizationId: IsNull()
            }
        })
    })

    it('propagates database failures without retrying a full checkpoint read', async () => {
        const error = new Error('Checkpoint database unavailable')
        findAndCount.mockRejectedValue(error)
        await expect(read()).rejects.toBe(error)
        expect(findAndCount).toHaveBeenCalledTimes(1)
    })
})
