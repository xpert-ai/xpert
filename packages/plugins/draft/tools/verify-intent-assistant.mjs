// Verify one ordinary published Assistant through its chat API and its persisted routing and model executions.
import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { parse } from 'yaml'
import {
  createRequestHeaders,
  DEFAULT_API_URL,
  parseCliArgs,
  requireAuthentication
} from '../../../../tools/scripts/local-plugin-cli.mjs'

const cases = [
  {
    input: '我的货件快送到了，能帮我查预计送达时间吗？',
    expected: 'order_status',
    answerTopic: /物流|运单|快递|承运商/
  },
  {
    input: 'Where can I find the tracking number for my purchase?',
    expected: 'order_status',
    answerTopic: /track|shipment/i
  },
  {
    input: '需要申请退款，请告诉我操作步骤。',
    expected: 'refund',
    answerTopic: /退款|售后/,
    unsupportedDeadline: /\d+\s*(个?工作日|天|小时)/
  },
  { input: '不要退款，我只想开张发票。', expected: 'other', answerTopic: /发票|开票/ }
]
const args = parseCliArgs(process.argv.slice(2))
if (!args.orgId || !args.assistantId || !args.releaseId) {
  throw new Error('Supply --org-id, --assistant-id and --release-id for the authorized local acceptance workspace.')
}
const apiUrl = (args.apiUrl ?? process.env.XPERT_API_URL ?? DEFAULT_API_URL).replace(/\/+$/, '').replace(/\/api$/, '')
const auth = await requireAuthentication({ ...args, apiUrl })
const headers = createRequestHeaders({ scope: 'organization', orgId: args.orgId }, auth.token, auth.tenantId)
async function request(path, body) {
  const result = await fetch(apiUrl + '/api' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(150000)
  })
  if (!result.ok) throw new Error('Platform request failed with HTTP ' + result.status)
  return result.headers.get('content-type')?.includes('application/json') ? result.json() : result.text()
}

const target = 'assistant.customer_service_intent'
const graph = parse((await request('/xpert/' + encodeURIComponent(args.assistantId) + '/export?isDraft=false')).data)
const primary = graph.nodes.find((node) => node.type === 'agent' && node.key === graph.team.agent.key)
const route = graph.nodes.find(
  (node) =>
    node.entity?.type === 'customer-service-intent' &&
    graph.connections.some((edge) => edge.type === 'edge' && edge.from === node.key && edge.to === primary?.key)
)
if (!primary || primary.entity.options?.hidden || !route)
  throw new Error('Expected the intent node upstream of a visible primary Agent')
const releasePath = '/agent-evolution/releases/' + encodeURIComponent(args.releaseId)
async function findRelease() {
  for (let page = 1; ; page++) {
    const result = await request('/agent-evolution/releases?targetId=' + target + '&pageSize=100&page=' + page)
    const release = result.items.find((item) => item.releasePackageId === args.releaseId)
    if (release) return release
    if (!result.items.length || page * 100 >= result.total)
      throw new Error('Release not found in the current organization')
  }
}
const release = await findRelease()
if (
  release.targetId !== target ||
  release.scope.type !== 'organization' ||
  release.scope.key !== args.orgId ||
  (release.status !== 'active' && !(release.status === 'canary' && release.gatePolicy?.profile === 'manual_test'))
) {
  throw new Error('Expected an active release or a local manual-test Canary for this target')
}

async function chat(input, conversationId) {
  const stream = await request('/xpert/' + encodeURIComponent(args.assistantId) + '/chat', {
    request: {
      action: 'send',
      ...(conversationId ? { conversationId } : {}),
      message: { clientMessageId: randomUUID(), input: { input } }
    },
    options: { isDraft: false }
  })
  const payloads = stream
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
  const events = payloads
    .filter((data) => data && !data.startsWith(':') && data !== '[DONE]')
    .map((data) => JSON.parse(data))
  if (events.some((e) => e.type === 'error' || e.event === 'on_error' || e.data?.error))
    throw new Error('Chat stream reported an error')
  const runs = events.filter((e) => e.event === 'on_agent_end').map((e) => e.data)
  const routing = runs.find((run) => run.agentKey === route.key && run.type === route.entity.type)
  const model = runs.find((run) => run.agentKey === primary.key && run.category === 'agent')
  if (
    !routing ||
    routing.status !== 'success' ||
    !model ||
    model.status !== 'success' ||
    !(model.tokens > 0) ||
    typeof model.outputs?.output !== 'string' ||
    !model.outputs.output.trim() ||
    !events.some((e) => e.event === 'on_conversation_end')
  ) {
    throw new Error('Incomplete routing or model execution')
  }
  return {
    routing,
    model,
    conversationId: events.find((e) => e.event === 'on_conversation_start')?.data?.id ?? conversationId
  }
}

const rows = []
for (const { input, expected, answerTopic, unsupportedDeadline } of cases) {
  let override
  let conversationId
  if (release.status === 'canary') {
    const first = await chat('你好，请介绍售后咨询范围。')
    if (!first.conversationId || !first.routing.threadId) throw new Error('Missing conversation receipt')
    conversationId = first.conversationId
    override = await request(releasePath + '/canary-test-overrides', {
      subjectKey: first.routing.threadId,
      reason: '普通主模型 Assistant 本地客服验收',
      expiresInMinutes: 5
    })
  }
  const { routing, model } = await chat(input, conversationId)
  const decision = routing.outputs.output
  if (
    decision.intent !== expected ||
    decision.versionId !== release.targetVersionId ||
    decision.channel !== (override ? 'canary' : 'production')
  )
    throw new Error('Unexpected route or version for ' + input)
  if (override) {
    const overrides = await request(releasePath + '/canary-test-overrides')
    if (
      !overrides.some(
        (item) =>
          item.overrideId === override.overrideId &&
          item.status === 'consumed' &&
          item.consumedByExecutionId === routing.id
      )
    )
      throw new Error('Test assignment was not consumed by the checked execution')
  }
  const stored = await request('/xpert-agent-execution/' + routing.id + '/log')
  if (stored.outputs?.output?.bundleHash !== decision.bundleHash || stored.outputs.output.intent !== expected)
    throw new Error('Persisted routing receipt differs from the streamed decision')
  const storedModel = await request('/xpert-agent-execution/' + model.id + '/log')
  if (storedModel.outputs?.output !== model.outputs.output || !(storedModel.tokens > 0))
    throw new Error('Model answer was not persisted')
  if (!answerTopic.test(storedModel.outputs.output) || unsupportedDeadline?.test(storedModel.outputs.output))
    throw new Error('Model answer did not meet the case criteria for ' + input)
  await request('/agent-evolution/customer-intent/executions/' + routing.id + '/review', { expectedIntent: expected })
  rows.push({
    input,
    expected,
    actual: decision.intent,
    versionId: decision.versionId,
    channel: decision.channel,
    tokens: model.tokens,
    answer: model.outputs.output,
    executionId: routing.id,
    modelExecutionId: model.id
  })
  console.log(expected + ' passed (' + decision.channel + ', ' + model.tokens + ' model tokens)')
}
if (args.receiptFile) {
  await writeFile(
    args.receiptFile,
    JSON.stringify(
      {
        assistant: graph.team.name,
        version: graph.team.version,
        releaseId: args.releaseId,
        checkedAt: new Date().toISOString(),
        rows
      },
      null,
      2
    ),
    { flag: 'wx', mode: 0o600 }
  )
}
console.log('Passed ' + rows.length + '/' + cases.length + ' ordinary Assistant chats')
