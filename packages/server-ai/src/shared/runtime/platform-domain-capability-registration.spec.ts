import 'reflect-metadata'
import { Reflector } from '@nestjs/core'

// Exercise real providers and discovery without loading the SDK's server barrel.
jest.mock('@xpert-ai/plugin-sdk', () => ({
    ...jest.requireActual('../../../../plugin-sdk/src/lib/core/runtime-capability'),
    ...jest.requireActual('../../../../plugin-sdk/src/lib/runtime/capabilities/project-provisioning'),
    ...jest.requireActual('../../../../plugin-sdk/src/lib/runtime/capabilities/knowledgebase'),
    ...jest.requireActual('../../../../plugin-sdk/src/lib/runtime/capabilities/knowledgebase-documents'),
    ...jest.requireActual('../../../../plugin-sdk/src/lib/agent/middleware/capabilities/assistant-task'),
    ...jest.requireActual('../../../../plugin-sdk/src/lib/channel/cancel-conversation.command'),
    RequestContext: {
        currentTenantId: () => 'tenant-1',
        getOrganizationId: () => 'org-1'
    }
}))
jest.mock('@xpert-ai/server-core', () => jest.requireActual('../../../../server/src/plugin/types'))
jest.mock('../../xpert-project/services/project-purge.service', () => ({ XpertProjectPurgeService: class {} }))

import {
    AssistantTaskRuntimeCapability,
    KnowledgebaseRuntimeCapability,
    KnowledgebaseDocumentsRuntimeCapability,
    KnowledgebaseProvisioningRuntimeCapability,
    ProjectProvisioningRuntimeCapability,
    DefaultRuntimeCapabilityRegistry,
    CancelConversationCommand
} from '@xpert-ai/plugin-sdk'
import { RuntimeCapabilityProviderExplorer } from './runtime-capability-provider-explorer.service'
import { ProjectProvisioningRuntimeService } from '../../xpert-project/services/project-provisioning-runtime.service'
import { EnsureXpertProjectCommand } from '../../xpert-project/commands/ensure-project.command'
import { KnowledgebaseRuntimeService } from '../../knowledgebase/runtime/knowledgebase-runtime.service'
import { KnowledgebaseDocumentsRuntimeService } from '../../knowledgebase/runtime/knowledgebase-documents-runtime.service'
import { KnowledgebaseProvisioningRuntimeService } from '../../knowledgebase/runtime/knowledgebase-provisioning-runtime.service'
import { AssistantTaskRuntimeService } from '../../xpert-agent-execution/runtime/assistant-task-runtime.service'
import { ListWorkspaceKnowledgebasesQuery, KnowledgeSearchQuery } from '../../knowledgebase/queries'
import { GetKnowledgebaseDocumentStatusCommand } from '../../knowledgebase/commands'

function fixture() {
    const commands = { execute: jest.fn() }
    const queries = { execute: jest.fn() }
    const projects = { purge: jest.fn() }
    const project = new ProjectProvisioningRuntimeService(commands as never, projects as never)
    const knowledge = new KnowledgebaseRuntimeService(commands as never, queries as never)
    const documents = new KnowledgebaseDocumentsRuntimeService(commands as never)
    const provisioning = new KnowledgebaseProvisioningRuntimeService(commands as never)
    const tasks = new AssistantTaskRuntimeService(commands as never, queries as never)
    const providers = [project, knowledge, documents, provisioning, tasks]
    const registry = new DefaultRuntimeCapabilityRegistry()
    const explorer = new RuntimeCapabilityProviderExplorer(
        { getProviders: () => providers.map((instance) => ({ instance })) } as never,
        new Reflector(),
        registry
    )
    explorer.onModuleInit()
    return { registry, project, knowledge, documents, provisioning, tasks, commands, queries, projects }
}

describe('platform domain capabilities outside Agent execution', () => {
    it('discovers the actual domain services without constructing an Agent runtime or adapters', () => {
        const f = fixture()
        expect(f.registry.require(ProjectProvisioningRuntimeCapability)).toBe(f.project)
        expect(f.registry.require(KnowledgebaseRuntimeCapability)).toBe(f.knowledge)
        expect(f.registry.require(KnowledgebaseDocumentsRuntimeCapability)).toBe(f.documents)
        expect(f.registry.require(KnowledgebaseProvisioningRuntimeCapability)).toBe(f.provisioning)
        expect(f.registry.require(AssistantTaskRuntimeCapability)).toBe(f.tasks)
    })

    it('preserves stable project identity and the existing ownership checks', async () => {
        const f = fixture()
        const api = f.registry.require(ProjectProvisioningRuntimeCapability)
        const input = { projectId: 'project-1', xpertId: 'assistant-1', name: 'Test bid', status: 'active' as const }
        f.commands.execute.mockResolvedValue({
            projectId: input.projectId,
            xpertIds: [input.xpertId],
            operation: 'created'
        })
        await expect(api.ensure(input)).resolves.toMatchObject({ projectId: input.projectId })
        expect(f.commands.execute).toHaveBeenCalledWith(new EnsureXpertProjectCommand(input))
        f.commands.execute.mockRejectedValue(new Error('project owner required'))
        await expect(api.ensure(input)).rejects.toThrow('project owner required')
        await api.purge?.({ projectId: input.projectId, xpertId: input.xpertId })
        expect(f.projects.purge).toHaveBeenCalledWith({ projectId: input.projectId, xpertId: input.xpertId })
    })

    it('dispatches knowledge and document operations directly to CQRS with the caller scope', async () => {
        const f = fixture()
        await f.registry.require(KnowledgebaseRuntimeCapability).list({ workspaceId: 'workspace-1', limit: 10 })
        expect(f.queries.execute).toHaveBeenCalledWith(
            new ListWorkspaceKnowledgebasesQuery({ workspaceId: 'workspace-1', limit: 10 })
        )
        await f.knowledge.search({ knowledgebaseIds: ['library-1'], query: 'requirements', source: 'platform-test' })
        expect(f.queries.execute).toHaveBeenLastCalledWith(
            expect.objectContaining({
                input: expect.objectContaining({ tenantId: 'tenant-1', organizationId: 'org-1' })
            })
        )
        expect(f.queries.execute.mock.lastCall?.[0]).toBeInstanceOf(KnowledgeSearchQuery)
        const input = { knowledgebaseId: 'library-1', documentIds: ['document-1'] }
        await f.registry.require(KnowledgebaseDocumentsRuntimeCapability).getDocumentStatus(input)
        expect(f.commands.execute).toHaveBeenCalledWith(new GetKnowledgebaseDocumentStatusCommand(input))
        f.commands.execute.mockRejectedValueOnce(new Error('document access denied'))
        await expect(f.documents.getDocumentStatus(input)).rejects.toThrow('document access denied')
    })

    it('keeps task cancellation and validation available to callers without an Agent runtime', async () => {
        const f = fixture()
        const api = f.registry.require(AssistantTaskRuntimeCapability)
        f.commands.execute.mockResolvedValue({ canceledExecutionIds: ['execution-1'] })
        await expect(api.cancelTask({ executionId: 'execution-1' })).resolves.toEqual({
            canceledExecutionIds: ['execution-1']
        })
        expect(f.commands.execute).toHaveBeenCalledWith(new CancelConversationCommand({ executionId: 'execution-1' }))
        await expect(api.startTask({ xpertId: '', prompt: 'Task' })).rejects.toThrow('xpertId is required')
    })
})
