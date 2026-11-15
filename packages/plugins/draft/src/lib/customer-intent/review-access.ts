import { ForbiddenException } from '@nestjs/common'
import type { XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import {
  ExecutionReviewRuntimeCapability,
  ViewMiddlewareRuntimeCapability,
  type RuntimeCapabilityRegistry
} from '@xpert-ai/plugin-sdk'

export const reviewFeature = 'customer-intent.review'
export const reviewMiddleware = 'customer-intent-review'
export const reviewViewKey = 'intent-review'

export function canReviewProject(context: XpertResolvedViewHostContext): boolean {
  return Boolean(context.runtimeScope?.projectId && context.runtimeScope.projectAccess?.canManage)
}

export async function resolveProjectReviewApi(
  capabilities: RuntimeCapabilityRegistry,
  context: XpertResolvedViewHostContext,
  viewKey: string
) {
  if (viewKey !== reviewViewKey || !canReviewProject(context)) throw new ForbiddenException()
  const view = await capabilities.require(ViewMiddlewareRuntimeCapability).resolve({
    context,
    provider: reviewMiddleware,
    requiredFeature: reviewFeature
  })
  const api = view.context.runtime?.capabilities?.get(ExecutionReviewRuntimeCapability)
  if (!api) throw new ForbiddenException()
  return api
}
