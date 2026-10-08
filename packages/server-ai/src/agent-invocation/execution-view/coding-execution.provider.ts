import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod/v3'
import {
    AGENT_WORKBENCH_SLOT,
    type XpertExtensionViewManifest,
    type XpertResolvedViewHostContext,
    type XpertViewQuery,
    type XpertViewFileAccessRequest
} from '@xpert-ai/contracts'
import {
    ViewExtensionProvider,
    renderRemoteModuleIframeHtml,
    AGENT_TASK_RESULTS_FEATURE,
    type IXpertViewExtensionProvider
} from '@xpert-ai/plugin-sdk'
import { InvocationActivityService, redact } from '../activity/activity.service'
import { ExecutionReaderService } from './execution-reader.service'
import { ArtifactsService } from '../../artifacts/artifacts.service'
import { invocationError } from '../invocation-runtime'

@ViewExtensionProvider('platform.coding-execution')
export class CodingExecutionProvider implements IXpertViewExtensionProvider {
    constructor(
        private readonly reader: ExecutionReaderService,
        private readonly activity: InvocationActivityService,
        private readonly artifacts: ArtifactsService
    ) {}
    supports(context: XpertResolvedViewHostContext) {
        return ['agent', 'project'].includes(context.hostType)
    }
    getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
        if (
            !this.supports(context) ||
            slot !== (context.hostType === 'agent' ? AGENT_WORKBENCH_SLOT : 'task.management')
        )
            return []
        return [
            {
                key: 'execution',
                hostType: context.hostType,
                slot,
                title: { en_US: 'Coding execution', zh_Hans: 'Coding 执行' },
                icon: { type: 'emoji', value: '⌘' },
                source: { provider: 'platform.coding-execution' },
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
                    component: { entry: 'coding-execution', isolation: 'iframe' },
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
        if (key !== 'execution') throw invocationError('NotFound')
        if (!query.selectionId) return { item: { execution: null } }
        const parameters = z
            .object({
                after: z.coerce.number().int().min(0).max(20000).default(0),
                outputKey: z
                    .string()
                    .regex(/^[a-f0-9]{64}$/)
                    .optional(),
                offset: z.coerce
                    .number()
                    .int()
                    .min(0)
                    .max(2 * 1024 * 1024)
                    .default(0)
            })
            .strict()
            .parse(query.parameters ?? {})
        const invocation = await this.reader.read(context, query.selectionId)
        if (parameters.outputKey)
            return { item: { output: await this.activity.output(invocation, parameters.outputKey, parameters.offset) } }
        return {
            item: {
                execution: {
                    id: invocation.id,
                    provider: invocation.request.target.provider,
                    status: invocation.status,
                    createdAt: invocation.createdAt,
                    updatedAt: invocation.updatedAt,
                    progress: invocation.progress,
                    tool: invocation.handle?.runner?.tool,
                    workingDirectory: invocation.handle?.runner?.workingDirectory,
                    result: invocation.result
                        ? { text: redact(invocation.result.text ?? ''), artifacts: invocation.result.artifacts }
                        : undefined,
                    error: invocation.error ? redact(invocation.error) : undefined
                },
                activity: await this.activity.page(invocation, parameters.after)
            }
        }
    }
    async resolveViewFile(context: XpertResolvedViewHostContext, key: string, request: XpertViewFileAccessRequest) {
        if (key !== 'execution' || request.purpose !== 'download') throw invocationError('NotFound')
        const invocation = await this.reader.read(context, request.targetId)
        const file = invocation.result?.artifacts?.find((item) => item.id === request.fileKey)
        if (!file?.versionId) throw invocationError('NotFound')
        const resolved = await this.artifacts.resolveForManagementAccess({
            artifactId: file.id,
            artifactVersionId: file.versionId
        })
        return {
            reference: resolved.version.workspaceFileRef,
            fileName: resolved.fileName,
            mimeType: resolved.mimeType,
            size: resolved.buffer.length
        }
    }
    async getRemoteComponentEntry(_context: XpertResolvedViewHostContext, key: string) {
        if (key !== 'execution') throw invocationError('NotFound')
        const bundled = join(__dirname, 'remote-components', 'coding-execution')
        const root = existsSync(bundled)
            ? bundled
            : process.env.NODE_ENV === 'production'
              ? join(__dirname, '..', 'remote-components', 'coding-execution')
              : join(process.cwd(), 'packages/server-ai/src/agent-invocation/remote-components/coding-execution')
        return {
            contentType: 'text/html; charset=utf-8' as const,
            html: renderRemoteModuleIframeHtml({
                title: 'Coding execution',
                appScript: await readFile(join(root, 'app.js'), 'utf8'),
                appCss: await readFile(join(root, 'app.css'), 'utf8')
            })
        }
    }
}
