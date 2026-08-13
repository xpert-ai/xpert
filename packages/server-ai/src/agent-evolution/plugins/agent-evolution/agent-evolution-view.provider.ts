import { readFile } from 'fs/promises'
import { createRequire } from 'module'
import { dirname, join } from 'path'
import type {
    I18nObject,
    IconDefinition,
    XpertExtensionViewManifest,
    XpertRemoteComponentEntry,
    XpertRemoteComponentViewSchema,
    XpertResolvedViewHostContext,
    XpertViewActionRequest,
    XpertViewActionResult,
    XpertViewDataResult,
    XpertViewQuery
} from '@xpert-ai/contracts'
import { IXpertViewExtensionProvider, renderRemoteReactIframeHtml, ViewExtensionProvider } from '@xpert-ai/plugin-sdk'
import {
    AGENT_EVOLUTION_ICON,
    AGENT_EVOLUTION_MANAGE_PERMISSIONS,
    AGENT_EVOLUTION_PROVIDER_KEY,
    AGENT_EVOLUTION_REMOTE_ENTRY_KEY,
    AGENT_EVOLUTION_TOOL_NAMES,
    AGENT_EVOLUTION_VIEW_KEY,
    AGENT_EVOLUTION_VIEW_PERMISSIONS,
    AGENT_WORKBENCH_FIXED_SLOT,
    AGENT_WORKBENCH_MAIN_SLOT
} from './constants'
import { AgentEvolutionAppService } from './agent-evolution-app.service'

const requireFromHere = createRequire(__filename)
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })
const REMOTE_ASSET_SUBPATH = join(
    'src',
    'agent-evolution',
    'plugins',
    'agent-evolution',
    'remote-components',
    AGENT_EVOLUTION_REMOTE_ENTRY_KEY
)
const VIEW_ICON = {
    type: 'svg',
    value: AGENT_EVOLUTION_ICON,
    alt: 'Agent Evolution'
} satisfies IconDefinition

@ViewExtensionProvider(AGENT_EVOLUTION_PROVIDER_KEY)
export class AgentEvolutionViewProvider implements IXpertViewExtensionProvider {
    constructor(private readonly app: AgentEvolutionAppService) {}

    supports(context: XpertResolvedViewHostContext) {
        return context.hostType === 'agent'
    }

    getViewManifests(_context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
        if (slot !== AGENT_WORKBENCH_FIXED_SLOT && slot !== AGENT_WORKBENCH_MAIN_SLOT) {
            return []
        }
        const fixed = slot === AGENT_WORKBENCH_FIXED_SLOT
        return [
            {
                key: AGENT_EVOLUTION_VIEW_KEY,
                title: text('Agent Evolution', '智能体进化'),
                description: text(
                    'Discover, evaluate, approve, release, and audit governed Agent capability improvements.',
                    '发现、评测、审批、发布并审计受治理的智能体能力改进。'
                ),
                icon: VIEW_ICON,
                hostType: 'agent',
                slot,
                order: 20,
                refreshable: true,
                permissions: AGENT_EVOLUTION_VIEW_PERMISSIONS,
                ...(fixed
                    ? {
                          workbench: {
                              fixed: true,
                              menu: {
                                  enabled: true,
                                  label: text('Agent Evolution', '智能体进化'),
                                  order: 20,
                                  icon: VIEW_ICON
                              }
                          }
                      }
                    : {}),
                source: { provider: AGENT_EVOLUTION_PROVIDER_KEY },
                view: {
                    type: 'remote_component',
                    runtime: 'react',
                    protocolVersion: 1,
                    component: { isolation: 'iframe', entry: AGENT_EVOLUTION_REMOTE_ENTRY_KEY },
                    dataSource: { mode: 'platform' }
                },
                dataSource: {
                    mode: 'platform',
                    querySchema: { supportsParameters: true, supportsPagination: false },
                    cache: { enabled: false }
                },
                hostEvents: {
                    subscriptions: [
                        {
                            key: 'agent-evolution-tool-completed',
                            event: 'assistant.tool.completed',
                            filter: { sources: ['chatkit'], toolNames: [...AGENT_EVOLUTION_TOOL_NAMES] },
                            action: { type: 'forward', debounceMs: 500 }
                        }
                    ]
                },
                actions: [
                    {
                        key: 'refresh',
                        label: text('Refresh', '刷新'),
                        icon: 'ri-refresh-line',
                        placement: 'toolbar',
                        actionType: 'refresh'
                    },
                    {
                        key: 'run_conformance_simulation',
                        label: text('Run full simulation', '运行完整模拟'),
                        icon: 'ri-play-circle-line',
                        placement: 'toolbar',
                        actionType: 'invoke',
                        permissions: AGENT_EVOLUTION_MANAGE_PERMISSIONS,
                        confirm: {
                            title: text('Run Agent Evolution simulation?', '运行智能体进化模拟？'),
                            message: text(
                                'This creates isolated conformance events, a candidate, an evaluation, a release, Shadow/Canary deployments, and an Active Pointer audit record.',
                                '此操作会创建隔离的契约测试事件、候选、评测、发布、Shadow/Canary 部署及 Active Pointer 审计记录。'
                            )
                        }
                    }
                ]
            }
        ]
    }

