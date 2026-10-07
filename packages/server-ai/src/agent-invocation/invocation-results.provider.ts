// Cards are presentation only. Every read/download rechecks owner, Assistant and current binding access.
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
    AGENT_TASK_RESULTS_FEATURE,
    IXpertViewExtensionProvider,
    renderRemoteModuleIframeHtml,
    ViewExtensionProvider
} from '@xpert-ai/plugin-sdk'
import {
    AGENT_WORKBENCH_SLOT,
    type XpertExtensionViewManifest,
    type XpertResolvedViewHostContext,
    type XpertViewFileAccessRequest,
    type XpertViewQuery,
    type XpertRemoteComponentViewSchema
} from '@xpert-ai/contracts'
import { ExecutionReaderService } from './execution-view/execution-reader.service'
import { invocationError } from './invocation-runtime'
import { ArtifactsService } from '../artifacts/artifacts.service'

@ViewExtensionProvider('platform.agent-results')
export class InvocationResultsProvider implements IXpertViewExtensionProvider {
    constructor(
        private readonly reader: ExecutionReaderService,
        private readonly artifacts: ArtifactsService
    ) {}

    supports(context: XpertResolvedViewHostContext) {
        return context.hostType === 'agent' || context.hostType === 'project'
    }
    getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
        if (
            !this.supports(context) ||
            slot !== (context.hostType === 'agent' ? AGENT_WORKBENCH_SLOT : 'task.management')
        )
            return []
        return [
            {
                key: 'results',
                hostType: context.hostType,
                slot,
                title: { en_US: 'Task results', zh_Hans: '任务结果' },
                icon: { type: 'emoji', value: '📋' },
                source: { provider: 'platform.agent-results' },
                ...(context.hostType === 'agent'
                    ? {
                          activation: {
                              requiredFeatures: [
                                  context.capabilities?.features?.includes(AGENT_TASK_RESULTS_FEATURE)
                                      ? AGENT_TASK_RESULTS_FEATURE
                                      : 'project.tasks'
                              ]
                          }
                      }
                    : {}),
                workbench: { openMode: 'on-demand', menu: { enabled: false } },
                refreshable: true,
                view: {
                    type: 'remote_component',
                    runtime: 'esm',
                    protocolVersion: 1,
                    component: { entry: 'agent-results', isolation: 'iframe' },
                    dataSource: { mode: 'platform' }
                },
                dataSource: {
                    mode: 'platform',
                    cache: { enabled: false },
                    querySchema: { supportsSelection: true, supportsParameters: true }
                },
                fileAccess: { purposes: ['download'] }
            }
        ]
    }
    async getViewData(context: XpertResolvedViewHostContext, key: string, query: XpertViewQuery) {
        this.assertKey(key)
        if (!query.selectionId) return { item: null }
        const invocation = await this.read(context, query.selectionId)
        return {
            item: {
                id: invocation.id,
                status: invocation.status,
                result: invocation.result,
                error: invocation.error,
                selectedItemId: typeof query.parameters?.itemId === 'string' ? query.parameters.itemId : null
            }
        }
    }
    async resolveViewFile(context: XpertResolvedViewHostContext, key: string, request: XpertViewFileAccessRequest) {
        this.assertKey(key)
        if (request.purpose !== 'download') throw invocationError('NotFound')
        const invocation = await this.read(context, request.targetId)
        const reference = invocation.result?.artifacts?.find((item) => item.id === request.fileKey)
        // Historical unpinned references remain readable, but must never select a later version silently.
        if (!reference?.versionId) throw invocationError('NotFound')
        const resolved = await this.artifacts.resolveForManagementAccess({
            artifactId: reference.id,
            artifactVersionId: reference.versionId
        })
        return {
            reference: resolved.version.workspaceFileRef,
            fileName: resolved.fileName,
            mimeType: resolved.mimeType,
            size: resolved.buffer.length
        }
    }
    async getRemoteComponentEntry(
        _context: XpertResolvedViewHostContext,
        key: string,
        component: XpertRemoteComponentViewSchema['component']
    ) {
        this.assertKey(key)
        if (component.entry !== 'agent-results') throw invocationError('NotFound')
        const root =
            process.env.NODE_ENV === 'production'
                ? join(__dirname, 'remote-components', 'agent-results')
                : join(process.cwd(), 'packages/server-ai/src/agent-invocation/remote-components/agent-results')
        return {
            contentType: 'text/html; charset=utf-8' as const,
            html: renderRemoteModuleIframeHtml({
                title: 'Task results',
                appScript: await readFile(join(root, 'app.js'), 'utf8'),
                appCss: await readFile(join(root, 'app.css'), 'utf8')
            })
        }
    }
    private assertKey(key: string) {
        if (key !== 'results') throw invocationError('NotFound')
    }
    private async read(context: XpertResolvedViewHostContext, id?: string) {
        return this.reader.read(context, id)
    }
}
