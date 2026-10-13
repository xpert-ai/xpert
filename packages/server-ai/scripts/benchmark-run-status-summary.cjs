// Emit a standalone, read-only probe for an existing API container's Node runtime.
// Uses real handlers/serializer with a SQL adapter; excludes HTTP auth and TypeORM hydration.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const ts = require('typescript')

const root = path.resolve(__dirname, '../../..')
const files = [
    'xpert-agent-execution/queries/handlers/get-one.handler',
    'xpert-agent-execution/queries/handlers/get-run-summary.handler',
    'xpert-agent-execution/queries/get-one.query',
    'xpert-agent-execution/queries/get-run-summary.query',
    'xpert-agent-execution/dto/execution.dto',
    'xpert-agent-execution/model-usage.execution',
    'copilot-checkpoint/checkpoint-saver',
    'copilot-checkpoint/checkpoint-reference',
    'copilot-checkpoint/serde/message-state',
    'copilot-checkpoint/queries/get-tuple.query',
    'ai/agent-run-summary',
    'shared/avatar'
]
const modules = Object.fromEntries(
    files.map((file) => {
        const source = fs.readFileSync(path.join(root, 'packages/server-ai/src', `${file}.ts`), 'utf8')
        return [
            file,
            {
                sha256: crypto.createHash('sha256').update(source).digest('hex'),
                code: ts.transpileModule(source, {
                    compilerOptions: {
                        target: ts.ScriptTarget.ES2020,
                        module: ts.ModuleKind.CommonJS,
                        experimentalDecorators: true,
                        esModuleInterop: true
                    }
                }).outputText
            }
        ]
    })
)

process.stdout.write(`(${probe.toString()})(${JSON.stringify(modules)}).catch(error => {
    console.error(JSON.stringify({ error: error.name, code: error.code })); process.exitCode = 1
})\n`)

