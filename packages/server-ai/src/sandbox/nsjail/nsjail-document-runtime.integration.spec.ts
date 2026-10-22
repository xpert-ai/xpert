// Opt in against a disposable Runner, npm-packed Actions and text/scanned PDF fixtures.
import { randomUUID } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { buildRunnerCommand } from '../sandbox-job/sandbox-job-files'
import { SandboxRuntimeDefinitionRegistry } from '../sandbox-job/sandbox-runtime-definition.registry'
import { NsjailDocumentRuntimeProvider } from './nsjail-document-runtime.provider'

const live =
    process.env.NSJAIL_DOCUMENT_TEST_URL &&
    process.env.NSJAIL_DOCUMENT_TEST_TOKEN &&
    process.env.ANYDOC_ACTION_DIR &&
    process.env.OPENDATALOADER_ACTION_DIR &&
    process.env.NSJAIL_DOCUMENT_FIXTURE_DIR

;(live ? describe : describe.skip)('NsJail with packed document Actions', () => {
    const previous = { url: process.env.NSJAIL_RUNNER_URL, token: process.env.NSJAIL_RUNNER_TOKEN }
    beforeAll(() => {
        process.env.NSJAIL_RUNNER_URL = process.env.NSJAIL_DOCUMENT_TEST_URL
        process.env.NSJAIL_RUNNER_TOKEN = process.env.NSJAIL_DOCUMENT_TEST_TOKEN
    })
    afterAll(() => {
        if (previous.url === undefined) delete process.env.NSJAIL_RUNNER_URL
        else process.env.NSJAIL_RUNNER_URL = previous.url
        if (previous.token === undefined) delete process.env.NSJAIL_RUNNER_TOKEN
        else process.env.NSJAIL_RUNNER_TOKEN = previous.token
    })

    it.each([
        ['document/node-20/v1', 'ANYDOC_ACTION_DIR', 'anydoc.convert', '1.0.3', 'native.pdf'],
        ['document/java-17/v1', 'OPENDATALOADER_ACTION_DIR', 'opendataloader.convert', '1.2.1', 'native.pdf'],
        ['document/java-17/v1', 'OPENDATALOADER_ACTION_DIR', 'opendataloader.convert', '1.2.1', 'scanned.pdf']
    ])(
        '%s converts %s / %s %s %s',
        async (profile, variable, action, version, fixture) => {
            const root = process.env[variable]
            const fixtures = process.env.NSJAIL_DOCUMENT_FIXTURE_DIR
            if (!root || !fixtures) throw new Error('Missing packed Action or fixture directory')
            const definitions = new SandboxRuntimeDefinitionRegistry()
            const definition = definitions.require(profile)
            const provider = new NsjailDocumentRuntimeProvider(definitions)
            const binding = provider.listBindings().find((binding) => binding.runtimeProfile === profile)
            if (!binding) throw new Error('Missing document binding')
            expect(await provider.getBindingHealth({ binding, definition })).toMatchObject({ available: true })
            const workFor = { type: 'job' as const, id: randomUUID() }
            const tenantId = 'nsjail-document-integration'
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
            try {
                const files: Array<[string, Uint8Array]> = [
                    ['/workspace/runtime/action-manifest.json', await readFile(path.join(root, 'action.json'))],
                    ['/workspace/input/source.bin', await readFile(path.join(fixtures, fixture))],
                    [
                        '/workspace/input/job.json',
                        Buffer.from(
                            JSON.stringify({
                                contractVersion: '1',
                                action,
                                actionVersion: version,
                                payload: { extension: 'pdf' }
                            })
                        )
                    ]
                ]
                for (const entry of await readdir(path.join(root, 'bundle'), { withFileTypes: true })) {
                    if (!entry.isFile()) throw new Error('Expected flat regular Action files')
                    files.push([
                        `/workspace/runtime/action/${entry.name}`,
                        await readFile(path.join(root, 'bundle', entry.name))
                    ])
                }
                const uploaded = await runtime.uploadFiles(files)
                expect(uploaded.every((file) => file.error === null)).toBe(true)
                const response = await runtime.execute(buildRunnerCommand(definition, runtime.workspaceRoot))
                if (response.exitCode !== 0) throw new Error(`Document Action failed: ${JSON.stringify(response)}`)
                expect(response).toMatchObject({ exitCode: 0, timedOut: false, truncated: false })
                const [output] = await runtime.downloadFiles(['/workspace/output/result.json'])
                expect(output.error).toBeNull()
                const result = JSON.parse(Buffer.from(output.content).toString())
                expect(result).toMatchObject({ ok: true, markdown: expect.stringContaining('12345') })
                if (action === 'opendataloader.convert') expect(result.pages).toHaveLength(1)
                if (fixture === 'scanned.pdf') {
                    expect(result.assets).toEqual(
                        expect.arrayContaining([expect.objectContaining({ name: 'result-ocr.json' })])
                    )
                }
            } finally {
                await provider.destroy({
                    tenantId,
                    workFor,
                    runtimeProfile: profile,
                    runtimeBindingId: binding.id,
                    artifact: binding.artifact,
                    runtimeRef: runtime.id
                })
            }
        },
        400_000
    )
})
