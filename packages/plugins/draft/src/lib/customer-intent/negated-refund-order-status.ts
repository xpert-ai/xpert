import type { GoldenCaseRevision, ReplayCaseRequest } from '@xpert-ai/contracts'
import { fingerprint, readIntentPolicy } from './policy'

export const negatedRefundOrderStatus = {
  key: 'holdout:negated_refund_order_status',
  label: {
    en_US: 'Order tracking with an explicit refund refusal',
    zh_Hans: '否定退款、实际查单',
    zh_Hant: '否定退款、實際查單'
  }
}

// Authored evaluation inputs. Candidate construction only receives the proposal's reviewed evidence.
const utterances = [
  '不用给我退款，我想知道包裹现在到哪里了。',
  '我不想退款，只想查询物流进度。',
  '先别退钱，帮我看看订单发货了吗？',
  '不要办理退款，请查一下预计送达时间。',
  '不用退款，请帮我查一下快递单号。',
  '先别处理退款，我想问这单什么时候能到。'
]
const corpus = new Map(utterances.map((text) => [fingerprint(text), text]))

export function heldOutOrderCases(existing: ReadonlyMap<string, GoldenCaseRevision>): GoldenCaseRevision[] {
  return [...corpus]
    .filter(([id]) => !existing.has(id))
    .map(([caseId, utterance]) => ({
      caseId,
      revision: 1,
      input: { utterance },
      expected: { intent: 'order_status' },
      slice: negatedRefundOrderStatus.key,
      risk: 'medium',
      evidenceRef: 'maintained:customer-intent/negated-refund-order-status/v1'
    }))
}

/** A frozen dataset may be replayed against another candidate or a baseline that already learned this input. */
export function intentReplaySlice(request: ReplayCaseRequest): string | undefined {
  const { slice, caseId, revision, input, expected } = request.caseRevision
  if (slice !== negatedRefundOrderStatus.key) return slice
  const utterance = input['utterance']
  if (
    revision !== 1 ||
    typeof utterance !== 'string' ||
    corpus.get(caseId) !== utterance ||
    expected['intent'] !== 'order_status'
  )
    return undefined
  if (
    readIntentPolicy(request.baselineArtifact).exact[caseId] ||
    readIntentPolicy(request.candidateArtifact).exact[caseId]
  )
    return undefined
  return slice
}
