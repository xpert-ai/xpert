#!/usr/bin/env node
// Read-only acceptance: author and publish through chat/UI first. Never manufacture Agent receipts.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { requireAuthentication, createRequestHeaders } from './local-plugin-cli.mjs'

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce(
      (pairs, value, index, values) => (index % 2 ? pairs : [...pairs, [value.replace(/^--/, ''), values[index + 1]]]),
      []
    )
)
assert(args.context && args.receipt, 'Use --context <private-json> --receipt <private-json>')
const context = JSON.parse(fs.readFileSync(args.context, 'utf8'))
const directory = path.dirname(path.resolve(args.receipt))
assert.equal(fs.statSync(directory).mode & 0o077, 0, 'Receipt directory must be private')
const auth = await requireAuthentication({ apiUrl: context.apiUrl })
const headers = createRequestHeaders({ scope: 'organization', orgId: context.orgId }, auth.token, auth.tenantId)
const base = context.apiUrl.replace(/\/$/, '') + '/api'
const view = `/view-hosts/agent/${context.assistantId}/views/live-dashboard__live-dashboard`
async function raw(route, body, anonymous = false) {
  const response = await fetch(base + route, {
    method: body ? 'POST' : 'GET',
    headers: anonymous ? { 'content-type': 'application/json' } : headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(120000)
  })
  return { status: response.status, data: await response.json() }
}
async function call(route, body) {
  const result = await raw(route, body)
  assert(result.status < 300, `HTTP ${result.status} at ${route.split('?')[0].replace(/[a-f0-9-]{36}/gi, '[id]')}`)
  return result.data
}
function messages(state) {
  const result = [],
    seen = new Set()
  function walk(value) {
    if (!value || typeof value !== 'object') return
    if (value.id && value.content !== undefined && !seen.has(value.id)) {
      seen.add(value.id)
      result.push(value)
    }
    for (const [key, child] of Object.entries(value))
      if (key !== 'lc_kwargs') Array.isArray(child) ? child.forEach(walk) : walk(child)
  }
  walk(state)
  return result
}
const conversation = await call(`/chat-conversation/by-thread?threadId=${context.threadId}`)
assert.equal(conversation.xpertId, context.assistantId, 'Conversation belongs to another Assistant')
assert.equal(conversation.status, 'idle', 'Chat must finish successfully before acceptance')
const all = messages(await call(`/chat-conversation/${conversation.id}/state`))
const toolCalls = new Map(all.flatMap((message) => message.tool_calls ?? []).map((tool) => [tool.id, tool]))
const replies = all.flatMap((message) => {
  const invocation = toolCalls.get(message.tool_call_id)
  if (
    !invocation ||
    invocation.name !== message.name ||
    message.status === 'error' ||
    typeof message.content !== 'string'
  )
    return []
  try {
    return [{ invocation, output: JSON.parse(message.content) }]
  } catch {
    return []
  }
})
const registrations = replies.filter((reply) => reply.invocation.name === 'analytics_definition_register')
// A new HTML composition can reuse Definitions created in an earlier authorized chat.
// Read the actual tool receipts; a supplied SourceRef alone is not authoring evidence.
for (const threadId of context.sourceThreadIds ?? []) {
  const sourceConversation = await call(`/chat-conversation/by-thread?threadId=${threadId}`)
  assert.equal(sourceConversation.xpertId, context.assistantId, 'Source chat belongs to another Assistant')
  const sourceMessages = messages(await call(`/chat-conversation/${sourceConversation.id}/state`))
  const calls = new Map(sourceMessages.flatMap((message) => message.tool_calls ?? []).map((tool) => [tool.id, tool]))
  for (const message of sourceMessages) {
    const invocation = calls.get(message.tool_call_id)
    if (
      invocation?.name !== 'analytics_definition_register' ||
      message.name !== invocation.name ||
      message.status === 'error' ||
      typeof message.content !== 'string'
    )
      continue
    try {
      registrations.push({ invocation, output: JSON.parse(message.content) })
    } catch {
      /* Non-JSON error reply. */
    }
  }
}
const saves = replies.filter(
  (reply) =>
    ['dashboard_create', 'dashboard_create_html', 'dashboard_update'].includes(reply.invocation.name) &&
    reply.output.dashboard?.artifactId
)
assert(
  context.agentKey && context.model?.id && context.model?.name && context.model?.copilotId,
  'Configure the existing authorized model and primary Agent key'
)
const executions = []
for (let skip = 0; ; skip += 100) {
  const page = await call(
    `/xpert-agent-execution/xpert/${context.assistantId}/agent/${context.agentKey}?data=` +
      encodeURIComponent(JSON.stringify({ order: { createdAt: 'DESC' }, take: 100, skip }))
  )
  assert(Array.isArray(page.items) && Number.isInteger(page.total), 'Invalid execution page')
  executions.push(...page.items)
  if (executions.length >= page.total) break
  assert(page.items.length, 'Incomplete execution pagination')
}
const roots = executions.filter((item) => item.threadId === context.threadId && !item.parentId)
assert(
  roots.some((item) => item.status === 'success'),
  'Missing successful real model executions'
)
for (const execution of roots) {
  const snapshot = execution.metadata?.primaryModelSnapshot
  assert.equal(execution.metadata?.primaryModelId, context.model.id)
  assert.equal(snapshot?.model, context.model.name)
  assert.equal(snapshot?.copilotId, context.model.copilotId)
  assert.deepEqual(snapshot?.options, context.model.options)
}
const receipt = {
  startedAt: new Date().toISOString(),
  status: 'running',
  cases: [],
  model: context.model,
  rounds: roots.map((item) => ({ executionId: item.id, status: item.status, createdAt: item.createdAt })),
  toolErrors: all
    .filter((message) => message.status === 'error')
    .map((message) => ({ tool: message.name, error: message.content }))
}

