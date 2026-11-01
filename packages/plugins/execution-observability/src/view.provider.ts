import { Inject, BadRequestException, ForbiddenException } from '@nestjs/common'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, extname, join } from 'node:path'
import { z } from 'zod/v3'
import {
  AGENT_WORKBENCH_SLOT,
  ASSISTANT_CHAT_SEND_MESSAGE_COMMAND,
  WORKBENCH_NAVIGATION_OPEN_COMMAND,
  RolesEnum,
  executionObservationQuerySchema,
  executionObservationDetailQuerySchema,
  type XpertExtensionViewManifest,
  type XpertResolvedViewHostContext,
  type XpertViewQuery,
  type XpertViewActionRequest
} from '@xpert-ai/contracts'
import {
  ViewExtensionProvider,
  ViewMiddlewareRuntimeCapability,
  ExecutionObservabilityRuntimeCapability,
  XPERT_RUNTIME_CAPABILITIES_TOKEN,
  RequestContext,
  renderRemoteReactIframeHtml,
  isExecutionObservationSession,
  type RuntimeCapabilityRegistry,
  type IXpertViewExtensionProvider
} from '@xpert-ai/plugin-sdk'
import { PROVIDER, FEATURE, VIEW_KEY, ICON, label } from './constants'

const requireHere = createRequire(__filename)

@ViewExtensionProvider(PROVIDER)
export class ExecutionObservationViewProvider implements IXpertViewExtensionProvider {
  constructor(@Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly capabilities: RuntimeCapabilityRegistry) {}

  supports(context: XpertResolvedViewHostContext) {
    return context.hostType === 'agent'
  }

  getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (
      !this.supports(context) ||
      slot !== AGENT_WORKBENCH_SLOT ||
      !RequestContext.hasRoles([RolesEnum.ADMIN, RolesEnum.SUPER_ADMIN]) ||
      !isExecutionObservationSession(RequestContext.currentApiPrincipal(), context.hostId)
    )
      return []
    return [
      {
        key: VIEW_KEY,
        title: label('Execution overview', '执行总览'),
        hostType: 'agent',
        slot,
        icon: ICON,
        activation: { requiredFeatures: [FEATURE] },
        source: { provider: PROVIDER },
        refreshable: true,
        workbench: { openMode: 'on-demand', menu: { enabled: true } },
        view: {
          type: 'remote_component',
          runtime: 'react',
          protocolVersion: 1,
          component: { isolation: 'iframe', entry: 'timeline' },
          dataSource: { mode: 'platform' }
        },
        dataSource: {
          mode: 'platform',
          cache: { enabled: false },
          querySchema: {
            supportsSelection: true,
            supportsParameters: true,
            supportsPagination: true,
            defaultPageSize: 10
          }
        },
        clientCommands: [
          { key: ASSISTANT_CHAT_SEND_MESSAGE_COMMAND, label: label('Analyze selection', '分析此时段') },
          { key: WORKBENCH_NAVIGATION_OPEN_COMMAND, label: label('Open conversation', '打开会话') }
        ],
        actions: [
          { key: 'analyze', label: label('Analyze period', '分析此时段'), actionType: 'invoke', placement: 'toolbar' },
          {
            key: 'execution-target',
            label: label('Open conversation', '打开会话'),
            actionType: 'invoke',
            placement: 'toolbar'
          }
        ]
      }
    ]
  }

  private async api(context: XpertResolvedViewHostContext, viewKey: string) {
    if (viewKey !== VIEW_KEY) throw new ForbiddenException()
    const resolved = await this.capabilities
      .require(ViewMiddlewareRuntimeCapability)
      .resolve({ context, provider: PROVIDER, requiredFeature: FEATURE })
    const api = resolved.context.runtime?.capabilities?.require(ExecutionObservabilityRuntimeCapability)
    if (!api) throw new ForbiddenException()
    return api
  }

  async getViewData(context: XpertResolvedViewHostContext, viewKey: string, query: XpertViewQuery) {
    const api = await this.api(context, viewKey)
    if (query.selectionId) {
      const item = await api.get({ executionId: query.selectionId, childPage: query.page ?? 1 })
      return {
        item,
        canOpenConversation: Boolean(item.item.conversationId && item.item.assistantId === context.hostId)
      }
    }
    const { operation, viewMode, expanded, expandedConversations, timeScale, following, ...parameters } =
      query.parameters ?? {}
    if (operation === 'workspaces')
      return {
        item: await api.workspaces({ page: query.page ?? 1, search: z.string().optional().parse(parameters.search) })
      }
    if (operation && operation !== 'list' && operation !== 'summary' && operation !== 'conversations')
      throw new BadRequestException()
    const now = new Date(),
      from = new Date(now.getTime() - 3600000)
    const input = executionObservationQuerySchema.parse({
      from: from.toISOString(),
      to: now.toISOString(),
      ...parameters,
      page: query.page ?? parameters.page ?? 1,
      pageSize: query.pageSize ?? parameters.pageSize ?? 10
    })
    if (operation === 'list') return { item: await api.query(input) }
    if (operation === 'conversations') return { item: await api.conversations(input) }
    if (operation === 'summary') return { item: await api.summary(input) }
    return { item: await api.overview(input) }
  }

  async executeViewAction(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest
  ) {
    const api = await this.api(context, viewKey)
    if (actionKey === 'execution-target') {
      const input = executionObservationDetailQuerySchema.parse(request.input)
      const { item } = await api.get(input)
      if (!item.conversationId || !item.assistantId)
        return { success: false, message: label('No linked conversation is recorded.', '未记录关联会话。') }
      // Organization-wide observation does not grant cross-Assistant conversation access.
      if (item.assistantId !== context.hostId)
        return {
          success: false,
          message: label(
            'Open this conversation from its original Assistant with the required access.',
            '请在原助手中按会话访问权限查看。'
          )
        }
      return {
        success: true,
        data: {
          target: 'assistant.conversation',
          conversationId: item.conversationId,
          xpertId: item.assistantId,
          threadId: item.threadId ?? undefined,
          executionId: item.id,
          preserveView: true
        }
      }
    }
    if (actionKey === 'analyze') {
      const input = executionObservationQuerySchema.parse(request.input)
      const summary = await api.summary(input)
      return { success: true, data: { query: { ...input, asOf: summary.asOf }, observedAt: summary.observedAt } }
    }
    throw new BadRequestException(label('Unsupported action', '不支持的操作'))
  }

  async getRemoteComponentEntry(context: XpertResolvedViewHostContext, viewKey: string) {
    await this.api(context, viewKey)
    // Local plugin discovery can load TypeScript directly; packaged builds live at the package root.
    const root = join(extname(__filename) === '.ts' ? dirname(__dirname) : __dirname, 'remote-components', 'timeline')
    const packageFile = (name: string, file: string) =>
      readFile(join(dirname(requireHere.resolve(`${name}/package.json`)), file), 'utf8')
    const [appScript, appCss, reactUmd, reactDomUmd] = await Promise.all([
      readFile(join(root, 'app.js'), 'utf8'),
      readFile(join(root, 'app.css'), 'utf8'),
      packageFile('react', 'umd/react.production.min.js'),
      packageFile('react-dom', 'umd/react-dom.production.min.js')
    ])
    return {
      html: renderRemoteReactIframeHtml({ title: 'Execution overview', appScript, appCss, reactUmd, reactDomUmd }),
      contentType: 'text/html; charset=utf-8' as const
    }
  }
}
