import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { requireAuthentication, createRequestHeaders } from './local-plugin-cli.mjs'

const file = process.argv[2]
if (!file) throw new Error('Supply a local acceptance scope file; see docs/plans/2026-11-15-always-on-event-inbox.md.')
const { apiUrl, organizationId, assistantId, caseId, bindingId, larkBindingId } = JSON.parse(
  await readFile(file, 'utf8')
)
const base = new URL(apiUrl)
for (const id of [organizationId, assistantId, caseId, bindingId, ...(larkBindingId ? [larkBindingId] : [])]) {
  assert.match(id, /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i)
}
const auth = await requireAuthentication({ apiUrl: base.href })
const headers = createRequestHeaders({ scope: 'organization', orgId: organizationId }, auth.token, auth.tenantId)
async function get(path) {
  const response = await fetch(base.href.replace(/\/$/, '') + path, { headers, redirect: 'error' })
  if (!response.ok) throw new Error('Scoped readback returned HTTP ' + response.status)
  return response.json()
}
async function receipts(id) {
  const result = []
  let after = '0'
  do {
    const page = await get('/agent-event/bindings/' + id + '/receipts?after=' + after)
    result.push(...page.items)
    if (!page.next) break
    assert(BigInt(page.next) > BigInt(after))
    after = page.next
  } while (true)
  return result
}
const data = await get(
  '/view-hosts/agent/' +
    assistantId +
    '/views/procurement_quote_comparison__workbench/data?' +
    new URLSearchParams({ parameters: JSON.stringify({ caseId }) })
)
const detail = data.item ?? data.data?.item
assert.equal(detail?.case.id, caseId)
const events = await receipts(bindingId)
assert(
  events.some((row) => row.decision?.reasonCode === 'baseline'),
  'Expected a committed baseline'
)
const delays = events.filter((row) => row.decision?.resultRef?.kind === 'procurement-risk')
assert(delays.length > 0, 'Expected a delivery delay')
for (const row of delays) {
  const receipt = await get('/agent-event/receipts/' + row.id)
  assert.equal(receipt.state, 'handled')
  const risk = detail.risks.find((r) => r.id === receipt.decision.resultRef.key)
  assert.equal(risk?.type, 'delivery_delay')
  assert.equal(risk.eventOperationKey, receipt.decision.operationKey)
}
console.log('Procurement Workbench verified', { receipts: events.length, matchedRisks: delays.length })
if (larkBindingId) {
  const incoming = (await receipts(larkBindingId)).filter(
    (row) => row.type === 'lark.message.received' && row.decision?.resultRef?.kind === 'lark-dispatch'
  )
  assert(incoming.length > 0, 'Expected a committed Feishu inbound dispatch intent')
  console.log('Feishu inbound dispatch intents', incoming.length)
}
