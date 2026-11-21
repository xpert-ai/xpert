import 'reflect-metadata'
import { instanceToPlain, plainToInstance } from 'class-transformer'
import { projectTaskViewQuerySchema } from '@xpert-ai/contracts'
import { ProjectTaskExecutionSummaryDto, executionSummaryDto } from './task-view.dto'
import { ProjectTaskDetailDto } from './task-detail.dto'
import { readTaskView } from './task-view.reader'
import { ProjectTaskGraphService } from '../../services/project-task-graph.service'
import { ProjectTaskRuntimeReadService } from '../../runtime/project-task-runtime-read.service'

const id = '11111111-1111-4111-8111-111111111111'
const context = { projectId: id, actor: { tenantId: 'tenant', organizationId: 'org', userId: 'user' } }
const query = (parameters: object) => projectTaskViewQuerySchema.parse({ contractVersion: 2, ...parameters })

describe('progressive task view contracts', () => {
    it('rejects arbitrary projections, forged scope, unknown resources and unbounded pages', () => {
        for (const input of [
            { resource: 'task-index', projectId: id },
            { resource: 'task-index', fields: ['dispatchIntent'] },
            { resource: 'anything' },
            { resource: 'executions', taskIds: [], limit: 10 },
            { resource: 'executions', taskIds: [id], limit: 101 },
            { resource: 'execution-result', taskId: id, executionId: id, limit: 12001 }
        ])
            expect(() => query(input)).toThrow()
    })
    it('keeps execution summary fields bounded and removes entity recovery/snapshot fields', () => {
        const dto = executionSummaryDto({
            id,
            taskId: id,
            attempt: 1,
            status: 'failed',
            error: 'x'.repeat(4000),
            outputSummary: 'rejected',
            purpose: {
                type: 'implementation',
                rework: { reviewExecutionId: id, feedback: 'private detailed feedback' }
            },
            specificationSnapshot: {
                digest: 'digest',
                specification: { version: 1, title: 'Private', requirements: ['Secret'], steps: [] }
            }
        })
        expect(dto).toBeInstanceOf(ProjectTaskExecutionSummaryDto)
        const plain = instanceToPlain(dto)
        expect(plain).toMatchObject({
            purposeType: 'implementation',
            isRework: true,
            businessResult: 'rejected',
            error: 'x'.repeat(300)
        })
        expect(plain).not.toHaveProperty('purpose')
        expect(plain).not.toHaveProperty('specificationSnapshot')
        expect(plain).not.toHaveProperty('outputSummary')
    })
    it('strips nested entity and result body fields before HTTP serialization', () => {
        const plain = instanceToPlain(
            plainToInstance(
                ProjectTaskDetailDto,
                {
                    id,
                    revision: 1,
                    status: 'review',
                    tenantId: 'secret',
                    specificationSnapshot: { digest: 'digest', specification: { description: 'private' } },
                    executions: [
                        {
                            id,
                            attempt: 1,
                            dispatchIntent: { secret: 'secret' },
                            result: {
                                text: 'large report',
                                data: { private: true },
                                artifacts: [{ id, name: 'Report', versionId: id, secret: 'secret' }]
                            },
                            delivery: [{ state: 'pending', ownerId: 'secret' }]
                        }
                    ]
                },
                { excludeExtraneousValues: true }
            )
        )
        expect(JSON.stringify(plain)).not.toMatch(/secret|large report|private/)
        expect(plain.executions[0].result.artifacts[0]).toEqual({ id, name: 'Report', versionId: id })
    })
    it('reauthorizes conditional reads and returns no data for unchanged representations', async () => {
        const viewContext = jest.fn().mockResolvedValue({ projectId: id, projectTitle: 'Project', canEditPlan: true })
        const tasks = Object.assign(Object.create(ProjectTaskGraphService.prototype) as ProjectTaskGraphService, {
            viewContext
        })
        const runtime = Object.create(ProjectTaskRuntimeReadService.prototype) as ProjectTaskRuntimeReadService
        const first = await readTaskView(tasks, runtime, context, query({ resource: 'context' }))
        const version = 'version' in first ? first.version : undefined
        expect(version).toMatch(/^[a-f0-9]{64}$/)
        expect(
            await readTaskView(tasks, runtime, context, query({ resource: 'context', knownVersion: version }))
        ).toEqual({ version, notModified: true })
        expect(viewContext).toHaveBeenCalledTimes(2)
        viewContext.mockRejectedValue(new Error('Revoked'))
        await expect(
            readTaskView(tasks, runtime, context, query({ resource: 'context', knownVersion: version }))
        ).rejects.toThrow('Revoked')
    })
})
