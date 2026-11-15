import { Injectable, ForbiddenException, BadRequestException } from '@nestjs/common'
import { Inject } from '@nestjs/common'
import { dirname, join, extname } from 'node:path'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { z } from 'zod'
import {
  AGENT_WORKBENCH_SLOT,
  AIPermissionsEnum,
  WORKBENCH_NAVIGATION_OPEN_COMMAND,
  type ExecutionReviewSubmission,
  type XpertResolvedViewHostContext,
  type XpertExtensionViewManifest,
  type XpertViewActionRequest,
  type XpertViewQuery
} from '@xpert-ai/contracts'
import {
  AgentMiddlewareStrategy,
  type IAgentMiddlewareStrategy,
  ViewExtensionProvider,
  type IXpertViewExtensionProvider,
  ExecutionReviewRuntimeCapability,
  ViewMiddlewareRuntimeCapability,
  type RuntimeCapabilityRegistry,
  XPERT_RUNTIME_CAPABILITIES_TOKEN,
  RequestContext,
  renderRemoteReactIframeHtml
} from '@xpert-ai/plugin-sdk'
import { reviewFeature, reviewMiddleware, reasons } from './review'
import { intentTarget, intentSchema } from './policy'

const title = { en_US: 'Intent review', zh_Hans: '意图路由复核' }
const viewKey = 'intent-review'
const queue = z.enum(['pending', 'reviewed', 'insufficient'])
const submission = z
  .object({
    executionId: z.string().uuid(),
    bundleHash: z.string().min(1),
    disposition: z.enum(['confirmed', 'corrected', 'insufficient']),
    use: z.enum(['case_only', 'similar_cases']),
    expectedLabel: intentSchema.optional(),
    reason: z.enum(reasons).optional()
  })
  .strict()
@AgentMiddlewareStrategy(reviewMiddleware)
@Injectable()
export class IntentReviewMiddleware implements IAgentMiddlewareStrategy {
  readonly meta = {
    name: reviewMiddleware,
    label: title,
    description: title,
    features: [reviewFeature],
    configSchema: { type: 'object' as const, properties: {} }
  }
  createMiddleware() {
    return { name: reviewMiddleware, tools: [] }
  }
}

@Injectable()
@ViewExtensionProvider(reviewMiddleware)
export class IntentReviewView implements IXpertViewExtensionProvider {
  constructor(@Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly capabilities: RuntimeCapabilityRegistry) {}
  supports(c: XpertResolvedViewHostContext) {
    return c.hostType === 'agent'
  }
  getViewManifests(c: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (
      !this.supports(c) ||
      slot !== AGENT_WORKBENCH_SLOT ||
      !c.runtimeScope?.projectId ||
      !RequestContext.hasPermission(AIPermissionsEnum.EVOLUTION_REVIEW, false)
    )
      return []
    return [
      {
        key: viewKey,
        title,
        hostType: 'agent',
        slot,
        activation: { requiredFeatures: [reviewFeature] },
        source: { provider: reviewMiddleware },
        workbench: { openMode: 'on-demand', menu: { enabled: true } },
        refreshable: true,
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
        view: {
          type: 'remote_component',
          runtime: 'react',
          protocolVersion: 1,
          component: { isolation: 'iframe', entry: viewKey },
          dataSource: { mode: 'platform' }
        },
        clientCommands: [{ key: WORKBENCH_NAVIGATION_OPEN_COMMAND }],
        actions: [{ key: 'submit', label: { en_US: 'Submit review', zh_Hans: '提交复核' }, actionType: 'invoke' }]
      }
    ]
  }
  private async api(context: XpertResolvedViewHostContext, key: string) {
    if (
      key !== viewKey ||
      !context.runtimeScope?.projectId ||
      !RequestContext.hasPermission(AIPermissionsEnum.EVOLUTION_REVIEW, false)
    )
      throw new ForbiddenException()
    const view = await this.capabilities
      .require(ViewMiddlewareRuntimeCapability)
      .resolve({ context, provider: reviewMiddleware, requiredFeature: reviewFeature })
    const api = view.context.runtime?.capabilities?.get(ExecutionReviewRuntimeCapability)
    if (!api) throw new ForbiddenException()
    return api
  }
  async getViewData(c: XpertResolvedViewHostContext, key: string, q: XpertViewQuery) {
    const api = await this.api(c, key)
    if (q.selectionId) return { item: await api.get(intentTarget, q.selectionId) }
    const parsed = queue.safeParse(q.parameters?.['queue'] ?? 'pending')
    if (!parsed.success) throw new BadRequestException()
    return api.list(intentTarget, { queue: parsed.data, page: q.page ?? 1, pageSize: q.pageSize ?? 10 })
  }
  async executeViewAction(c: XpertResolvedViewHostContext, key: string, action: string, req: XpertViewActionRequest) {
    const api = await this.api(c, key),
      input = submission.safeParse(req.input)
    if (action !== 'submit' || !input.success) throw new BadRequestException('invalid_intent_review')
    return {
      success: true,
      data: await api.submit(intentTarget, input.data as ExecutionReviewSubmission),
      refresh: true
    }
  }
  async getRemoteComponentEntry(c: XpertResolvedViewHostContext, key: string) {
    await this.api(c, key)
    const root = join(
      extname(__filename) === '.ts' ? join(__dirname, '../../..') : __dirname,
      'remote-components',
      viewKey
    )
    const local = createRequire(__filename)
    const umd = (name: string, file: string) =>
      readFile(join(dirname(local.resolve(name + '/package.json')), 'umd', file), 'utf8')
    const [appScript, appCss, reactUmd, reactDomUmd] = await Promise.all([
      readFile(join(root, 'app.js'), 'utf8'),
      readFile(join(root, 'app.css'), 'utf8'),
      umd('react', 'react.production.min.js'),
      umd('react-dom', 'react-dom.production.min.js')
    ])
    return {
      html: renderRemoteReactIframeHtml({ title: 'Intent review', appScript, appCss, reactUmd, reactDomUmd }),
      contentType: 'text/html; charset=utf-8' as const
    }
  }
}
