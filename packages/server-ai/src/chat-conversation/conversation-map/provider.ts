import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { BadRequestException } from '@nestjs/common'
import { t } from 'i18next'
import {
    ViewExtensionProvider,
    renderRemoteReactIframeHtml,
    type IXpertViewExtensionProvider
} from '@xpert-ai/plugin-sdk'
import {
    AGENT_WORKBENCH_SLOT,
    CONVERSATION_MAP_FEATURE,
    type XpertResolvedViewHostContext,
    type XpertExtensionViewManifest,
    type XpertViewQuery,
    type XpertViewActionRequest
} from '@xpert-ai/contracts'
import { ConversationMapService } from './service'
import { mapActionSchema, mapQuerySchema } from './schema'
import { CONVERSATION_MAP_ICON } from './icon'
const text = (en_US: string, zh_Hans: string) => ({ en_US, zh_Hans })
@ViewExtensionProvider('platform.conversation-map')
export class ConversationMapViewProvider implements IXpertViewExtensionProvider {
    constructor(private readonly map: ConversationMapService) {}
    supports(context: XpertResolvedViewHostContext) {
        return context.hostType === 'agent'
    }
    getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
        if (!this.supports(context) || slot !== AGENT_WORKBENCH_SLOT) return []
        return [
            {
                key: 'topics',
                title: text('Conversation Map', '对话脉络'),
                description: text(
                    'Explore conversations, branches, and their connections.',
                    '浏览对话分支，追溯讨论脉络'
                ),
                icon: CONVERSATION_MAP_ICON,
                hostType: 'agent',
                slot,
                order: 45,
                activation: { requiredFeatures: [CONVERSATION_MAP_FEATURE] },
                workbench: {
                    openMode: 'on-demand',
                    contextScope: 'conversation',
                    menu: { enabled: true, order: 45, icon: CONVERSATION_MAP_ICON }
                },
                refreshable: true,
                source: { provider: 'platform.conversation-map' },
                view: {
                    type: 'remote_component',
                    runtime: 'react',
                    protocolVersion: 1,
                    component: { isolation: 'iframe', entry: 'conversation-map' },
                    dataSource: { mode: 'platform' }
                },
                dataSource: {
                    mode: 'platform',
                    querySchema: {
                        supportsPagination: true,
                        supportsSearch: true,
                        supportsParameters: true,
                        defaultPageSize: 20
                    },
                    cache: { enabled: false }
                },
                clientCommands: [
                    { key: 'workbench.navigation.open', label: text('Open in chat', '在聊天中定位') },
                    { key: 'workbench.navigation.copy-link', label: text('Copy link', '复制链接') }
                ],
                actions: [
                    {
                        key: 'act',
                        label: text('Conversation action', '对话操作'),
                        actionType: 'invoke',
                        placement: 'toolbar'
                    }
                ]
            }
        ]
    }
    async getViewData(context: XpertResolvedViewHostContext, _key: string, query: XpertViewQuery) {
        if (_key !== 'topics') throw new BadRequestException(t('server-ai:ConversationMap.InvalidQuery'))
        if (query.parameters?.operation === 'projects') {
            const parsed = mapQuerySchema.safeParse({ offset: query.parameters.offset })
            if (!parsed.success) throw new BadRequestException(t('server-ai:ConversationMap.InvalidQuery'))
            return { item: await this.map.projectOptions(context, parsed.data.offset) }
        }
        const parsed = mapQuerySchema.safeParse({
            ...query.parameters,
            search: query.search ?? '',
            limit: query.pageSize ?? 20
        })
        if (!parsed.success) throw new BadRequestException(t('server-ai:ConversationMap.InvalidQuery'))
        return { item: await this.map.read(context, parsed.data) }
    }
    async executeViewAction(
        context: XpertResolvedViewHostContext,
        _key: string,
        key: string,
        request: XpertViewActionRequest
    ) {
        const parsed = mapActionSchema.safeParse(request.input)
        if (_key !== 'topics' || key !== 'act' || !parsed.success)
            throw new BadRequestException(t('server-ai:ConversationMap.InvalidAction'))
        return { success: true, data: await this.map.act(context, parsed.data) }
    }
    async getRemoteComponentEntry() {
        const root = join(__dirname, 'remote-components', 'conversation-map')
        const requireHere = createRequire(__filename)
        const packageFile = (name: string, file: string) =>
            readFile(join(dirname(requireHere.resolve(`${name}/package.json`)), file), 'utf8')
        const [appScript, appCss, reactUmd, reactDomUmd] = await Promise.all([
            readFile(join(root, 'app.js'), 'utf8'),
            readFile(join(root, 'app.css'), 'utf8'),
            packageFile('react', 'umd/react.production.min.js'),
            packageFile('react-dom', 'umd/react-dom.production.min.js')
        ])
        return {
            html: renderRemoteReactIframeHtml({ title: 'Conversation Map', appScript, appCss, reactUmd, reactDomUmd }),
            contentType: 'text/html; charset=utf-8' as const
        }
    }
}
