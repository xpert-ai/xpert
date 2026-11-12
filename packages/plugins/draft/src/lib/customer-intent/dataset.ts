import type { GoldenCaseRevision, LearningEvent } from '@xpert-ai/contracts'
import { changeError } from './errors'
import { fingerprint, intentFeatures, intentSchema, type ServiceIntent } from './policy'

// The regression corpus is held constant across candidates. Reviewed examples are added once per input.
const controls: Record<ServiceIntent, string[]> = {
  refund: [
    '申请退款',
    'refund request',
    '我想退钱',
    '退回货款',
    '订单退款',
    '退款进度',
    '撤销并退款',
    '重复扣款退回',
    '退还运费',
    '申请售后退款',
    '退款未到账',
    '取消订单退款',
    '退货退款',
    '退回差价',
    'return my payment',
    'request a refund',
    'reverse the charge',
    'refund shipping',
    'check my refund',
    'refund a duplicate payment'
  ],
  order_status: [
    '订单状态',
    '查询物流',
    'track my order',
    'order status',
    '包裹到哪里了',
    '快递单号',
    '发货了吗',
    '查询配送进度',
    '订单预计送达时间',
    '查运单',
    '包裹已签收吗',
    '查询发货时间',
    '查订单',
    '配送延误',
    'shipment status',
    'where is my package',
    'delivery date',
    'has it shipped',
    'order tracking',
    'find my parcel'
  ],
  other: [
    '修改密码',
    '开具发票',
    '营业时间',
    '更新联系方式',
    '产品尺寸',
    '会员积分',
    '账户注销',
    '优惠券使用',
    'change password',
    'store hours',
    'invoice request',
    'product dimensions',
    'update my email',
    'loyalty balance',
    'size chart',
    'gift wrap',
    'contact support',
    'account settings',
    'available colors',
    'how to sign up'
  ]
}

// Version 1 snapshots identify public corpus inputs by their immutable fingerprint.
export const corpusFeatures = new Map(
  Object.values(controls)
    .flat()
    .map((text) => [fingerprint(text), intentFeatures(text)])
)

export function buildIntentCases(
  events: LearningEvent[],
  reviewFeatures: ReadonlyMap<string, string[]> = new Map()
): GoldenCaseRevision[] {
  const reviewed = new Map<string, LearningEvent>()
  const affected = new Set<ServiceIntent>()
  for (const event of events) {
    const intent = intentSchema.parse(event.finalOutcomeSummary)
    const prior = reviewed.get(event.inputFingerprint)
    if (prior && prior.finalOutcomeSummary !== intent) changeError('conflicting_intent_corrections')
    reviewed.set(event.inputFingerprint, event)
    affected.add(intent)
  }
  const cases = new Map<string, GoldenCaseRevision>()
  function add(key: string, intent: ServiceIntent, evidenceRef: string) {
    const existing = cases.get(key)
    if (existing && existing.expected['intent'] !== intent) changeError('conflicting_intent_corrections')
    const features = reviewFeatures.get(key) ?? corpusFeatures.get(key)
    cases.set(key, {
      caseId: key,
      revision: 1,
      input: { inputFingerprint: key, ...(features ? { features: JSON.stringify(features) } : {}) },
      expected: { intent },
      slice: affected.has(intent) ? `affected:${intent}` : `control:${intent}`,
      risk: intent === 'refund' ? 'high' : 'medium',
      evidenceRef
    })
  }
  for (const [key, utterances] of Object.entries(controls)) {
    const intent = intentSchema.parse(key)
    for (const text of utterances) add(fingerprint(text), intent, 'maintained:customer-intent/v1')
  }
  for (const [key, event] of reviewed)
    add(key, intentSchema.parse(event.finalOutcomeSummary), `evolution-event:${event.eventId}`)
  return [...cases.values()]
}
