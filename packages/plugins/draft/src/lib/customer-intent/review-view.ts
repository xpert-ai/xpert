import { Inject, Injectable } from '@nestjs/common'
import { dirname, join, extname } from 'node:path'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import {
  AGENT_WORKBENCH_SLOT,
  WORKBENCH_NAVIGATION_OPEN_COMMAND,
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
  type RuntimeCapabilityRegistry,
  XPERT_RUNTIME_CAPABILITIES_TOKEN,
  renderRemoteReactIframeHtml
} from '@xpert-ai/plugin-sdk'
import { getIntentReviewData, submitIntentReview } from './review-data'
import {
  canReviewProject,
  resolveProjectReviewApi,
  reviewFeature,
  reviewMiddleware,
  reviewViewKey
} from './review-access'

const title = { en_US: 'Intent review', zh_Hans: '意图路由复核' }
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
    if (!this.supports(c) || slot !== AGENT_WORKBENCH_SLOT || !canReviewProject(c)) return []
    return [
      {
        key: reviewViewKey,
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
          component: { isolation: 'iframe', entry: reviewViewKey },
          dataSource: { mode: 'platform' }
        },
        clientCommands: [{ key: WORKBENCH_NAVIGATION_OPEN_COMMAND }],
        actions: [{ key: 'submit', label: { en_US: 'Submit review', zh_Hans: '提交复核' }, actionType: 'invoke' }]
      }
    ]
  }
  getViewData(c: XpertResolvedViewHostContext, key: string, q: XpertViewQuery) {
    return getIntentReviewData(this.capabilities, c, key, q)
  }
  async executeViewAction(c: XpertResolvedViewHostContext, key: string, action: string, req: XpertViewActionRequest) {
    return {
      success: true,
      data: await submitIntentReview(this.capabilities, c, key, action, req.input),
      refresh: true
    }
  }
  async getRemoteComponentEntry(c: XpertResolvedViewHostContext, key: string) {
    await resolveProjectReviewApi(this.capabilities, c, key)
    const root = join(
      extname(__filename) === '.ts' ? join(__dirname, '../../..') : __dirname,
      'remote-components',
      reviewViewKey
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
