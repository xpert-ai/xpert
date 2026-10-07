import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { randomUUID } from 'node:crypto'
import { AGENT_WORKBENCH_SLOT, type XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import { AGENT_TASK_RESULTS_FEATURE, type AgentInvocation } from '@xpert-ai/plugin-sdk'
import { AgentInvocationEntity } from '../invocation.entity'
import { InvocationActivityService } from '../activity/activity.service'
import { ArtifactsService } from '../../artifacts/artifacts.service'
import { ExecutionReaderService } from './execution-reader.service'
import { CodingExecutionProvider } from './coding-execution.provider'

async function fixture() {
    const invocation: AgentInvocation = {
        id: randomUUID(),
        revision: 2,
        status: 'succeeded',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        scope: {
            tenantId: 'tenant',
            organizationId: 'org',
            userId: 'owner',
            workspaceId: 'workspace',
            projectId: 'project',
            conversationId: 'conversation',
            callerXpertId: 'assistant',
            callerAgentKey: 'main',
            parentExecutionId: 'run'
        },
        request: {
            callId: 'call',
            target: {
                bindingId: 'binding',
                provider: 'uninstalled-adapter',
                reference: 'fixture',
                revision: '1',
                configuration: {}
            },
            input: { prompt: 'fixture' }
        },
        result: {
            text: 'Bearer fake-private-token',
            data: { internal: 'must-not-project' },
            artifacts: [{ id: 'file', versionId: 'version', name: 'test.txt' }]
        }
    }
    const binding = jest.fn().mockResolvedValue({ workspaceIds: ['workspace'] })
    const records = {
        findOneBy: jest.fn().mockResolvedValue({ invocation }),
        manager: { getRepository: () => ({ findOneBy: binding }) }
    }
    const activity = {
        page: jest.fn().mockResolvedValue({ items: [], state: 'not_recorded', nextCursor: 0, hasMore: false, gaps: [] })
    }
    const artifacts = {
        resolveForManagementAccess: jest.fn().mockResolvedValue({
            version: { workspaceFileRef: { filePath: 'test.txt' } },
            buffer: Buffer.from('test'),
            fileName: 'test.txt'
        })
    }
    const module = await Test.createTestingModule({
        providers: [
            CodingExecutionProvider,
            ExecutionReaderService,
            { provide: getRepositoryToken(AgentInvocationEntity), useValue: records },
            { provide: InvocationActivityService, useValue: activity },
            { provide: ArtifactsService, useValue: artifacts }
        ]
    }).compile()
    const context: XpertResolvedViewHostContext = {
        hostType: 'project',
        hostId: 'project',
        tenantId: 'tenant',
        organizationId: 'org',
        userId: 'owner',
        slots: []
    }
    return { invocation, records, binding, activity, artifacts, context, provider: module.get(CodingExecutionProvider) }
}
describe('independent coding execution View', () => {
    it('reads a retained result without requiring an installed strategy and does not project control data', async () => {
        const f = await fixture()
        const page = await f.provider.getViewData(f.context, 'execution', { selectionId: f.invocation.id })
        expect(page.item.execution.result).toEqual({
            text: 'Bearer [REDACTED]',
            artifacts: f.invocation.result.artifacts
        })
        expect(f.activity.page).toHaveBeenCalledWith(f.invocation, 0)
    })
    it('supports project-agent records without inventing an Assistant identity', async () => {
        const f = await fixture()
        delete f.invocation.scope.callerXpertId
        f.invocation.scope.callerType = 'project_agent'
        await expect(
            f.provider.getViewData(f.context, 'execution', { selectionId: f.invocation.id })
        ).resolves.toBeDefined()
        await expect(
            f.provider.getViewData({ ...f.context, hostType: 'agent', hostId: 'assistant' }, 'execution', {
                selectionId: f.invocation.id
            })
        ).rejects.toThrow()
    })
    it('projects the concrete completion failure without leaking runtime control metadata', async () => {
        const f = await fixture()
        f.invocation.status = 'failed'
        f.invocation.error = '[permission_denied] run_shell_command: mkdir -p qa (exit code 1)'
        f.invocation.handle = {
            sessionId: 'session',
            runId: 'run',
            metadata: { completion: { code: 'permission_denied' }, private: 'must-not-project' }
        }
        const page = await f.provider.getViewData(f.context, 'execution', { selectionId: f.invocation.id })
        expect(page.item.execution.error).toBe(f.invocation.error)
        expect(JSON.stringify(page)).not.toContain('must-not-project')
    })
    it('denies another project, tenant, organization or owner even when the invocation ID is known', async () => {
        const f = await fixture()
        for (const change of [
            { hostId: 'another-project' },
            { tenantId: 'another-tenant' },
            { organizationId: 'another-org' },
            { userId: 'another-owner' }
        ])
            await expect(
                f.provider.getViewData({ ...f.context, ...change }, 'execution', { selectionId: f.invocation.id })
            ).rejects.toThrow()
        expect(f.activity.page).not.toHaveBeenCalled()
    })
    it('honors explicit revocation and limits downloads to the captured artifact version', async () => {
        const f = await fixture()
        await f.provider.resolveViewFile(f.context, 'execution', {
            targetId: f.invocation.id,
            fileKey: 'file',
            purpose: 'download'
        })
        expect(f.artifacts.resolveForManagementAccess).toHaveBeenCalledWith({
            artifactId: 'file',
            artifactVersionId: 'version'
        })
        await expect(
            f.provider.resolveViewFile(f.context, 'execution', {
                targetId: f.invocation.id,
                fileKey: '../../private',
                purpose: 'download'
            })
        ).rejects.toThrow()
        f.binding.mockResolvedValue(null)
        await expect(f.provider.getViewData(f.context, 'execution', { selectionId: f.invocation.id })).rejects.toThrow()
    })
    it('activates ordinary runtime calls in a project without requiring Project Tasks', async () => {
        const f = await fixture()
        const manifests = f.provider.getViewManifests(
            { ...f.context, hostType: 'agent', capabilities: { features: [AGENT_TASK_RESULTS_FEATURE] } },
            AGENT_WORKBENCH_SLOT
        )
        expect(manifests[0].activation.requiredFeatures).toEqual([AGENT_TASK_RESULTS_FEATURE])
        await expect(
            f.provider.getViewData(f.context, 'execution', { selectionId: f.invocation.id, parameters: { after: -1 } })
        ).rejects.toThrow()
    })
})
