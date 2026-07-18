import { mkdtemp, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { SandboxRuntimeCreateOptions } from '@xpert-ai/plugin-sdk'
import { LOCAL_BROWSER_RUNTIME_PROVIDER, LocalBrowserRuntimeProvider } from './local-browser-runtime.provider'
import { SandboxRuntimeDefinitionRegistry } from './sandbox-runtime-definition.registry'

describe('LocalBrowserRuntimeProvider', () => {
    const originalNodeEnv = process.env.NODE_ENV
    const roots: string[] = []

    beforeEach(() => {
        process.env.NODE_ENV = 'test'
    })

    afterEach(async () => {
        process.env.NODE_ENV = originalNodeEnv
        await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
    })

    it('publishes only a low-priority development Binding with honest process capabilities', () => {
        const provider = new LocalBrowserRuntimeProvider()

        expect(provider.type).toBe(LOCAL_BROWSER_RUNTIME_PROVIDER)
        expect(provider.capabilities).toEqual({
            isolation: 'process',
            ephemeral: true,
            resourceLimits: false,
            networkPolicy: false,
            readOnlyRootFilesystem: false,
            readOnlyFileMounts: true
        })
        expect(provider.listBindings()).toEqual([
            expect.objectContaining({
                provider: LOCAL_BROWSER_RUNTIME_PROVIDER,
                priority: 10_000,
                developmentOnly: true,
                artifact: expect.objectContaining({ kind: 'filesystem' })
            })
        ])
    })

    it('is fail-closed in production even if the class is instantiated directly', async () => {
        const provider = new LocalBrowserRuntimeProvider()
        const options = await createOptions(provider)
        process.env.NODE_ENV = 'production'

        expect(provider.listBindings()).toEqual([])
        await expect(
            provider.getBindingHealth({ definition: options.definition, binding: options.binding })
        ).resolves.toMatchObject({
            available: false
        })
        await expect(provider.create(options)).rejects.toThrow('forbidden outside development/test')
    })

    it('confines local file operations to the Job workspace and rejects arbitrary commands', async () => {
        const provider = new LocalBrowserRuntimeProvider()
        const options = await createOptions(provider)
        const runtime = await provider.create(options)

        await expect(runtime.uploadFiles([['input/example.txt', Buffer.from('safe')]])).resolves.toEqual([
            { path: 'input/example.txt', error: null }
        ])
        await expect(runtime.downloadFiles(['input/example.txt'])).resolves.toEqual([
            { path: 'input/example.txt', content: Buffer.from('safe'), error: null }
        ])
        await expect(runtime.uploadFiles([['../outside.txt', Buffer.from('unsafe')]])).resolves.toEqual([
            { path: '../outside.txt', error: 'invalid_path' }
        ])

        const outside = await temporaryRoot()
        await symlink(outside, path.join(runtime.workspaceRoot, 'linked'))
        await expect(runtime.uploadFiles([['linked/escape.txt', Buffer.from('unsafe')]])).resolves.toEqual([
            { path: 'linked/escape.txt', error: 'invalid_path' }
        ])
        await expect(runtime.execute(['node', 'arbitrary-script.mjs'])).rejects.toThrow('untrusted Runner command')

        await provider.destroy({
            tenantId: options.tenantId,
            workFor: options.workFor,
            runtimeProfile: options.definition.name,
            runtimeBindingId: options.binding.id,
            artifact: options.binding.artifact,
            runtimeRef: runtime.id
        })
    })

    it('exposes an authorized Workspace file as a read-only copy-on-write seekable Job input', async () => {
        const provider = new LocalBrowserRuntimeProvider()
        const sourceRoot = await temporaryRoot()
        const sourcePath = path.join(sourceRoot, 'source.mov')
        await writeFile(sourcePath, Buffer.from('seekable-media'))
        const source = await stat(sourcePath)
        const options = await createOptions(provider)
        options.readOnlyFiles = [
            {
                source: {
                    serverPath: sourcePath,
                    hostPath: sourcePath,
                    size: source.size,
                    mtimeMs: source.mtimeMs,
                    device: source.dev,
                    inode: source.ino
                },
                targetPath: 'input/media/asset/source.mov',
                size: source.size,
                sha256: 'a'.repeat(64)
            }
        ]

        const runtime = await provider.create(options)
        const targetPath = path.join(runtime.workspaceRoot, 'input/media/asset/source.mov')
        const target = await stat(targetPath)

        expect(target.dev).toBe(source.dev)
        expect(target.ino).not.toBe(source.ino)
        expect(target.mode & 0o222).toBe(0)
        await expect(runtime.downloadFiles(['input/media/asset/source.mov'])).resolves.toEqual([
            { path: 'input/media/asset/source.mov', content: Buffer.from('seekable-media'), error: null }
        ])
    })

    it('executes the fixed Runner Host against a materialized Action', async () => {
        const provider = new LocalBrowserRuntimeProvider()
        const options = await createOptions(provider)
        const runtime = await provider.create(options)
        const actionSource = `
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
const outputIndex = process.argv.indexOf('--output')
const output = process.argv[outputIndex + 1]
process.stdout.write('XPERT_SANDBOX_PROGRESS {"progress":0.5,"stage":"rendering"}\\n')
await mkdir(output, { recursive: true })
await writeFile(path.join(output, 'result.txt'), 'runner-ok')
`
        await expect(
            runtime.uploadFiles([
                [
                    path.join(runtime.workspaceRoot, 'runtime', 'action-manifest.json'),
                    Buffer.from(
                        JSON.stringify({
                            name: 'test.action',
                            version: '1.0.0',
                            runtimeContractVersion: '1',
                            entrypoint: 'runner.mjs'
                        })
                    )
                ],
                [path.join(runtime.workspaceRoot, 'runtime', 'action', 'runner.mjs'), Buffer.from(actionSource)],
                [path.join(runtime.workspaceRoot, 'input', 'job.json'), Buffer.from('{}')]
            ])
        ).resolves.toEqual([
            expect.objectContaining({ error: null }),
            expect.objectContaining({ error: null }),
            expect.objectContaining({ error: null })
        ])

        const streamed: string[] = []
        await expect(
            runtime.execute(
                [
                    ...options.definition.command,
                    '--request',
                    path.join(runtime.workspaceRoot, 'input', 'job.json'),
                    '--output',
                    path.join(runtime.workspaceRoot, 'output'),
                    '--action-root',
                    path.join(runtime.workspaceRoot, 'runtime', 'action'),
                    '--action-manifest',
                    path.join(runtime.workspaceRoot, 'runtime', 'action-manifest.json')
                ],
                { timeoutMs: 10_000, onOutput: (output) => streamed.push(output.text) }
            )
        ).resolves.toMatchObject({ exitCode: 0 })
        expect(streamed.join('')).toContain('XPERT_SANDBOX_PROGRESS {"progress":0.5,"stage":"rendering"}')
        await expect(runtime.downloadFiles(['output/result.txt'])).resolves.toEqual([
            { path: 'output/result.txt', content: Buffer.from('runner-ok'), error: null }
        ])

        await provider.destroy({
            tenantId: options.tenantId,
            workFor: options.workFor,
            runtimeProfile: options.definition.name,
            runtimeBindingId: options.binding.id,
            artifact: options.binding.artifact,
            runtimeRef: runtime.id
        })
    })

    async function createOptions(provider: LocalBrowserRuntimeProvider): Promise<SandboxRuntimeCreateOptions> {
        const definition = new SandboxRuntimeDefinitionRegistry().require('browser/playwright-1.61/v1')
        const binding = provider.listBindings()[0]
        if (!binding) throw new Error('Local Browser Runtime Binding was not registered in test mode.')
        const root = await temporaryRoot()
        return {
            tenantId: 'tenant-1',
            workFor: { type: 'job', id: 'job-1' },
            definition,
            binding,
            volume: { serverRoot: root, hostRoot: root },
            ephemeral: true,
            resources: definition.resources,
            networkPolicy: definition.networkPolicy,
            security: definition.security,
            hardDeadlineMs: definition.hardDeadlineMs
        }
    }

    async function temporaryRoot(): Promise<string> {
        const root = await mkdtemp(path.join(tmpdir(), 'xpert-local-browser-runtime-'))
        roots.push(root)
        return root
    }
})
