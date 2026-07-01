import { readFile } from 'fs/promises'
import { createRequire } from 'module'
import { dirname, join } from 'path'
import {
    ASSISTANT_CONTEXT_SET_COMMAND,
    ASSISTANT_CITATION_OPEN_EVENT,
    I18nObject,
    IconDefinition,
    JsonSchemaObjectType,
    XpertExtensionViewManifest,
    XpertRemoteComponentEntry,
    XpertRemoteComponentViewSchema,
    XpertResolvedViewHostContext,
    XpertViewActionRequest,
    XpertViewActionResult,
    XpertViewDataResult,
    XpertViewParameterOptionsQuery,
    XpertViewParameterOptionsResult,
    XpertViewQuery,
    WORKBENCH_NAVIGATION_OPEN_COMMAND
} from '@xpert-ai/contracts'
import {
    IXpertViewExtensionProvider,
    renderRemoteReactIframeHtml,
    ViewExtensionProvider,
    XpertViewFileActionFile
} from '@xpert-ai/plugin-sdk'
import {
    AGENT_WORKBENCH_FIXED_SLOT,
    AGENT_WORKBENCH_MAIN_SLOT,
    KNOWLEDGE_WORKBENCH_FEATURE,
    KNOWLEDGE_WORKBENCH_ICON,
    KNOWLEDGE_WORKBENCH_PLUGIN_NAME,
    KNOWLEDGE_WORKBENCH_PROVIDER_KEY,
    KNOWLEDGE_WORKBENCH_REMOTE_ENTRY_KEY,
    KNOWLEDGE_WORKBENCH_TOOL_NAMES,
    KNOWLEDGE_WORKBENCH_VIEW_KEY
} from './constants'
import { getConnectedKnowledgebaseIds, KnowledgeWorkbenchService } from './knowledge-workbench.service'

const requireFromHere = createRequire(__filename)
const WORKBENCH_FILE_OPEN_COMMAND = 'workbench.file.open'
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })
const KNOWLEDGE_WORKBENCH_REMOTE_ASSET_SUBPATH = join(
    'src',
    'knowledgebase',
    'plugins',
    'knowledge-workbench',
    'remote-components',
    KNOWLEDGE_WORKBENCH_REMOTE_ENTRY_KEY
)
const KNOWLEDGE_WORKBENCH_VIEW_ICON = {
    type: 'svg',
    value: KNOWLEDGE_WORKBENCH_ICON,
    alt: 'Knowledgebase Workbench'
} satisfies IconDefinition
const KNOWLEDGE_WORKBENCH_REMOTE_CSS = `
html,
body,
#root {
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

body {
  margin: 0;
  background: var(--xui-color-background);
  color: var(--xui-color-foreground);
  font-family: var(--xui-font-family);
}
`

const createFolderInputSchema = {
    type: 'object',
    properties: {
        name: {
            type: 'string',
            title: text('Folder Name', '文件夹名称')
        },
        knowledgebaseId: {
            type: 'string',
            title: text('Knowledgebase', '知识库')
        },
        parentId: {
            type: 'string',
            title: text('Parent Folder', '父级文件夹')
        }
    },
    required: ['name']
} satisfies JsonSchemaObjectType

const documentIdsInputSchema = {
    type: 'object',
    properties: {
        knowledgebaseId: {
            type: 'string',
            title: text('Knowledgebase', '知识库')
        },
        documentIds: {
            type: 'array',
            title: text('Document IDs', '文档 ID'),
            items: {
                type: 'string'
            }
        }
    },
    required: ['documentIds']
} satisfies JsonSchemaObjectType

@ViewExtensionProvider(KNOWLEDGE_WORKBENCH_PROVIDER_KEY)
export class KnowledgeWorkbenchViewProvider implements IXpertViewExtensionProvider {
    constructor(private readonly workbenchService: KnowledgeWorkbenchService) {}

    supports(context: XpertResolvedViewHostContext) {
        return context.hostType === 'agent'
    }

