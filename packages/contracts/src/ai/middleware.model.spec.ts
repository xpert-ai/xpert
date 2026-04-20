import { WorkflowNodeTypeEnum } from './xpert-workflow.model'
import {
  CONTEXT_COMPRESSION_MIDDLEWARE_NAME,
  IWFNMiddleware,
  LEGACY_SANDBOX_COMPRESSION_MIDDLEWARE_NAME,
  normalizeMiddlewareNode,
  normalizeMiddlewareNodes,
  normalizeMiddlewareProvider
} from './middleware.model'
import { TXpertTeamNode } from './xpert.model'

describe('middleware model helpers', () => {
  it('normalizes the legacy compression middleware provider name', () => {
    expect(normalizeMiddlewareProvider(LEGACY_SANDBOX_COMPRESSION_MIDDLEWARE_NAME)).toBe(
      CONTEXT_COMPRESSION_MIDDLEWARE_NAME
    )
    expect(normalizeMiddlewareProvider(CONTEXT_COMPRESSION_MIDDLEWARE_NAME)).toBe(
      CONTEXT_COMPRESSION_MIDDLEWARE_NAME
    )
    expect(normalizeMiddlewareProvider(undefined)).toBe('')
  })

  it('normalizes legacy middleware workflow nodes in draft graphs', () => {
    const entity: IWFNMiddleware = {
      id: 'middleware-1',
      key: 'middleware-1',
      type: WorkflowNodeTypeEnum.MIDDLEWARE,
      provider: LEGACY_SANDBOX_COMPRESSION_MIDDLEWARE_NAME
    }
    const node: TXpertTeamNode<'workflow'> & { entity: IWFNMiddleware } = {
      key: 'workflow/compression',
      type: 'workflow',
      position: { x: 0, y: 0 },
      entity
    }

    const normalizedNode = normalizeMiddlewareNode(node)
    const normalizedNodes = normalizeMiddlewareNodes([node])

    expect(normalizedNode.entity.provider).toBe(CONTEXT_COMPRESSION_MIDDLEWARE_NAME)
    expect(normalizedNodes[0].entity.provider).toBe(CONTEXT_COMPRESSION_MIDDLEWARE_NAME)
    expect(normalizedNode).not.toBe(node)
  })
})
