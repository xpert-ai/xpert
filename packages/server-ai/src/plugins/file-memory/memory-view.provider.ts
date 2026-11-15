import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import {
    AGENT_WORKBENCH_SLOT,
    XpertResolvedViewHostContext,
    XpertExtensionViewManifest,
    XpertViewQuery,
    XpertViewActionRequest
} from '@xpert-ai/contracts'
import { IXpertViewExtensionProvider, ViewExtensionProvider, renderRemoteReactIframeHtml } from '@xpert-ai/plugin-sdk'
import { MemoryManagement } from './memory-management'
const requireHere = createRequire(__filename)
const provider = 'platform.xpert-memory'
const text = (en_US: string, zh_Hans: string) => ({ en_US, zh_Hans })

@ViewExtensionProvider(provider)
export class MemoryViewProvider implements IXpertViewExtensionProvider {
    constructor(private readonly management: MemoryManagement) {}
    supports(context: XpertResolvedViewHostContext) {
        return (
            context.hostType === 'assistant-studio' ||
            (context.hostType === 'agent' && !!context.capabilities?.features?.includes('xpert.memory'))
        )
    }
    getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
        const agent = context.hostType === 'agent'
        if (!this.supports(context) || slot !== (agent ? AGENT_WORKBENCH_SLOT : 'assistant.studio.memory')) return []
        return [
            {
                key: 'memory',
                title: text('Memory', '长期记忆'),
                slot,
                hostType: context.hostType,
                source: { provider },
                icon: {
                    type: 'svg',
                    value: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h6a3 3 0 0 1 2 1 3 3 0 0 1 2-1h6v15h-6a3 3 0 0 0-2 1 3 3 0 0 0-2-1H4zM12 5v15"/></svg>'
                },
                ...(agent
                    ? {
                          activation: { requiredFeatures: ['xpert.memory'] },
                          workbench: { openMode: 'on-demand' as const, menu: { enabled: true, order: 49 } }
                      }
                    : {}),
                refreshable: true,
                view: {
                    type: 'remote_component',
                    runtime: 'react',
                    protocolVersion: 1,
                    component: { isolation: 'iframe', entry: 'xpert-memory' },
                    dataSource: { mode: 'platform' }
                },
                dataSource: {
                    mode: 'platform',
                    cache: { enabled: false },
                    querySchema: {
                        supportsPagination: true,
                        supportsSearch: true,
                        supportsSelection: true,
                        supportsParameters: true
                    }
                },
                actions: ['save', 'create', 'archive', 'standard-reply', 'dream', 'cancel', 'configure'].map((key) => ({
                    key,
                    actionType: 'invoke',
                    label: text(
                        key,
                        {
                            'standard-reply': '标准问答',
                            save: '保存',
                            create: '新建',
                            archive: '归档',
                            dream: '运行 Dream',
                            cancel: '取消',
                            configure: '设置'
                        }[key] ?? key
                    )
                }))
            }
        ]
    }
    async getViewData(context: XpertResolvedViewHostContext, _key: string, query: XpertViewQuery) {
        return { item: await this.management.read(context, query) }
    }
    async executeViewAction(
        context: XpertResolvedViewHostContext,
        _key: string,
        action: string,
        request: XpertViewActionRequest
    ) {
        return { success: true, data: await this.management.act(context, action, request.input ?? {}) }
    }
    async getRemoteComponentEntry() {
        // Source/tsc retain plugin assets; the bundled API copies remote-components beside main.js.
        const root = join(__dirname, 'remote-components', 'xpert-memory')
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
                title: 'Xpert Memory',
                appScript,
                appCss,
                reactUmd,
                reactDomUmd
            }),
            contentType: 'text/html; charset=utf-8' as const
        }
    }
}
