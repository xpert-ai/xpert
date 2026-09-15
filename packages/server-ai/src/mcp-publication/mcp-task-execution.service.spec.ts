import { ForbiddenException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { RequestContext } from '@xpert-ai/server-core'
import { MCP_CAPABILITY_DESCRIPTOR_VERSION } from '@xpert-ai/contracts'
import { McpPublication, McpPublicationCapability, McpTask } from './entities'
import { McpTaskExecutionService } from './mcp-task-execution.service'
import { McpPublicationService } from './mcp-publication.service'
import { McpPublicationAuthorizationService } from './mcp-publication-authorization.service'
import type { Repository, FindOneOptions } from 'typeorm'
import { McpCapabilityCatalog } from './entities'
import { XpertToolset } from '../xpert-toolset/xpert-toolset.entity'
import type { McpTaskJobPayload } from './mcp-task.service'

describe('MCP delayed execution boundary', () => {
    let service: McpTaskExecutionService
    let payload: McpTaskJobPayload
    let task: McpTask
    let publication: McpPublication
    let binding: McpPublicationCapability
    const findOne = jest.fn()
    const assertCanRun = jest.fn()
    const execute = jest.fn()
    const resolveRuntimeCapabilities = jest.fn()
    beforeEach(async () => {
        jest.clearAllMocks()
        publication = Object.assign(new McpPublication(), {
            id: 'pub',
            tenantId: 'tenant',
            runtime: { files: { type: 'user' } }
        })
        task = Object.assign(new McpTask(), {
            publicationId: 'pub',
            tenantId: 'tenant',
            capabilityId: 'cap',
            subjectType: 'user',
            subjectId: 'alice',
            toolName: 'cut_start_transcription'
        })
        payload = {
            version: 1,
            approvalGranted: true,
            taskId: 'task',
            publicationId: 'pub',
            capabilityId: 'cap',
            tenantId: 'tenant',
            toolsetId: 'toolset',
            capabilityKey: 'cut_start_transcription',
            arguments: {},
            principal: { type: 'user', id: 'alice', userId: 'alice' },
            runtime: { files: { type: 'user' } }
        }
        binding = Object.assign(new McpPublicationCapability(), {
            id: 'cap',
            capabilityType: 'tool',
            descriptorHash: 'descriptor-1',
            toolsetId: 'toolset',
            capabilityKey: 'cut_start_transcription',
            enabled: true,
            descriptorSnapshot: {
                descriptorVersion: MCP_CAPABILITY_DESCRIPTOR_VERSION,
                capabilityType: 'tool',
                capabilityKey: 'cut_start_transcription',
                behavior: { risk: 'write', sideEffect: 'reversible', idempotency: 'idempotent' }
            }
        })
        findOne.mockResolvedValue(publication)
        resolveRuntimeCapabilities.mockImplementation(async () => [binding])
        assertCanRun.mockResolvedValue({ id: 'alice', tenantId: 'tenant' })
        execute.mockImplementation(async () => ({
            userId: RequestContext.currentUserId(),
            tenantId: RequestContext.currentTenantId()
        }))
        const module = await Test.createTestingModule({
            providers: [
                McpTaskExecutionService,
                { provide: getRepositoryToken(McpPublication), useValue: { findOne } },
                { provide: McpPublicationService, useValue: { resolveRuntimeCapabilities } },
                { provide: McpPublicationAuthorizationService, useValue: { assertCanRun } }
            ]
        }).compile()
        service = module.get(McpTaskExecutionService)
    })
    it('restores the verified original actor and captured storage binding', async () => {
        await expect(service.run(task, payload, execute)).resolves.toEqual({ userId: 'alice', tenantId: 'tenant' })
        expect(execute).toHaveBeenCalledWith({ files: { type: 'user' } })
    })
    it.each([false, undefined])(
        'rejects a newly required confirmation without prior approval (%s)',
        async (approvalGranted) => {
            payload.approvalGranted = approvalGranted
            binding.policy = { approvalMode: 'allow' }
            await expect(service.run(task, payload, execute)).resolves.toBeDefined()
            execute.mockClear()
            binding.policy = { approvalMode: 'confirm' }
            await expect(service.run(task, payload, execute)).rejects.toBeInstanceOf(ForbiddenException)
            expect(execute).not.toHaveBeenCalled()
        }
    )
    it('preserves an approval already obtained before queueing', async () => {
        payload.approvalGranted = true
        binding.policy = { approvalMode: 'confirm' }
        await expect(service.run(task, payload, execute)).resolves.toBeDefined()
    })
    it('loads persisted bindings before using the real runtime capability resolver', async () => {
        const catalog = Object.create(McpPublicationService.prototype) as McpPublicationService
        Object.assign(catalog, {
            catalogRepository: {
                find: jest.fn().mockResolvedValue([
                    {
                        toolsetId: binding.toolsetId,
                        capabilityType: binding.capabilityType,
                        capabilityKey: binding.capabilityKey,
                        descriptorHash: binding.descriptorHash
                    }
                ])
            } as Partial<Repository<McpCapabilityCatalog>>,
            toolsetRepository: {
                find: jest.fn().mockResolvedValue([{ id: binding.toolsetId }])
            } as Partial<Repository<XpertToolset>>
        })
        findOne.mockImplementation(async (options: FindOneOptions<McpPublication>) => ({
            ...publication,
            capabilities:
                Array.isArray(options.relations) && options.relations.includes('capabilities') ? [binding] : undefined
        }))
        resolveRuntimeCapabilities.mockImplementation((value: McpPublication) =>
            catalog.resolveRuntimeCapabilities(value)
        )
        await expect(service.run(task, payload, execute)).resolves.toEqual({ userId: 'alice', tenantId: 'tenant' })
        expect(execute).toHaveBeenCalledTimes(1)
        execute.mockClear()
        binding.enabled = false
        await expect(service.run(task, payload, execute)).rejects.toBeInstanceOf(ForbiddenException)
        expect(execute).not.toHaveBeenCalled()
        findOne.mockResolvedValueOnce({ ...publication, capabilities: [] })
        await expect(service.run(task, payload, execute)).rejects.toBeInstanceOf(ForbiddenException)
        expect(execute).not.toHaveBeenCalled()
    })
    it.each(['identity', 'membership', 'publication', 'binding', 'configuration', 'policy'] as const)(
        'rejects changed %s before invoking the plugin',
        async (change) => {
            if (change === 'identity') payload.principal.userId = 'bob'
            if (change === 'membership') assertCanRun.mockRejectedValueOnce(new ForbiddenException())
            if (change === 'publication') findOne.mockResolvedValueOnce(null)
            if (change === 'binding') binding.enabled = false
            if (change === 'configuration') publication.runtime = null
            if (change === 'policy') binding.policy = { approvalMode: 'deny' }
            await expect(service.run(task, payload, execute)).rejects.toBeInstanceOf(ForbiddenException)
            expect(execute).not.toHaveBeenCalled()
        }
    )
})