    getViewData(
        context: XpertResolvedViewHostContext,
        viewKey: string,
        query: XpertViewQuery
    ): Promise<XpertViewDataResult> | XpertViewDataResult {
        if (viewKey !== AGENT_EVOLUTION_VIEW_KEY) {
            return {}
        }
        return this.app.getViewData(context, query)
    }

    async executeViewAction(
        context: XpertResolvedViewHostContext,
        viewKey: string,
        actionKey: string,
        _request: XpertViewActionRequest
    ): Promise<XpertViewActionResult> {
        if (viewKey !== AGENT_EVOLUTION_VIEW_KEY) {
            return { success: false, message: text('Unsupported view', '不支持的视图') }
        }
        if (actionKey === 'refresh') {
            return { success: true, refresh: true, message: text('Evolution data refreshed', '进化数据已刷新') }
        }
        if (actionKey === 'run_conformance_simulation') {
            const result = await this.app.runSimulation(context)
            return {
                success: true,
                refresh: true,
                message: text('Agent Evolution simulation completed', '智能体进化模拟已完成'),
                data: result
            }
        }
        return { success: false, message: text('Unsupported action', '不支持的操作') }
    }

    async getRemoteComponentEntry(
        _context: XpertResolvedViewHostContext,
        viewKey: string,
        component: XpertRemoteComponentViewSchema['component']
    ): Promise<XpertRemoteComponentEntry> {
        if (viewKey !== AGENT_EVOLUTION_VIEW_KEY || component.entry !== AGENT_EVOLUTION_REMOTE_ENTRY_KEY) {
            return {
                html: '<!doctype html><html><body>Unsupported remote component entry.</body></html>',
                contentType: 'text/html; charset=utf-8'
            }
        }
        const [appScript, appCss, react, reactDom] = await Promise.all([
            readRemoteAssetFile('app.js'),
            readRemoteAssetFile('app.css').catch(() => ''),
            readPackageFile('react', 'umd/react.production.min.js'),
            readPackageFile('react-dom', 'umd/react-dom.production.min.js')
        ])
        return {
            html: renderRemoteReactIframeHtml({
                title: 'Agent Evolution',
                lang: 'zh-Hans',
                reactUmd: react,
                reactDomUmd: reactDom,
                appCss,
                appScript
            }),
            contentType: 'text/html; charset=utf-8'
        }
    }
}

interface RemoteAssetPathOptions {
    cwd?: string
    moduleDir?: string
    nodeEnv?: string
}

export function readRemoteAssetFile(fileName: string, options: RemoteAssetPathOptions = {}) {
    return readFile(getRemoteAssetPath(fileName, options), 'utf8')
}

export function getRemoteAssetPath(fileName: string, options: RemoteAssetPathOptions = {}) {
    if ((options.nodeEnv ?? process.env.NODE_ENV) === 'production') {
        return join(options.cwd ?? process.cwd(), 'packages', 'server-ai', REMOTE_ASSET_SUBPATH, fileName)
    }
    return join(options.moduleDir ?? __dirname, 'remote-components', AGENT_EVOLUTION_REMOTE_ENTRY_KEY, fileName)
}

async function readPackageFile(packageName: string, relativePath: string) {
    const packageRoot = dirname(requireFromHere.resolve(`${packageName}/package.json`))
    return readFile(join(packageRoot, relativePath), 'utf8')
}
