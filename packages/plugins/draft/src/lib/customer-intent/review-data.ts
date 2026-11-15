import { BadRequestException } from '@nestjs/common'
import type { XpertResolvedViewHostContext, XpertViewQuery } from '@xpert-ai/contracts'
import type { RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import { intentTarget } from './policy'
import { intentReviewDecisionSchema } from './review'
import { resolveProjectReviewApi } from './review-access'

const queueSchema = z.enum(['pending', 'reviewed', 'insufficient'])
const submissionSchema = intentReviewDecisionSchema.extend({
  executionId: z.string().uuid(),
  bundleHash: z.string().min(1)
})

export async function getIntentReviewData(
  capabilities: RuntimeCapabilityRegistry,
  context: XpertResolvedViewHostContext,
  viewKey: string,
  query: XpertViewQuery
) {
  const api = await resolveProjectReviewApi(capabilities, context, viewKey)
  if (query.selectionId) return { item: await api.get(intentTarget, query.selectionId) }
  const queue = queueSchema.safeParse(query.parameters?.['queue'] ?? 'pending')
  if (!queue.success) throw new BadRequestException()
  return api.list(intentTarget, { queue: queue.data, page: query.page ?? 1, pageSize: query.pageSize ?? 10 })
}

export async function submitIntentReview(
  capabilities: RuntimeCapabilityRegistry,
  context: XpertResolvedViewHostContext,
  viewKey: string,
  action: string,
  input: unknown
) {
  const api = await resolveProjectReviewApi(capabilities, context, viewKey)
  const submission = submissionSchema.safeParse(input)
  if (action !== 'submit' || !submission.success) throw new BadRequestException()
  const { executionId, bundleHash, disposition, use, ...options } = submission.data
  return api.submit(intentTarget, { executionId, bundleHash, disposition, use, ...options })
}