async function probe(modules) {
    const { performance } = require('node:perf_hooks')
    const { createHash } = require('node:crypto')
    const path = require('node:path')
    const assert = require('node:assert/strict')
    const { Client } = require('pg')
    require('reflect-metadata')
    const ids = process.argv.slice(2)
    if (!ids.length || ids.length > 3 || ids.some((id) => !/^[a-f0-9-]{36}$/.test(id))) {
        throw new Error('Provide one to three execution UUIDs')
    }
    const cache = new Map()
    class DependencyToken {}
    const tokenModules = {
        'xpert-agent-execution/agent-execution.service': { XpertAgentExecutionService: DependencyToken },
        'copilot-usage': { CopilotUsageService: DependencyToken },
        'copilot-checkpoint/copilot-checkpoint.entity': { CopilotCheckpoint: DependencyToken },
        'copilot-checkpoint/writes/writes.entity': { CopilotCheckpointWrites: DependencyToken },
        'xpert-agent/dto': { XpertAgentIdentiDto: DependencyToken },
        'xpert/dto': { XpertIdentiDto: DependencyToken }
    }
    function load(id) {
        if (cache.has(id)) return cache.get(id)
        if (tokenModules[id]) return tokenModules[id]
        if (id === 'xpert-agent-execution/dto') return load(`${id}/execution.dto`)
        if (id === 'copilot-checkpoint/queries') return load(`${id}/get-tuple.query`)
        if (!modules[id]) throw new Error(`Unexpected source module: ${id}`)
        const module = { exports: {} }
        cache.set(id, module.exports)
        const localRequire = (request) => {
            if (request === '@xpert-ai/server-common') return { omit: require('lodash').omit }
            if (request === '@xpert-ai/server-core') return { UserPublicDTO: DependencyToken }
            return request.startsWith('.')
                ? load(path.posix.normalize(path.posix.join(path.posix.dirname(id), request)))
                : require(request)
        }
        new Function('require', 'module', 'exports', modules[id].code)(localRequire, module, module.exports)
        return module.exports
    }
    const { XpertAgentExecutionOneHandler } = load('xpert-agent-execution/queries/handlers/get-one.handler')
    const { XpertAgentExecutionOneQuery } = load('xpert-agent-execution/queries/get-one.query')
    const { GetAgentExecutionRunSummaryHandler } = load(
        'xpert-agent-execution/queries/handlers/get-run-summary.handler'
    )
    const { GetAgentExecutionRunSummaryQuery } = load('xpert-agent-execution/queries/get-run-summary.query')
    const { CopilotCheckpointSaver } = load('copilot-checkpoint/checkpoint-saver')
    const { toAgentRunSummary } = load('ai/agent-run-summary')
    const client = new Client({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT),
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        connectionTimeoutMillis: 5000,
        application_name: 'readonly_run_status_comparison',
        options:
            '-c default_transaction_read_only=on -c statement_timeout=5000 -c idle_in_transaction_session_timeout=30000'
    })
    let queryCount = 0
    let scope
    let childReads = 0
    async function query(sql, params) {
        queryCount++
        return (await client.query(sql, params)).rows
    }
    function identifier(key) {
        if (!/^[A-Za-z][A-Za-z0-9]*$/.test(key)) throw new Error('Invalid source field')
        return `"${key}"`
    }
    async function readExecution(column, value, options = {}) {
        const fields = options.select
            ? Object.entries(options.select)
                  .filter(([, selected]) => selected === true)
                  .map(([key]) => `e.${identifier(key)}`)
                  .join(', ')
            : 'e.*'
        const assistant = options.select?.xpert
            ? `json_build_object(${Object.keys(options.select.xpert)
                  .map((key) => `'${key}', x.${identifier(key)}`)
                  .join(', ')})`
            : 'row_to_json(x)'
        const withCreator = Array.isArray(options.relations) && options.relations.includes('createdBy')
        return query(
            `SELECT ${fields}, ${assistant} AS xpert ${withCreator ? ', row_to_json(u) AS "createdBy"' : ''}
            FROM xpert_agent_execution e
            LEFT JOIN xpert x ON x.id=e."xpertId" AND x."deletedAt" IS NULL
            ${withCreator ? 'LEFT JOIN "user" u ON u.id=e."createdById"' : ''}
            WHERE e.${identifier(column)}=$1 AND e."tenantId"=$2 AND e."organizationId" IS NOT DISTINCT FROM $3::uuid
            ORDER BY e."createdAt" ASC`,
            [value, scope.tenantId, scope.organizationId]
        )
    }
    const service = {
        async findOne(id, options) {
            if (typeof id === 'object') {
                options = id
                id = options.where.id
            }
            const rows = await readExecution('id', id, options)
            if (!rows[0]) throw new Error('Sample is outside the selected scope')
            return rows[0]
        },
        async findAllByParentId(id, options) {
            if (++childReads > 30) throw new Error('Sample exceeds the bounded tree size')
            return readExecution('parentId', id, options)
        }
    }
    const saver = new CopilotCheckpointSaver(
        {
            find: ({ where }) =>
                query(
                    `SELECT * FROM copilot_checkpoint
            WHERE thread_id=$1 AND checkpoint_ns=$2 AND ($3::text IS NULL OR checkpoint_id=$3)
            ORDER BY checkpoint_id DESC LIMIT 1`,
                    [where.thread_id, where.checkpoint_ns, where.checkpoint_id ?? null]
                )
        },
        {
            find: ({ where }) =>
                query(
                    `SELECT * FROM copilot_checkpoint_writes
            WHERE thread_id=$1 AND checkpoint_ns=$2 AND checkpoint_id=$3`,
                    [where.thread_id, where.checkpoint_ns, where.checkpoint_id]
                )
        }
    )
    const detail = new XpertAgentExecutionOneHandler(
        service,
        {
            execute: (command) => saver.getTuple({ configurable: command.configurable })
        },
        {
            async getModelUsages(executionIds, tenantId) {
                const rows = await query(
                    `SELECT * FROM membership_point_ledger
                WHERE "tenantId"=$1 AND source='model_usage' AND "originExecutionId"=ANY($2::uuid[])
                ORDER BY "recordedAt" ASC`,
                    [tenantId, executionIds]
                )
                // The selected historical samples have no usage rows. Refuse a different fixture.
                if (rows.length) throw new Error('Choose a sample without model usage rows for this probe')
                return []
            }
        }
    )
    const summary = new GetAgentExecutionRunSummaryHandler(service)
    function response(execution) {
        return JSON.stringify({
            run_id: execution.id,
            thread_id: execution.threadId,
            assistant_id: execution.xpertId,
            created_at: execution.createdAt.toISOString(),
            updated_at: execution.updatedAt.toISOString(),
            status: execution.status,
            metadata: { ...execution.metadata, agentRun: toAgentRunSummary(execution) }
        })
    }
    async function measure(handler, command) {
        queryCount = 0
        childReads = 0
        const start = performance.now()
        const value = response(await handler.execute(command))
        return { ms: performance.now() - start, queries: queryCount, value }
    }
    const samples = []
    try {
        await client.connect()
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
        for (const id of ids) {
            scope = (await query('SELECT "tenantId", "organizationId" FROM xpert_agent_execution WHERE id=$1', [id]))[0]
            if (!scope) throw new Error('Missing execution sample')
            for (let iteration = 0; iteration < 6; iteration++) {
                const before = () => measure(detail, new XpertAgentExecutionOneQuery(id))
                const after = () => measure(summary, new GetAgentExecutionRunSummaryQuery(id))
                // Alternate order to reduce cache/order bias; iteration zero is warmup.
                const pair =
                    iteration % 2 === 0
                        ? { before: await before(), after: await after() }
                        : { after: await after(), before: await before() }
                assert.equal(pair.before.value, pair.after.value, 'Run response changed')
                samples.push({
                    sample: id.slice(0, 8),
                    iteration,
                    warmup: iteration === 0,
                    before_ms: pair.before.ms,
                    after_ms: pair.after.ms,
                    before_queries: pair.before.queries,
                    after_queries: pair.after.queries,
                    response_bytes: Buffer.byteLength(pair.after.value),
                    response_sha256: createHash('sha256').update(pair.after.value).digest('hex')
                })
            }
        }
        console.log(
            JSON.stringify({
                at: new Date().toISOString(),
                node: process.version,
                scope: 'actual handlers and checkpoint serializer; read-only SQL adapter; one connection; no HTTP/auth/ORM/pool queue',
                source_sha256: Object.fromEntries(Object.entries(modules).map(([key, value]) => [key, value.sha256])),
                response_equality: true,
                samples
            })
        )
    } finally {
        await client.query('ROLLBACK').catch(() => undefined)
        await client.end()
    }
}