    getViewManifests(_context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
        if (slot !== AGENT_WORKBENCH_FIXED_SLOT && slot !== AGENT_WORKBENCH_MAIN_SLOT) {
            return []
        }

        const isFixedWorkbenchView = slot === AGENT_WORKBENCH_FIXED_SLOT

        return [
            {
                key: KNOWLEDGE_WORKBENCH_VIEW_KEY,
                title: text('Knowledgebase Workbench', '知识库 Workbench'),
                description: text(
                    'Browse, preview, upload, select, and cite knowledgebase documents from the assistant workbench.',
                    '在 Assistant Workbench 中浏览、预览、上传、选择并引用知识库文档。'
                ),
                icon: KNOWLEDGE_WORKBENCH_VIEW_ICON,
                hostType: 'agent',
                slot,
                order: 30,
                refreshable: true,
                activation: {
                    requiredFeatures: [KNOWLEDGE_WORKBENCH_FEATURE]
                },
                ...(isFixedWorkbenchView
                    ? {
                          workbench: {
                              fixed: true,
                              menu: {
                                  enabled: true,
                                  label: text('Knowledgebase', '知识库'),
                                  order: 30,
                                  icon: KNOWLEDGE_WORKBENCH_VIEW_ICON
                              }
                          }
                      }
                    : {}),
                source: {
                    provider: KNOWLEDGE_WORKBENCH_PROVIDER_KEY,
                    plugin: KNOWLEDGE_WORKBENCH_PLUGIN_NAME
                },
                parameters: [
                    {
                        key: 'knowledgebaseId',
                        label: text('Knowledgebase', '知识库'),
                        type: 'string',
                        optionSource: {
                            mode: 'provider',
                            searchable: true,
                            preload: true
                        }
                    }
                ],
                view: {
                    type: 'remote_component',
                    runtime: 'react',
                    protocolVersion: 1,
                    component: {
                        isolation: 'iframe',
                        entry: KNOWLEDGE_WORKBENCH_REMOTE_ENTRY_KEY
                    },
                    dataSource: {
                        mode: 'platform'
                    }
                },
                dataSource: {
                    mode: 'platform',
                    querySchema: {
                        supportsPagination: true,
                        supportsSearch: true,
                        supportsParameters: true,
                        defaultPageSize: 20
                    },
                    cache: {
                        enabled: false
                    }
                },
                clientCommands: [
                    {
                        key: ASSISTANT_CONTEXT_SET_COMMAND,
                        label: text('Set Assistant Context', '设置 Assistant 上下文')
                    },
                    {
                        key: WORKBENCH_FILE_OPEN_COMMAND,
                        label: text('Open File', '打开文件')
                    },
                    {
                        key: WORKBENCH_NAVIGATION_OPEN_COMMAND,
                        label: text('Open Workbench Navigation', '打开 Workbench 导航')
                    }
                ],
                hostEvents: {
                    subscriptions: [
                        {
                            key: 'knowledge-workbench-tool-completed',
                            event: 'assistant.tool.completed',
                            filter: {
                                sources: ['chatkit'],
                                toolNames: [...KNOWLEDGE_WORKBENCH_TOOL_NAMES]
                            },
                            action: {
                                type: 'forward',
                                debounceMs: 1000
                            }
                        },
                        {
                            key: 'knowledge-workbench-citation-open',
                            event: ASSISTANT_CITATION_OPEN_EVENT,
                            filter: {
                                sources: ['chatkit']
                            },
                            action: {
                                type: 'forward'
                            }
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
                        key: 'create_folder',
                        label: text('New Folder', '新建文件夹'),
                        icon: 'ri-folder-add-line',
                        placement: 'toolbar',
                        actionType: 'invoke',
                        inputSchema: createFolderInputSchema
                    },
                    {
                        key: 'upload_document',
                        label: text('Upload', '上传'),
                        icon: 'ri-upload-line',
                        placement: 'toolbar',
                        actionType: 'invoke',
                        transport: 'file'
                    },
                    {
                        key: 'start_processing',
                        label: text('Process', '处理'),
                        icon: 'ri-cpu-line',
                        placement: 'toolbar',
                        actionType: 'invoke',
                        inputSchema: documentIdsInputSchema
                    }
                ]
            }
        ]
    }

    async getRemoteComponentEntry(
        _context: XpertResolvedViewHostContext,
        viewKey: string,
        component: XpertRemoteComponentViewSchema['component']
    ): Promise<XpertRemoteComponentEntry> {
        if (viewKey !== KNOWLEDGE_WORKBENCH_VIEW_KEY || component.entry !== KNOWLEDGE_WORKBENCH_REMOTE_ENTRY_KEY) {
            return {
                html: '<!doctype html><html><body>Unsupported remote component entry.</body></html>',
                contentType: 'text/html; charset=utf-8'
            }
        }

        const appScript = await readKnowledgeWorkbenchRemoteAssetFile('app.js')
        const appCss = await readKnowledgeWorkbenchRemoteAssetFile('app.css').catch(() => '')
        const react = await readPackageFile('react', 'umd/react.production.min.js')
        const reactDom = await readPackageFile('react-dom', 'umd/react-dom.production.min.js')

        return {
            html: renderRemoteReactIframeHtml({
                title: 'Knowledgebase Workbench',
                lang: 'zh-Hans',
                reactUmd: react,
                reactDomUmd: reactDom,
                appCss: `${KNOWLEDGE_WORKBENCH_REMOTE_CSS}\n${appCss}`,
                appScript
            }),
            contentType: 'text/html; charset=utf-8'
        }
    }

    async getViewData(
        context: XpertResolvedViewHostContext,
        viewKey: string,
        query: XpertViewQuery
    ): Promise<XpertViewDataResult> {
        if (viewKey !== KNOWLEDGE_WORKBENCH_VIEW_KEY) {
            return {}
        }

        return this.workbenchService.getViewData(context, query)
    }

    async getViewParameterOptions(
        context: XpertResolvedViewHostContext,
        viewKey: string,
        parameterKey: string,
        query: XpertViewParameterOptionsQuery
    ): Promise<XpertViewParameterOptionsResult> {
        if (viewKey !== KNOWLEDGE_WORKBENCH_VIEW_KEY || parameterKey !== 'knowledgebaseId') {
            return { items: [] }
        }

        const search = query.search?.trim().toLowerCase() ?? ''
        const knowledgebases = await this.workbenchService.listKnowledgebases(getConnectedKnowledgebaseIds(context))
        return {
            items: knowledgebases
                .filter((item) => !search || item.name?.toLowerCase().includes(search) || item.id.includes(search))
                .map((item) => ({
                    value: item.id,
                    label: item.name ?? item.id,
                    description: item.description ?? null
                }))
        }
    }

    async executeViewAction(
        context: XpertResolvedViewHostContext,
        viewKey: string,
        actionKey: string,
        request: XpertViewActionRequest
    ): Promise<XpertViewActionResult> {
        if (viewKey !== KNOWLEDGE_WORKBENCH_VIEW_KEY) {
            return failure('Unsupported view', '不支持的视图')
        }

        if (actionKey === 'refresh') {
            return success('Knowledgebase refreshed', '知识库视图已刷新')
        }

        const allowedKnowledgebaseIds = getConnectedKnowledgebaseIds(context)
        if (actionKey === 'create_folder') {
            const result = await this.workbenchService.createFolder({
                allowedKnowledgebaseIds,
                knowledgebaseId:
                    getStringInput(request.input, 'knowledgebaseId') ??
                    getStringInput(request.parameters, 'knowledgebaseId'),
                parentId: getStringInput(request.input, 'parentId') ?? getStringInput(request.parameters, 'parentId'),
                name: getStringInput(request.input, 'name')
            })
            return successData('Folder created', '文件夹已创建', result)
        }

        if (actionKey === 'start_processing') {
            const result = await this.workbenchService.startProcessing({
                allowedKnowledgebaseIds,
                knowledgebaseId:
                    getStringInput(request.input, 'knowledgebaseId') ??
                    getStringInput(request.parameters, 'knowledgebaseId'),
                documentIds: getStringArrayInput(request.input, 'documentIds')
            })
            return successData('Processing started', '文档处理已启动', result)
        }

        return failure('Unsupported action', '不支持的操作')
    }

    async executeViewFileAction(
        context: XpertResolvedViewHostContext,
        viewKey: string,
        actionKey: string,
        request: XpertViewActionRequest,
        file: XpertViewFileActionFile
    ): Promise<XpertViewActionResult> {
        if (viewKey !== KNOWLEDGE_WORKBENCH_VIEW_KEY || actionKey !== 'upload_document') {
            return failure('Unsupported file action', '不支持的文件操作')
        }

        const allowedKnowledgebaseIds = getConnectedKnowledgebaseIds(context)
        const result = await this.workbenchService.uploadDocument({
            allowedKnowledgebaseIds,
            knowledgebaseId:
                getStringInput(request.input, 'knowledgebaseId') ??
                getStringInput(request.parameters, 'knowledgebaseId'),
            parentId: getStringInput(request.input, 'parentId') ?? getStringInput(request.parameters, 'parentId'),
            file: {
                buffer: file.buffer,
                originalname: file.originalname,
                mimetype: file.mimetype,
                size: file.size
            },
            process: request.input?.process !== false
        })

        return successData('Document uploaded', '文档已上传并开始处理', result)
    }
}

interface KnowledgeWorkbenchRemoteAssetPathOptions {
    cwd?: string
    moduleDir?: string
    nodeEnv?: string
}

export async function readKnowledgeWorkbenchRemoteAssetFile(
    fileName: string,
    options: KnowledgeWorkbenchRemoteAssetPathOptions = {}
) {
    return readFile(getKnowledgeWorkbenchRemoteAssetPath(fileName, options), 'utf8')
}

export function getKnowledgeWorkbenchRemoteAssetPath(
    fileName: string,
    options: KnowledgeWorkbenchRemoteAssetPathOptions = {}
) {
    const cwd = options.cwd ?? process.cwd()
    const moduleDir = options.moduleDir ?? __dirname

    if ((options.nodeEnv ?? process.env.NODE_ENV) === 'production') {
        return join(cwd, 'packages', 'server-ai', KNOWLEDGE_WORKBENCH_REMOTE_ASSET_SUBPATH, fileName)
    }

    return join(moduleDir, 'remote-components', KNOWLEDGE_WORKBENCH_REMOTE_ENTRY_KEY, fileName)
}

async function readPackageFile(packageName: string, relativePath: string) {
    const packageRoot = dirname(requireFromHere.resolve(`${packageName}/package.json`))
    return readFile(join(packageRoot, relativePath), 'utf8')
}

function success(en_US: string, zh_Hans: string): XpertViewActionResult {
    return {
        success: true,
        message: text(en_US, zh_Hans),
        refresh: true
    }
}

function successData<TData>(en_US: string, zh_Hans: string, data: TData, refresh = true): XpertViewActionResult<TData> {
    return {
        success: true,
        message: text(en_US, zh_Hans),
        data,
        refresh
    }
}

function failure(en_US: string, zh_Hans: string): XpertViewActionResult {
    return {
        success: false,
        message: text(en_US, zh_Hans)
    }
}

function getStringInput(input: Record<string, unknown> | null | undefined, key: string) {
    const value = input?.[key]
    const normalized = Array.isArray(value) ? value[0] : value
    return typeof normalized === 'string' && normalized.trim() ? normalized.trim() : undefined
}

function getStringArrayInput(input: Record<string, unknown> | null | undefined, key: string) {
    const value = input?.[key]
    if (!Array.isArray(value)) {
        return []
    }
    const seen = new Set<string>()
    const result: string[] = []
    for (const item of value) {
        if (typeof item === 'string' && item.trim() && !seen.has(item.trim())) {
            seen.add(item.trim())
            result.push(item.trim())
        }
    }
    return result
}
