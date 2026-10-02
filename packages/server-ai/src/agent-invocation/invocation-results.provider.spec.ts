import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { randomUUID } from 'node:crypto'
import { AGENT_WORKBENCH_SLOT, type XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import { AGENT_TASK_RESULTS_FEATURE, type AgentInvocationScope, type AgentInvocationResult } from '@xpert-ai/plugin-sdk'
import {
    isManifestActiveForContext,
    normalizeManifest,
    validateQuery
} from '../../../server/src/view-extension/view-extension.utils'
import { InvocationResultsProvider } from './invocation-results.provider'
import { AgentInvocationEntity } from './invocation.entity'
import { AgentInvocationFactoryService } from './invocation-factory.service'
import { ArtifactsService } from '../artifacts/artifacts.service'

async function setup() {
    const id = randomUUID()
    const scope: AgentInvocationScope = {
        tenantId: 'tenant',
        organizationId: 'org',
        userId: 'user',
        callerXpertId: 'assistant',
        conversationId: 'conversation',
        callerAgentKey: 'agent',
        parentExecutionId: 'execution'
    }
    const result: AgentInvocationResult = {
        text: 'Done',
        artifacts: [{ id: 'file', versionId: 'version', name: 'report.txt' }]
    }
    const invocation = { id, scope, result }
    const records = { findOneBy: jest.fn().mockResolvedValue({ invocation }) }
    const inspect = jest.fn().mockResolvedValue(invocation)
    const artifacts = {
        getArtifact: jest.fn().mockResolvedValue({ id: 'file', currentVersionId: 'newer-version' }),
        resolveForManagementAccess: jest.fn().mockResolvedValue({
            version: { workspaceFileRef: { filePath: 'report.txt' } },
            fileName: 'report.txt',
            mimeType: 'text/plain',
            buffer: Buffer.from('passed')
        })
    }
    const module = await Test.createTestingModule({
        providers: [
            InvocationResultsProvider,
            { provide: getRepositoryToken(AgentInvocationEntity), useValue: records },
            { provide: AgentInvocationFactoryService, useValue: { createScopedApi: () => ({ inspect }) } },
            { provide: ArtifactsService, useValue: artifacts }
        ]
    }).compile()
    const context: XpertResolvedViewHostContext = {
        tenantId: 'tenant',
        organizationId: 'org',
        userId: 'user',
        hostType: 'agent',
        hostId: 'assistant',
        slots: []
    }
    return { id, scope, result, records, inspect, artifacts, context, provider: module.get(InvocationResultsProvider) }
}
describe('task result resource view', () => {
    it('activates through the feature policy and accepts the card navigation query', async () => {
        const f = await setup()
        const context: XpertResolvedViewHostContext = {
            ...f.context,
            slots: [
                { key: AGENT_WORKBENCH_SLOT, mode: 'sections', manifestPolicy: { requireFeatureActivation: true } }
            ],
            capabilities: { features: [AGENT_TASK_RESULTS_FEATURE] }
        }
        const manifests = f.provider.getViewManifests(context, AGENT_WORKBENCH_SLOT)
        expect(manifests).toHaveLength(1)
        const manifest = normalizeManifest(manifests[0], 'platform.agent-results', context, AGENT_WORKBENCH_SLOT)
        expect(isManifestActiveForContext(manifest, context)).toBe(true)
        expect(isManifestActiveForContext(manifest, { ...context, capabilities: { features: [] } })).toBe(false)
        expect(manifest.workbench.openMode).toBe('on-demand')
        expect(() =>
            validateQuery({ selectionId: f.id, parameters: { itemId: 'tests' } }, manifest.dataSource)
        ).not.toThrow()
    })
    it('revalidates task access and pins downloads to the emitted artifact version', async () => {
        const f = await setup()
        await f.provider.getViewData(f.context, 'results', { selectionId: f.id })
        const file = await f.provider.resolveViewFile(f.context, 'results', {
            targetId: f.id,
            fileKey: 'file',
            purpose: 'download'
        })
        expect(f.inspect).toHaveBeenCalledTimes(2)
        expect(f.artifacts.resolveForManagementAccess).toHaveBeenCalledWith({
            artifactId: 'file',
            artifactVersionId: 'version'
        })
        expect(file.fileName).toBe('report.txt')
    })
    it('does not allow cards to select another owner or Assistant, or an arbitrary artifact', async () => {
        const f = await setup()
        for (const change of [{ userId: 'other' }, { hostId: 'other' }, { organizationId: 'other' }])
            await expect(
                f.provider.getViewData({ ...f.context, ...change }, 'results', { selectionId: f.id })
            ).rejects.toThrow()
        await expect(
            f.provider.resolveViewFile(f.context, 'results', {
                targetId: f.id,
                fileKey: 'unrelated',
                purpose: 'download'
            })
        ).rejects.toThrow()
        expect(f.artifacts.getArtifact).not.toHaveBeenCalled()
    })
    it('honors a revoked binding instead of trusting a persisted card', async () => {
        const f = await setup()
        f.inspect.mockRejectedValue(new Error('revoked'))
        await expect(f.provider.getViewData(f.context, 'results', { selectionId: f.id })).rejects.toThrow('revoked')
    })
    it('does not silently download a newer version for a legacy unpinned reference', async () => {
        const f = await setup()
        delete f.result.artifacts[0].versionId
        await expect(
            f.provider.resolveViewFile(f.context, 'results', { targetId: f.id, fileKey: 'file', purpose: 'download' })
        ).rejects.toThrow()
        expect(f.artifacts.resolveForManagementAccess).not.toHaveBeenCalled()
    })
    it('rejects another tenant, project or conversation before inspecting the task', async () => {
        const f = await setup()
        const runtimeScope = {
            projectId: null,
            conversationId: 'other',
            dataScopeKey: 'test',
            workspaceFiles: { catalog: 'user-xperts' as const, scopeId: 'assistant' }
        }
        for (const context of [
            { ...f.context, tenantId: 'other' },
            { ...f.context, runtimeScope },
            { ...f.context, runtimeScope: { ...runtimeScope, projectId: 'other', conversationId: 'conversation' } }
        ]) {
            await expect(f.provider.getViewData(context, 'results', { selectionId: f.id })).rejects.toThrow()
        }
        expect(f.inspect).not.toHaveBeenCalled()
    })
    it('rejects missing identity before issuing a repository query', async () => {
        const f = await setup()
        await expect(
            f.provider.getViewData({ ...f.context, userId: undefined }, 'results', { selectionId: f.id })
        ).rejects.toThrow()
        expect(f.records.findOneBy).not.toHaveBeenCalled()
    })
    it('rejects unknown views, malformed task IDs and unsupported file purposes', async () => {
        const f = await setup()
        await expect(f.provider.getViewData(f.context, 'other', { selectionId: f.id })).rejects.toThrow()
        await expect(f.provider.getViewData(f.context, 'results', { selectionId: 'invalid' })).rejects.toThrow()
        await expect(
            f.provider.resolveViewFile(f.context, 'results', { targetId: f.id, fileKey: 'file', purpose: 'preview' })
        ).rejects.toThrow()
        expect(f.artifacts.resolveForManagementAccess).not.toHaveBeenCalled()
    })
})
