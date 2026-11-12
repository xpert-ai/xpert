import { ConfigurationEditorsService } from './services/configuration-editors.service'
import { ConfigurationAutomationService } from './services/configuration-automation.service'
import { ConfigurationConnectorsService } from './services/configuration-connectors.service'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { BadRequestException, ForbiddenException, Inject } from '@nestjs/common'
import { z } from 'zod'
import { t } from 'i18next'
import {
    AGENT_WORKBENCH_SLOT,
    PROJECT_CONFIGURATION_PROVIDER,
    PROJECT_CONFIGURATION_ACTIONS,
    PROJECT_CONFIGURATION_ACTION_HANDLERS,
    projectConfigurationActionSchema,
    type XpertResolvedViewHostContext,
    type XpertExtensionViewManifest,
    type XpertViewActionRequest
} from '@xpert-ai/contracts'
import {
    XPERT_RUNTIME_CAPABILITIES_TOKEN,
    ProjectConfigurationRuntimeCapability,
    type RuntimeCapabilityRegistry,
    type ProjectConfigurationScope,
    ViewExtensionProvider,
    renderRemoteReactIframeHtml,
    type XpertViewFileActionFile,
    type IXpertViewExtensionProvider
} from '@xpert-ai/plugin-sdk'

const requireHere = createRequire(__filename)
const text = (en_US: string, zh_Hans: string) => ({ en_US, zh_Hans })

@ViewExtensionProvider(PROJECT_CONFIGURATION_PROVIDER)
export class ProjectConfigurationViewProvider implements IXpertViewExtensionProvider {
    constructor(
        @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly capabilities: RuntimeCapabilityRegistry,
        private readonly editors: ConfigurationEditorsService,
        private readonly automations: ConfigurationAutomationService,
        private readonly connectors: ConfigurationConnectorsService
    ) {}

    supports(context: XpertResolvedViewHostContext) {
        return context.hostType === 'project' || context.hostType === 'agent'
    }

    getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
        const agent = context.hostType === 'agent'
        if (
            !this.supports(context) ||
            slot !== (agent ? AGENT_WORKBENCH_SLOT : 'project.configuration') ||
            (agent && !context.runtimeScope?.projectId)
        )
            return []
        return [
            {
                key: 'configuration',
                title: text('Project configuration', '项目配置'),
                hostType: context.hostType,
                slot,
                source: { provider: PROJECT_CONFIGURATION_PROVIDER },
                refreshable: true,
                icon: {
                    type: 'svg',
                    value: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h2m6 0h8M4 17h8m6 0h2M6 4h6v6H6zM12 14h6v6h-6z"/></svg>'
                },
                ...(agent
                    ? {
                          activation: { requiredFeatures: ['project.tasks'] },
                          workbench: { openMode: 'on-demand' as const, menu: { enabled: true, order: 51 } }
                      }
                    : {}),
                view: {
                    type: 'remote_component',
                    runtime: 'react',
                    protocolVersion: 1,
                    component: { isolation: 'iframe', entry: 'project-configuration' },
                    dataSource: { mode: 'platform' }
                },
                dataSource: { mode: 'platform', cache: { enabled: false } },
                actions: [
                    { key: 'instructions', label: text('Save instructions', '保存指令'), actionType: 'invoke' },
                    { key: 'skill-upload', label: text('Upload skill package', '上传技能包'), actionType: 'invoke', transport: 'file' },
                    ...PROJECT_CONFIGURATION_ACTIONS.map((key) => ({ key, label: text('Project configuration', '项目配置'), actionType: 'invoke' as const }))
                ]
            }
        ]
    }

    private scope(context: XpertResolvedViewHostContext): ProjectConfigurationScope {
        const projectId = context.hostType === 'project' ? context.hostId : context.runtimeScope?.projectId
        if (!this.supports(context) || !projectId || !context.tenantId || !context.userId)
            throw new ForbiddenException(t('server-ai:Error.ProjectTaskContextRequired'))
        return {
            actor: { tenantId: context.tenantId, organizationId: context.organizationId, userId: context.userId },
            projectId,
            ...(context.hostType === 'agent' ? { assistantId: context.hostId } : {})
        }
    }

    async getViewData(context: XpertResolvedViewHostContext) {
        return { item: await this.capabilities.require(ProjectConfigurationRuntimeCapability).getOverview(this.scope(context)) }
    }

    async executeViewAction(
        context: XpertResolvedViewHostContext,
        _viewKey: string,
        actionKey: string,
        request: XpertViewActionRequest
    ) {
        const api = this.capabilities.require(ProjectConfigurationRuntimeCapability)
        if (actionKey !== 'instructions') {
            if (!PROJECT_CONFIGURATION_ACTIONS.some((key) => key === actionKey))
                throw new BadRequestException(t('server-ai:Error.ProjectTaskActionUnsupported'))
            const service = this[PROJECT_CONFIGURATION_ACTION_HANDLERS[projectConfigurationActionSchema.parse(actionKey)]]
            const data = await service.execute(api, this.scope(context), actionKey, request.input ?? {})
            return { success: true, data }
        }
        const input = z
            .object({ content: z.string().max(1048576) })
            .strict()
            .parse(request.input)
        await api.updateInstructions(this.scope(context), input.content)
        return { success: true }
    }
    async executeViewFileAction(context: XpertResolvedViewHostContext, _viewKey: string, actionKey: string,
        _request: XpertViewActionRequest, file: XpertViewFileActionFile) {
        const api = this.capabilities.require(ProjectConfigurationRuntimeCapability)
        if (actionKey !== 'skill-upload' || file.buffer.length > 25 * 1024 * 1024)
            throw new BadRequestException(t('server-ai:Error.ProjectSkillArchiveRequired'))
        await api.uploadSkill(this.scope(context), file)
        return { success: true }
    }
    async getRemoteComponentEntry() {
        // Source/tsc retain plugin assets; the bundled API copies remote-components beside main.js.
        const root = join(__dirname, 'remote-components', 'project-configuration')
        const packageFile = (name: string, file: string) =>
            readFile(join(dirname(requireHere.resolve(`${name}/package.json`)), file), 'utf8')
        const [appScript, appCss, reactUmd, reactDomUmd] = await Promise.all([
            readFile(join(root, 'app.js'), 'utf8'),
            readFile(join(root, 'app.css'), 'utf8'),
            packageFile('react', 'umd/react.production.min.js'),
            packageFile('react-dom', 'umd/react-dom.production.min.js')
        ])
        return {
            html: renderRemoteReactIframeHtml({
                title: 'Project configuration',
                appScript,
                appCss,
                reactUmd,
                reactDomUmd
            }),
            contentType: 'text/html; charset=utf-8' as const
        }
    }
}
