// Opt in only against a disposable Runner and a verified npm-packed Workspace Script Action.
import { randomUUID } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import type { SandboxRuntimeFileUploadResponse } from '@xpert-ai/plugin-sdk'
import { SandboxJobInvocationSession } from '../../sandbox-job/sandbox-job-invocation'
import { buildRunnerCommand } from '../../sandbox-job/sandbox-job-files'
import { SandboxRuntimeDefinitionRegistry } from '../../sandbox-job/sandbox-runtime-definition.registry'
import { NsjailComputeRuntimeProvider } from './nsjail-compute-runtime.provider'

const live =
    process.env.NSJAIL_COMPUTE_TEST_URL &&
    process.env.NSJAIL_COMPUTE_TEST_TOKEN &&
    process.env.WORKSPACE_SCRIPT_ACTION_DIR
const csv = 'region,sales\nEast,1000\nEast,1000\nEast,1000\nEast,500\nWest,1000\nWest,1000\nWest,200\n'
const scripts = {
    python: `async def query(ctx):
    file = await ctx.files.read('orders')
    groups = {}
    for row in ctx.csv.parse(file['text']):
        if ctx.parameters.get('region') and row['region'] != ctx.parameters['region']: continue
        group = groups.setdefault(row['region'], {'region': row['region'], 'sales': 0, 'rows': 0})
        group['sales'] += int(row['sales'])
        group['rows'] += 1
    for group in groups.values(): group['discounted'] = group['sales'] * 9 // 10
    return ctx.dataset(list(groups.values()))
`,
    javascript: `export async function query(ctx) {
    const file = await ctx.files.read('orders'); const groups = new Map();
    for (const row of ctx.csv.parse(file.text)) {
        if (ctx.parameters.region && row.region !== ctx.parameters.region) continue;
        const group = groups.get(row.region) ?? {region: row.region, sales: 0, rows: 0};
        group.sales += Number(row.sales); group.rows++; groups.set(row.region, group);
    }
    return ctx.dataset([...groups.values()].map(group => ({...group, discounted: group.sales * 9 / 10})));
}`
}

async function actionFiles(root: string, relative = ''): Promise<Array<[string, Uint8Array]>> {
    const result: Array<[string, Uint8Array]> = []
    for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
        const name = path.posix.join(relative, entry.name)
        if (entry.isDirectory()) result.push(...(await actionFiles(root, name)))
        else if (entry.isFile())
            result.push([`/workspace/runtime/action/${name}`, await readFile(path.join(root, name))])
        else throw new Error('Action fixture must contain only regular files and directories')
    }
    return result
}

;(live ? describe : describe.skip)('NsJail Compute with the packed Workspace Script Action', () => {
    const previous = { url: process.env.NSJAIL_RUNNER_URL, token: process.env.NSJAIL_RUNNER_TOKEN }
    beforeAll(() => {
        process.env.NSJAIL_RUNNER_URL = process.env.NSJAIL_COMPUTE_TEST_URL
        process.env.NSJAIL_RUNNER_TOKEN = process.env.NSJAIL_COMPUTE_TEST_TOKEN
    })
    afterAll(() => {
        if (previous.url === undefined) delete process.env.NSJAIL_RUNNER_URL
        else process.env.NSJAIL_RUNNER_URL = previous.url
        if (previous.token === undefined) delete process.env.NSJAIL_RUNNER_TOKEN
        else process.env.NSJAIL_RUNNER_TOKEN = previous.token
    })

    it.each([
        ['python', 'base'],
        ['python', 'filter'],
        ['python', 'refresh'],
        ['javascript', 'base'],
        ['javascript', 'filter'],
        ['javascript', 'refresh']
    ] as const)(
        '%s %s executes through the real Provider and host invocation bridge',
        async (language, scenario) => {
            const definitions = new SandboxRuntimeDefinitionRegistry()
            const definition = definitions.require('compute/node-python/v1')
            const provider = new NsjailComputeRuntimeProvider(definitions)
            const binding = provider.listBindings()[0]
            expect(await provider.getBindingHealth({ binding, definition })).toMatchObject({ available: true })
            const workFor = { type: 'job' as const, id: randomUUID() }
            const tenantId = 'nsjail-integration-test'
            const runtime = await provider.create({
                definition,
                binding,
                tenantId,
                workFor,
                ephemeral: true,
                volume: { serverRoot: '/unused', hostRoot: '/unused' },
                resources: definition.resources,
                networkPolicy: definition.networkPolicy,
                security: definition.security,
                hardDeadlineMs: definition.hardDeadlineMs
            })
            const source = scenario === 'refresh' ? csv + 'East,100\n' : csv
            const handle = jest.fn(async () => ({ text: source }))
            const invocations = new SandboxJobInvocationSession(workFor.id, runtime, {
                invocation: { operations: ['file.read'], maxCalls: 1, maxBytes: 1024 * 1024, handle }
            })
            const assertUploaded = (results: SandboxRuntimeFileUploadResponse[]) =>
                expect(results.every((result) => result.error === null)).toBe(true)
            try {
                const actionRoot = process.env.WORKSPACE_SCRIPT_ACTION_DIR
                assertUploaded(await runtime.uploadFiles(await actionFiles(path.join(actionRoot, 'bundle'))))
                assertUploaded(
                    await runtime.uploadFiles([
                        [
                            '/workspace/runtime/action-manifest.json',
                            await readFile(path.join(actionRoot, 'action.json'))
                        ],
                        ['/workspace/input/script', Buffer.from(scripts[language])],
                        [
                            '/workspace/input/job.json',
                            Buffer.from(
                                JSON.stringify({
                                    payload: {
                                        language,
                                        parameters: { region: scenario === 'filter' ? 'West' : null },
                                        outputKeys: ['region', 'sales', 'discounted', 'rows']
                                    }
                                })
                            )
                        ]
                    ])
                )
                const response = await runtime.execute(buildRunnerCommand(definition, runtime.workspaceRoot), {
                    onOutput: (output) => invocations.push(output)
                })
                expect(response).toMatchObject({ exitCode: 0, timedOut: false, truncated: false })
                await invocations.finish()
                expect(handle).toHaveBeenCalledTimes(1)
                expect(handle).toHaveBeenCalledWith(
                    'file.read',
                    expect.objectContaining({ alias: 'orders' }),
                    expect.anything()
                )
                const [output] = await runtime.downloadFiles(['/workspace/output/dataset.json'])
                expect(output.error).toBeNull()
                const expected = [
                    {
                        region: 'East',
                        sales: scenario === 'refresh' ? 3600 : 3500,
                        discounted: scenario === 'refresh' ? 3240 : 3150,
                        rows: scenario === 'refresh' ? 5 : 4
                    },
                    { region: 'West', sales: 2200, discounted: 1980, rows: 3 }
                ]
                expect(JSON.parse(Buffer.from(output.content).toString())).toMatchObject({
                    rows: scenario === 'filter' ? expected.slice(1) : expected
                })
            } finally {
                invocations.close()
                await provider.destroy({
                    tenantId,
                    workFor,
                    runtimeProfile: definition.name,
                    runtimeBindingId: binding.id,
                    artifact: binding.artifact,
                    runtimeRef: runtime.id
                })
            }
        },
        40_000
    )
})