function checkpoint() {
  fs.writeFileSync(args.receipt, JSON.stringify(receipt, null, 2), { mode: 0o600 })
  fs.chmodSync(args.receipt, 0o600)
}
checkpoint()
try {
  for (const spec of context.cases) {
    const created = saves.filter((reply) => reply.output.dashboard.title === spec.title).at(-1)
    assert(created, `No successful Agent save receipt for ${spec.title}`)
    const artifactId = created.output.dashboard.artifactId
    assert(
      saves.some(
        (reply) =>
          reply.output.dashboard.artifactId === artifactId &&
          ['dashboard_create', 'dashboard_create_html'].includes(reply.invocation.name)
      ),
      'Artifact must have been created in this chat'
    )
    const latest = (await call(view + '/data?parameters=' + encodeURIComponent(JSON.stringify({ artifactId })))).meta
    const published = latest.versions?.[0]
    assert(published?.versionId, 'Publish the Agent draft through the UI before verification')
    const versionId = published.versionId
    const saved = (
      await call(view + '/data?parameters=' + encodeURIComponent(JSON.stringify({ artifactId, versionId })))
    ).meta.saved
    assert.notEqual(saved.isDraft, true)
    assert.equal(saved.versionId, versionId)
    assert.equal(saved.title, spec.title)
    if (spec.presentation) assert.equal(saved.manifest.presentation?.type, spec.presentation)
    if (spec.presentation === 'html') {
      assert(
        saves.some(
          (reply) =>
            reply.output.dashboard.artifactId === artifactId && reply.invocation.name === 'dashboard_create_html'
        ),
        'HTML must have been created by the Agent domain tool'
      )
      assert(saved.manifest.presentation.html.includes('window.xpertLiveArtifact'), 'Missing live HTML runtime')
      const sourceFile = saves
        .filter((reply) => reply.output.dashboard.artifactId === artifactId && reply.output.sourceFile?.sha256)
        .at(-1)?.output.sourceFile
      assert(sourceFile, 'Missing Agent-authored HTML file receipt')
      assert.equal(
        createHash('sha256').update(saved.manifest.presentation.html).digest('hex'),
        sourceFile.sha256,
        'Published HTML differs from the Agent-saved file'
      )
    }
    const bindingSpecs = spec.bindings ?? [{ providerId: spec.providerId, scenarios: spec.scenarios }]
    assert.equal(saved.manifest.bindings.length, bindingSpecs.length)
    const result = {
      title: spec.title,
      artifactId,
      versionId,
      presentation: saved.manifest.presentation?.type ?? 'standard',
      bindings: [],
      scenarios: []
    }
    receipt.cases.push(result)
    for (const bindingSpec of bindingSpecs) {
      const matching = saved.manifest.bindings.filter(
        (item) =>
          item.providerId === bindingSpec.providerId &&
          (!bindingSpec.datasetId || item.output.datasetId === bindingSpec.datasetId)
      )
      assert.equal(matching.length, 1, 'Specify an unambiguous Provider/dataset pair')
      const binding = matching[0]
      assert(!result.bindings.some((item) => item.bindingId === binding.id), 'Each Binding needs its own scenarios')
      assert(
        registrations.some(
          (reply) =>
            reply.invocation.args.providerId === bindingSpec.providerId &&
            JSON.stringify(reply.output.source) === JSON.stringify(binding.source)
        ),
        'Published Binding must use an Agent-registered source from an explicitly selected chat'
      )
      result.bindings.push({ bindingId: binding.id, providerId: binding.providerId, source: binding.source })
      checkpoint()
      const fingerprints = []
      for (const scenario of bindingSpec.scenarios) {
        const input = { artifactId, versionId, bindingId: binding.id, controls: scenario.controls }
        const first = (await call(view + '/actions/query-binding', { input })).data
        const second = (await call(view + '/actions/query-binding', { input })).data
        for (const dataset of [first, second]) {
          assert.equal(dataset.datasetId, binding.output.datasetId)
          assert.equal(dataset.provenance.bindingId, binding.id)
          assert.equal(dataset.provenance.providerId, binding.providerId)
          assert(dataset.rows.length > 0, 'Upstream returned no rows')
          if (scenario.expectedRows !== undefined) assert.equal(dataset.rows.length, scenario.expectedRows)
          if (scenario.maxRows) assert(dataset.rows.length <= scenario.maxRows)
          for (const [field, value] of Object.entries(scenario.equals ?? {}))
            assert(
              dataset.rows.every((row) => row[field] === value),
              `Filter did not constrain ${field}`
            )
          if (scenario.contains)
            assert(
              JSON.stringify(dataset.rows).toLowerCase().includes(scenario.contains.toLowerCase()),
              'Search topic missing from actual rows'
            )
        }
        assert.notEqual(first.provenance.executionId, second.provenance.executionId, 'Refresh reused an execution')
        assert(
          Date.parse(second.freshness.sourceFetchedAt) > Date.parse(first.freshness.sourceFetchedAt),
          'Refresh did not fetch newer upstream data'
        )
        const fingerprint = createHash('sha256').update(JSON.stringify(first.rows)).digest('hex')
        fingerprints.push(fingerprint)
        result.scenarios.push({
          bindingId: binding.id,
          providerId: binding.providerId,
          controls: scenario.controls,
          rows: first.rows.length,
          fingerprint,
          executedAt: first.freshness.sourceFetchedAt,
          refreshedAt: second.freshness.sourceFetchedAt,
          executionId: first.provenance.executionId,
          refreshExecutionId: second.provenance.executionId
        })
        checkpoint()
      }
      assert.equal(
        new Set(fingerprints).size,
        bindingSpec.scenarios.length,
        'Different filters returned identical rows'
      )
    }
    const combined = (await call(view + '/actions/query', { input: { artifactId, versionId, controls: {} } })).data
    assert.deepEqual(
      combined.datasets.map((dataset) => dataset.provenance.bindingId).sort(),
      saved.manifest.bindings.map((binding) => binding.id).sort(),
      'Combined refresh must return every Binding exactly once'
    )
    for (const invalid of [
      { artifactId, versionId, controls: { forged: 'not-allowed' } },
      { artifactId, versionId, bindingId: 'unknown_binding', controls: {} }
    ]) {
      const denied = await raw(view + '/actions/' + (invalid.bindingId ? 'query-binding' : 'query'), { input: invalid })
      assert(denied.status >= 400 && denied.status < 500, 'Invalid control/Binding was accepted')
    }
    const anonymous = await raw(view + '/actions/query', { input: { artifactId, versionId, controls: {} } }, true)
    assert.equal(anonymous.status, 401)
    result.boundaries = { unknownControl: 'denied', unknownBinding: 'denied', anonymous: 'denied' }
    checkpoint()
  }
  receipt.status = 'passed'
  receipt.completedAt = new Date().toISOString()
  checkpoint()
  console.log(
    JSON.stringify({
      passed: true,
      dashboards: receipt.cases.length,
      scenarios: receipt.cases.reduce((n, item) => n + item.scenarios.length, 0)
    })
  )
} catch (error) {
  receipt.status = 'failed'
  receipt.error = error.message
  checkpoint()
  throw error
}
