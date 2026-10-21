/** Real public upstream acceptance through the installed LiveDashboard authoring tools.
 * Credentials come from local-plugin-cli; never use browser sessions or mint test identities.
 * Only this run's temporary toolsets/definitions are changed. Receipts contain no credentials.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { createRequestHeaders, parseCliArgs, requireAuthentication } from './local-plugin-cli.mjs'

const args = parseCliArgs(process.argv.slice(2), { booleanFlags: ['keepFixtures', 'help'] })
if (args.help) {
  console.log(
    'node tools/scripts/verify-analytics-upstreams.mjs --api-url URL --context-file PRIVATE_JSON --receipt-file PRIVATE_JSON [--keep-fixtures]'
  )
  console.log(
    'Context: { orgId, workspaceId, xpertId }. Uses GitHub REST and Microsoft Learn MCP; creates temporary toolsets and private Definitions. Default: delete toolsets and archive Definitions. --keep-fixtures retains working fixtures for local UI testing.'
  )
} else {
  await main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}

async function main() {
  for (const key of ['apiUrl', 'contextFile', 'receiptFile']) assert.ok(args[key], `Missing --${key}`)
  const context = JSON.parse(fs.readFileSync(args.contextFile, 'utf8'))
  for (const key of ['orgId', 'workspaceId', 'xpertId'])
    assert.match(context[key] ?? '', /^[a-f0-9-]{36}$/i, `Invalid ${key}`)
  const receiptPath = path.resolve(args.receiptFile)
  fs.mkdirSync(path.dirname(receiptPath), { recursive: true, mode: 0o700 })
  assert.equal(fs.statSync(path.dirname(receiptPath)).mode & 0o077, 0, 'Receipt directory must be private (0700)')
  const origin = args.apiUrl.replace(/\/$/, '')
  const auth = await requireAuthentication({ apiUrl: origin })
  const headers = createRequestHeaders({ scope: 'organization', orgId: context.orgId }, auth.token, auth.tenantId)
  const receipt = { startedAt: new Date().toISOString(), status: 'running', upstreams: {}, fixtures: [] }
  const checkpoint = () => {
    fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2), { mode: 0o600 })
    fs.chmodSync(receiptPath, 0o600)
  }
  checkpoint()
  async function raw(route, body, method = body ? 'POST' : 'GET') {
    const response = await fetch(origin + '/api' + route, {
      headers,
      method,
      signal: AbortSignal.timeout(120000),
      ...(body ? { body: JSON.stringify(body) } : {})
    })
    const text = await response.text()
    return { status: response.status, data: text ? JSON.parse(text) : null }
  }
  async function call(route, body, method) {
    const result = await raw(route, body, method)
    assert.ok(result.status < 300, `HTTP ${result.status} at ${route.split('?')[0].replace(/[a-f0-9-]{36}/gi, '[id]')}`)
    return result.data
  }
  const toolBody = (parameters) => ({ xpertId: context.xpertId, options: {}, parameters })
  const toolRoute = (name) => `/xpert-agent/middlewares/LiveDashboard/tools/analytics_definition_${name}/test`
  async function invoke(name, parameters) {
    const value = await call(toolRoute(name), toolBody(parameters))
    return typeof value === 'string' ? JSON.parse(value) : value
  }
  const denied = (response) =>
    assert.ok(response.status >= 400 && response.status < 500, `Expected denial, received HTTP ${response.status}`)
  try {
    for (const kind of ['rest', 'mcp']) {
      const spec = upstreamSpec(kind)
      const name = `Analytics acceptance ${kind} ${randomUUID().slice(0, 8)}`
      const base = { name, workspaceId: context.workspaceId, ...spec.toolset }
      if (kind === 'rest') {
        const parsed = await call('/xpert-toolset/provider/openapi/schema', { schema: base.schema })
        base.tools = parsed.parameters_schema.map((bundle) => ({
          name: bundle.operation_id,
          description: bundle.summary,
          schema: bundle.schema,
          enabled: true,
          options: { api_bundle: bundle }
        }))
      } else {
        const response = await fetch(origin + '/api/xpert-toolset/provider/mcp/tools', {
          method: 'POST',
          headers,
          body: JSON.stringify(base),
          signal: AbortSignal.timeout(120000)
        })
        assert.ok(response.ok, `MCP metadata HTTP ${response.status}`)
        const messages = (await response.text())
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => JSON.parse(line.slice(5)))
        const result = messages.find((message) => message.data?.tools)?.data
        assert.ok(result?.tools?.length, 'MCP tool metadata missing')
        base.tools = result.tools.map((tool) => ({ ...tool, enabled: true }))
      }
      const connection = await call('/xpert-toolset', base)
      const fixture = { kind, toolsetId: connection.id, deleted: false, archived: false }
      receipt.fixtures.push(fixture)
      checkpoint()
      const selection = {
        providerId: kind === 'rest' ? 'rest.json' : 'mcp.tool',
        // The empty MCP schema key must resolve exactly as createMCPClient resolves it.
        connectionKey: kind === 'rest' ? connection.id : JSON.stringify([connection.id, name])
      }
      const catalog = await invoke('connections', {})
      assert.ok(
        catalog.some(
          (entry) => entry.providerId === selection.providerId && entry.connectionKey === selection.connectionKey
        )
      )
      const inspection = await invoke('inspect', { ...selection, inputJson: '{}' })
      assert.ok(
        inspection.metadata.operations.some((operation) => (operation.operationId ?? operation.name) === spec.operation)
      )
      const sampled = await invoke('inspect', { ...selection, inputJson: JSON.stringify(spec.sample) })
      assert.ok(sampled.metadata.sampleJson.length > 0)
      const input = { ...selection, requestId: randomUUID(), name, definitionJson: JSON.stringify(spec.definition) }
      const registered = await invoke('register', input)
      fixture.source = registered.source
      checkpoint()
      assert.deepEqual(
        (await invoke('register', input)).source,
        registered.source,
        'Registration retry must reuse immutable source'
      )
      const discovery = await call('/analytics/discover', registered.discoveryRequest)
      assert.ok(discovery.items.length)
      const detail = await call('/analytics/discover', {
        ...registered.discoveryRequest,
        request: discovery.items[0].inspectRequest
      })
      const metadata = detail.items[0].metadata
      const binding = {
        id: `acceptance_${kind}`,
        source: registered.source,
        providerId: selection.providerId,
        operation: detail.queryContract.operation,
        contractVersion: detail.queryContract.contractVersion,
        payload: metadata.bindingPayload,
        parameters: [],
        output: {
          datasetId: `acceptance_${kind}`,
          grain: [],
          fields: metadata.columns.map(({ key, label, logicalType, nullable, role }) => ({
            id: key,
            sourceField: key,
            label,
            logicalType,
            nullable,
            role
          }))
        }
      }
      fixture.binding = binding
      checkpoint()
      const query = await call('/analytics/query', { binding, controls: {} })
      assert.ok(query.rows.length > 0)
      assert.equal(query.completeness.scope, 'page')
      if (kind === 'rest') assert.equal(query.rows.length, 3)
      const current = await call(
        `/xpert-toolset/${connection.id}?$relations=${encodeURIComponent(JSON.stringify(['tools']))}`
      )
      try {
        await call(
          `/xpert-toolset/${connection.id}`,
          { tools: current.tools.map((tool) => ({ ...tool, disabled: true })) },
          'PUT'
        )
        denied(await raw('/analytics/query', { binding, controls: {} }))
        assert.equal((await invoke('inspect', { ...selection, inputJson: '{}' })).metadata.operations.length, 0)
        denied(await raw(toolRoute('register'), toolBody(input)))
      } finally {
        await call(`/xpert-toolset/${connection.id}`, { tools: current.tools }, 'PUT')
      }
      assert.ok(
        (await call('/analytics/query', { binding, controls: {} })).rows.length > 0,
        'Same pinned Binding must work after tool restoration'
      )
      const anonymous = await fetch(origin + '/api/analytics/query', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ binding, controls: {} }),
        signal: AbortSignal.timeout(30000)
      })
      await anonymous.body?.cancel()
      assert.equal(anonymous.status, 401)
      denied(
        await raw(
          toolRoute('register'),
          toolBody({ ...input, definitionJson: JSON.stringify({ ...spec.definition, workspaceId: randomUUID() }) })
        )
      )
      denied(
        await raw('/analytics/query', {
          binding: { ...binding, source: { ...binding.source, versionId: randomUUID() } },
          controls: {}
        })
      )
      receipt.upstreams[kind] = {
        endpoint: spec.endpoint,
        rows: query.rows.length,
        register: true,
        retry: true,
        discover: true,
        query: true,
        revokedQuery: true,
        revokedRegistration: true,
        revokedToolHidden: true,
        restoredBinding: true,
        anonymousDenied: true,
        forgedScopeDenied: true,
        wrongVersionDenied: true
      }
      checkpoint()
      console.log(
        `${kind}: real register/retry/discover/query and authorization checks passed (${query.rows.length} rows)`
      )
    }
    receipt.status = 'passed'
  } catch (error) {
    receipt.status = 'failed'
    throw error
  } finally {
    const cleanupErrors = []
    if (!args.keepFixtures || receipt.status !== 'passed') {
      for (const fixture of receipt.fixtures) {
        try {
          await call(`/xpert-toolset/${fixture.toolsetId}`, undefined, 'DELETE')
          fixture.deleted = true
          if (fixture.binding) {
            denied(await raw('/analytics/query', { binding: fixture.binding, controls: {} }))
            fixture.deletedConnectionDenied = true
          }
        } catch {
          cleanupErrors.push(`${fixture.kind} connection cleanup failed`)
        }
        if (fixture.source) {
          try {
            await call(`/analytics/definitions/${fixture.source.definitionId}`, { status: 'archived' }, 'PATCH')
            fixture.archived = true
          } catch {
            cleanupErrors.push(`${fixture.kind} definition cleanup failed`)
          }
        }
      }
    }
    receipt.finishedAt = new Date().toISOString()
    receipt.cleanupErrors = cleanupErrors
    if (cleanupErrors.length) receipt.status = 'failed'
    checkpoint()
    assert.equal(cleanupErrors.length, 0, cleanupErrors.join('; '))
  }
}

function column(key, sourcePath, label, role, logicalType = 'string') {
  return { key, path: sourcePath, label, description: label, logicalType, role, nullable: false }
}
function upstreamSpec(kind) {
  if (kind === 'mcp')
    return {
      endpoint: 'https://learn.microsoft.com/api/mcp',
      operation: 'microsoft_docs_search',
      toolset: {
        type: 'mcp',
        category: 'mcp',
        schema: JSON.stringify({ mcpServers: { '': { type: 'http', url: 'https://learn.microsoft.com/api/mcp' } } })
      },
      sample: { toolName: 'microsoft_docs_search', arguments: { query: 'Azure Blob Storage lifecycle policy' } },
      definition: {
        name: 'Microsoft documentation search',
        description: 'Live Microsoft Learn search page. Each row is a document excerpt, not all documentation.',
        toolName: 'microsoft_docs_search',
        defaultArguments: { query: 'Azure Blob Storage lifecycle policy' },
        result: {
          format: 'structured',
          rowsPath: ['results'],
          scope: 'page',
          columns: [
            column('title', ['title'], 'Document title', 'dimension'),
            column('url', ['contentUrl'], 'Document URL', 'identifier')
          ]
        }
      }
    }
  const openapi = {
    openapi: '3.0.0',
    info: { title: 'GitHub public commits acceptance', version: '1' },
    servers: [{ url: 'https://api.github.com' }],
    paths: {
      '/repos/xpert-ai/xpert/commits': {
        get: {
          operationId: 'list_repository_commits',
          description: 'Recent public commits, one commit per row. Partial page, not total repository activity.',
          parameters: [
            { name: 'per_page', in: 'query', required: true, schema: { type: 'integer', minimum: 1, maximum: 5 } }
          ],
          responses: { 200: { description: 'Commit array' } }
        }
      }
    }
  }
  return {
    endpoint: 'https://api.github.com/repos/xpert-ai/xpert/commits',
    operation: 'list_repository_commits',
    toolset: {
      type: 'openapi',
      category: 'api',
      schemaType: 'openapi_json',
      schema: JSON.stringify(openapi),
      credentials: { auth_type: 'none' }
    },
    sample: { operationId: 'list_repository_commits', arguments: { query: { per_page: 3 } } },
    definition: {
      name: 'Public repository commits',
      description: 'Three recent GitHub commits. One commit per row. Partial page, not total repository activity.',
      operationId: 'list_repository_commits',
      defaultArguments: { query: { per_page: 3 } },
      pagination: { type: 'none' },
      result: {
        rowsPath: [],
        scope: 'page',
        columns: [
          column('sha', ['sha'], 'Commit SHA', 'identifier'),
          column('message', ['commit', 'message'], 'Commit message', 'dimension'),
          column('date', ['commit', 'committer', 'date'], 'Commit timestamp', 'time', 'timestamp')
        ]
      }
    }
  }
}
