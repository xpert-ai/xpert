import { readFile } from 'node:fs/promises'
import { init } from 'i18next'
import { LocalBrowserRuntimeProvider } from './local-browser-runtime.provider'
import { SandboxRuntimeDefinitionRegistry } from './sandbox-runtime-definition.registry'
import { runLocalRuntimeProcess } from './local-runtime-process'

jest.mock('node:child_process', () => ({
    ...jest.requireActual('node:child_process'),
    execFile: Object.assign(jest.fn(), {
        [Symbol.for('nodejs.util.promisify.custom')]: async () => ({ stdout: 'v20.20.2\n', stderr: '' })
    })
}))

jest.mock('@xpert-ai/plugin-sdk', () => ({
    ...jest.requireActual('../../../../plugin-sdk/src/lib/sandbox/runtime-environment'),
    SandboxRuntimeProviderStrategy: () => () => undefined
}))
jest.mock('./local-document-dependencies', () => ({ localDocumentDependencyRoot: async () => '/managed/document' }))
jest.mock('./local-runtime-process', () => ({
    ...jest.requireActual('./local-runtime-process'),
    runLocalRuntimeProcess: jest.fn()
}))

const run = jest.mocked(runLocalRuntimeProcess)
const success = { output: '', exitCode: 0, signal: null, timedOut: false, truncated: false }
const registry = new SandboxRuntimeDefinitionRegistry()

beforeAll(async () => {
    await init({ lng: 'en', resources: {} })
})
beforeEach(() => {
    run.mockReset()
    run.mockImplementation(async (_command, args, options) => ({
        ...success,
        output: args.includes('--manifest')
            ? await readFile(options.env.XPERT_SANDBOX_RUNTIME_MANIFEST_PATH, 'utf8')
            : ''
    }))
})
afterEach(() => jest.restoreAllMocks())

function input(provider: LocalBrowserRuntimeProvider, name = 'document/java-17/v1') {
    const binding = provider.listBindings().find((candidate) => candidate.runtimeProfile === name)
    if (!binding) throw new Error(`Missing test binding: ${name}`)
    return { definition: registry.require(name), binding }
}

it('uses bounded document readiness and retains independent caches for different profiles', async () => {
    const provider = new LocalBrowserRuntimeProvider()
    const java = input(provider)
    const node = input(provider, 'document/node-20/v1')
    expect(await provider.getBindingHealth(java)).toMatchObject({ available: true })
    expect(await provider.getBindingHealth(node)).toMatchObject({ available: true })
    expect(await provider.getBindingHealth(java)).toMatchObject({ available: true })
    expect(run).toHaveBeenCalledTimes(4)
    expect(run).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['--readiness']),
        expect.objectContaining({ timeoutMs: 60000 })
    )
})

it('shares one probe for concurrent requests', async () => {
    const provider = new LocalBrowserRuntimeProvider()
    const request = input(provider)
    const results = await Promise.all(Array.from({ length: 4 }, () => provider.getBindingHealth(request)))
    expect(results.every((health) => health.available)).toBe(true)
    expect(run).toHaveBeenCalledTimes(2)
})

it('invalidates cached health when the expected manifest changes', async () => {
    const provider = new LocalBrowserRuntimeProvider()
    const request = input(provider)
    expect(await provider.getBindingHealth(request)).toMatchObject({ available: true })
    const changed = {
        ...request,
        definition: {
            ...request.definition,
            expectedManifest: { ...request.definition.expectedManifest, opendataloaderVersion: 'invalid-version' }
        }
    }
    expect(await provider.getBindingHealth(changed)).toMatchObject({ available: false })
    expect(run).toHaveBeenCalledTimes(3)
})

it('retains timeout diagnostics and retries after the shorter failure cache expires', async () => {
    const provider = new LocalBrowserRuntimeProvider()
    const request = input(provider)
    const normalRun = run.getMockImplementation()
    run.mockImplementation(async (command, args, options) =>
        args.includes('--manifest')
            ? normalRun(command, args, options)
            : { ...success, exitCode: null, timedOut: true, signal: 'SIGKILL' }
    )
    const failure = await provider.getBindingHealth(request)
    expect(failure).toMatchObject({ available: false, reason: expect.stringContaining('timed out after 60 seconds') })
    expect(failure.reason).not.toContain('not installed')
    await provider.getBindingHealth(request)
    expect(run).toHaveBeenCalledTimes(2)
    const now = Date.now()
    jest.spyOn(Date, 'now').mockReturnValue(now + 5001)
    await provider.getBindingHealth(request)
    expect(run).toHaveBeenCalledTimes(4)
})
