jest.mock('../../shared/runtime/workspace-files-runtime-capability.service', () => ({
    WorkspaceFilesRuntimeCapabilityService: class {}
}))
import { FileActivityStorage } from './file-activity-storage.service'
import { ChatMessageEventTypeEnum, WorkflowNodeTypeEnum } from '@xpert-ai/contracts'
import { createHash } from 'node:crypto'
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import {
    ArtifactsApi,
    ArtifactsRuntimeCapability,
    DefaultRuntimeCapabilityRegistry,
    IAgentMiddlewareContext,
    SandboxBackendProtocol,
    WorkspaceFilesApi,
    WorkspaceFilesRuntimeCapability
} from '@xpert-ai/plugin-sdk'
import { observeFileChanges } from './file-activity'
import { presentFiles } from './present-files'
import { snapshotWorkspace } from './file-activity-snapshot'
import { isSupportedArtifactMimeType } from '../../artifacts/artifact-mime-policy'

jest.mock('@langchain/core/callbacks/dispatch', () => ({ dispatchCustomEvent: jest.fn().mockResolvedValue(undefined) }))
jest.mock('./file-activity-snapshot', () => ({
    ...jest.requireActual('./file-activity-snapshot'),
    snapshotWorkspace: jest.fn()
}))
const hash = (text: string) => createHash('sha256').update(text).digest('hex')
const snapshot = (text: string) => ({
    files: [{ path: 'outputs/final.json', sha256: hash(text), size: Buffer.byteLength(text), text }],
    complete: true,
    skipped: 0
})

describe('explicit file presentation and independent change observation', () => {
    const artifactApi = {
        createArtifact: jest.fn(),
        listArtifactVersions: jest.fn(),
        ensureArtifactVersion: jest.fn(),
        createArtifactLink: jest.fn()
    }
    const files = { uploadBuffer: jest.fn() }
    const storage = new FileActivityStorage(files)
    const context = {
        tenantId: 'tenant',
        organizationId: 'organization',
        userId: 'user',
        threadId: 'thread',
        node: { id: 'node', key: 'node', type: WorkflowNodeTypeEnum.MIDDLEWARE, provider: 'SandboxFile' },
        tools: new Map(),
        runtime: {
            createModelClient: async () => {
                throw new Error('unused')
            },
            wrapWorkflowNodeExecution: async () => {
                throw new Error('unused')
            },
            capabilities: new DefaultRuntimeCapabilityRegistry()
                .register(ArtifactsRuntimeCapability, artifactApi as Partial<ArtifactsApi> as ArtifactsApi)
                .register(WorkspaceFilesRuntimeCapability, {
                    uploadBuffer: () => {
                        throw new Error('Scoped workspace must not be widened')
                    }
                } as Partial<WorkspaceFilesApi> as WorkspaceFilesApi)
        }
    } as IAgentMiddlewareContext
    const backend = {
        workingDirectory: '/workspace',
        downloadFiles: jest.fn()
    } as Partial<SandboxBackendProtocol> as SandboxBackendProtocol
    beforeEach(() => {
        jest.clearAllMocks()
        jest.mocked(snapshotWorkspace).mockResolvedValue(snapshot('{"value":1}'))
        jest.mocked(backend.downloadFiles).mockResolvedValue([
            { path: '/workspace/outputs/final.json', content: Buffer.from('{"value":1}'), error: null }
        ])
        artifactApi.createArtifact.mockResolvedValue({ id: 'artifact' })
        artifactApi.listArtifactVersions.mockResolvedValue([])
        artifactApi.ensureArtifactVersion.mockResolvedValue({ version: { id: 'version-1' } })
        files.uploadBuffer.mockResolvedValue({
            filePath: 'private/snapshot.json',
            workspacePath: 'private/snapshot.json',
            catalog: 'users'
        })
    })
    it('registers outputs-directory JSON with pinned versions, private scope and no public link', async () => {
        await presentFiles(storage, context, backend, 'call', ['outputs/final.json'])
        expect(files.uploadBuffer).toHaveBeenCalledWith(
            expect.objectContaining({
                catalog: 'users',
                userId: 'user',
                scopeId: 'user',
                buffer: Buffer.from('{"value":1}')
            })
        )
        expect(artifactApi.createArtifactLink).not.toHaveBeenCalled()
        expect(dispatchCustomEvent).toHaveBeenCalledWith(
            ChatMessageEventTypeEnum.ON_CHAT_EVENT,
            expect.objectContaining({
                type: 'file_activity',
                data: expect.objectContaining({
                    outputs: [
                        expect.objectContaining({
                            origin: 'tool',
                            workspacePath: 'outputs/final.json',
                            resource: { type: 'artifact', artifactId: 'artifact', artifactVersionId: 'version-1' }
                        })
                    ]
                })
            })
        )
    })
    it('delivers a mixed batch while retaining display types and using safe archive types', async () => {
        const selected = [
            { path: 'table.tsv', content: 'a\tb\n1\t2', mimeType: 'text/tab-separated-values' },
            { path: 'drawing.svg', content: '<svg/>', mimeType: 'image/svg+xml' },
            { path: 'example.js', content: 'console.log(1)', mimeType: 'application/javascript' },
            { path: 'report.pdf', content: '%PDF-1.7\n%%EOF', mimeType: 'application/pdf' }
        ]
        for (const file of selected) {
            jest.mocked(snapshotWorkspace).mockResolvedValueOnce({
                files: [{ path: file.path, sha256: hash(file.content), size: Buffer.byteLength(file.content) }],
                complete: true,
                skipped: 0
            })
            jest.mocked(backend.downloadFiles).mockResolvedValueOnce([
                { path: `/workspace/${file.path}`, content: Buffer.from(file.content), error: null }
            ])
            artifactApi.ensureArtifactVersion.mockImplementationOnce(async (input) => {
                if (!isSupportedArtifactMimeType(input.mimeType)) throw new Error('Unsupported artifact MIME type')
                return { version: { id: file.path } }
            })
        }
        await expect(
            presentFiles(
                storage,
                context,
                backend,
                'mixed',
                selected.map((file) => file.path)
            )
        ).resolves.toMatchObject({
            status: 'success',
            files: selected.map((file) => expect.objectContaining({ path: file.path }))
        })
        expect(files.uploadBuffer.mock.calls.map(([input]) => input.mimeType)).toEqual([
            'application/octet-stream',
            'application/octet-stream',
            'application/octet-stream',
            'application/pdf'
        ])
        for (const [input] of artifactApi.ensureArtifactVersion.mock.calls) {
            expect(input.workspaceFileRef.mimeType).toBe(input.mimeType)
        }
        expect(dispatchCustomEvent).toHaveBeenCalledTimes(1)
        expect(dispatchCustomEvent).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                data: expect.objectContaining({
                    status: 'success',
                    outputs: selected.map((file) =>
                        expect.objectContaining({
                            workspacePath: file.path,
                            mimeType: file.mimeType
                        })
                    )
                })
            })
        )
    })
    it('does not register a file changed between validation and byte capture', async () => {
        jest.mocked(backend.downloadFiles).mockResolvedValue([
            { path: '/workspace/outputs/final.json', content: Buffer.from('different'), error: null }
        ])
        await expect(presentFiles(storage, context, backend, 'call', ['outputs/final.json'])).rejects.toThrow()
        expect(artifactApi.createArtifact).not.toHaveBeenCalled()
    })
    it('records real changes even when the producing command throws', async () => {
        jest.mocked(snapshotWorkspace)
            .mockResolvedValueOnce(snapshot('before'))
            .mockResolvedValueOnce(snapshot('after'))
        await expect(
            observeFileChanges(storage, context, backend, 'call', 'sandbox_shell', async () => {
                throw new Error('failed command')
            })
        ).rejects.toThrow('failed command')
        expect(artifactApi.ensureArtifactVersion).toHaveBeenCalled()
        expect(dispatchCustomEvent).toHaveBeenCalledWith(
            ChatMessageEventTypeEnum.ON_CHAT_EVENT,
            expect.objectContaining({
                type: 'file_activity',
                data: expect.objectContaining({
                    fileChanges: [
                        expect.objectContaining({
                            operation: 'modified',
                            before: { sha256: hash('before'), size: 6 },
                            after: { sha256: hash('after'), size: 5 }
                        })
                    ]
                })
            })
        )
    })
    it('records a no-op without creating a delivery or review artifact', async () => {
        await observeFileChanges(storage, context, backend, 'call', 'sandbox_write_file', async () => ({
            error: 'exists'
        }))
        expect(artifactApi.createArtifact).not.toHaveBeenCalled()
        expect(dispatchCustomEvent).toHaveBeenCalledWith(
            ChatMessageEventTypeEnum.ON_CHAT_EVENT,
            expect.objectContaining({
                type: 'file_activity',
                data: expect.objectContaining({ kind: 'changes', fileChanges: [] })
            })
        )
    })
    const empty = { files: [], complete: true, skipped: 0 }
    it('records a successful write as changes without delivering any file', async () => {
        jest.mocked(snapshotWorkspace).mockResolvedValueOnce(empty).mockResolvedValue(snapshot('{"value":1}'))
        await observeFileChanges(
            storage,
            context,
            backend,
            'call',
            'sandbox_write_file',
            async () => ({ error: null }),
            'outputs/final.json'
        )
        const facts = jest.mocked(dispatchCustomEvent).mock.calls.map((call) => call[1])
        expect(facts).toEqual([
            expect.objectContaining({
                type: 'file_activity',
                data: expect.objectContaining({
                    kind: 'changes',
                    fileChanges: [expect.objectContaining({ operation: 'added' })]
                })
            })
        ])
    })
    it.each([{ exitCode: 1 }, { exitCode: 0, timedOut: true }])(
        'keeps failed command changes without publishing: %j',
        async (result) => {
            jest.mocked(snapshotWorkspace).mockResolvedValueOnce(empty).mockResolvedValue(snapshot('{"value":1}'))
            await observeFileChanges(storage, context, backend, 'call', 'sandbox_shell', async () => result)
            expect(backend.downloadFiles).not.toHaveBeenCalled()
            expect(dispatchCustomEvent).toHaveBeenCalledTimes(1)
            expect(dispatchCustomEvent).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({ data: expect.objectContaining({ kind: 'changes' }) })
            )
        }
    )
    it('does not publish reads, unchanged bytes, or deleted files', async () => {
        await observeFileChanges(storage, context, backend, 'call', 'sandbox_shell', async () => 'read')
        expect(backend.downloadFiles).not.toHaveBeenCalled()
        jest.mocked(snapshotWorkspace).mockResolvedValueOnce(snapshot('{"value":1}')).mockResolvedValueOnce(empty)
        await observeFileChanges(storage, context, backend, 'remove', 'sandbox_shell', async () => 'deleted')
        expect(backend.downloadFiles).not.toHaveBeenCalled()
    })
    it('does not turn an incomplete scan into proof of a newly generated output', async () => {
        jest.mocked(snapshotWorkspace)
            .mockResolvedValueOnce({ ...empty, complete: false })
            .mockResolvedValue(snapshot('{"value":1}'))
        await observeFileChanges(storage, context, backend, 'call', 'sandbox_shell', async () => 'ok')
        expect(backend.downloadFiles).not.toHaveBeenCalled()
    })
    it('does not report deletions when directory traversal fails after the command', async () => {
        jest.mocked(snapshotWorkspace)
            .mockResolvedValueOnce(snapshot('still here'))
            .mockResolvedValueOnce({ files: [], complete: false, skipped: 1 })
        await observeFileChanges(storage, context, backend, 'call', 'sandbox_shell', async () => 'ok')
        expect(files.uploadBuffer).not.toHaveBeenCalled()
        expect(dispatchCustomEvent).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                data: expect.objectContaining({ kind: 'changes', coverage: 'partial', fileChanges: [] })
            })
        )
    })
    it('keeps working JSON and QA PDF as changes, not outputs', async () => {
        const after = {
            ...snapshot('{"value":1}'),
            files: [
                { ...snapshot('{"value":1}').files[0], path: 'spec.json' },
                { path: 'previews/report.pdf', sha256: hash('pdf'), size: 3 }
            ]
        }
        jest.mocked(snapshotWorkspace).mockResolvedValueOnce(empty).mockResolvedValueOnce(after)
        await observeFileChanges(storage, context, backend, 'call', 'sandbox_shell', async () => 'ok')
        expect(backend.downloadFiles).not.toHaveBeenCalled()
        expect(dispatchCustomEvent).toHaveBeenCalledTimes(1)
    })
    it('does not publish a partial JSON append', async () => {
        jest.mocked(snapshotWorkspace).mockResolvedValueOnce(empty).mockResolvedValue(snapshot('{'))
        jest.mocked(backend.downloadFiles).mockResolvedValue([
            { path: '/workspace/outputs/final.json', content: Buffer.from('{'), error: null }
        ])
        await observeFileChanges(storage, context, backend, 'call', 'sandbox_append_file', async () => 'ok')
        expect(files.uploadBuffer).toHaveBeenCalledTimes(1) // Only the change report.
        expect(dispatchCustomEvent).toHaveBeenCalledTimes(1)
    })
    it('emits an error fact and rejects if explicit presentation archival fails', async () => {
        files.uploadBuffer.mockRejectedValueOnce(new Error('Storage unavailable'))
        await expect(presentFiles(storage, context, backend, 'call', ['outputs/final.json'])).rejects.toThrow()
        expect(dispatchCustomEvent).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ data: expect.objectContaining({ kind: 'delivery', status: 'error' }) })
        )
    })

    it('deduplicates normalized paths and reuses a version when presenting unchanged bytes again', async () => {
        await presentFiles(storage, context, backend, 'first', ['./outputs/final.json', 'outputs/final.json'])
        expect(files.uploadBuffer).toHaveBeenCalledTimes(1)
        artifactApi.listArtifactVersions.mockResolvedValue([{ id: 'version-1' }])
        await presentFiles(storage, context, backend, 'second', ['outputs/final.json'])
        expect(files.uploadBuffer).toHaveBeenCalledTimes(1)
        expect(artifactApi.ensureArtifactVersion).toHaveBeenCalledTimes(1)
        expect(dispatchCustomEvent).toHaveBeenLastCalledWith(
            expect.any(String),
            expect.objectContaining({
                id: 'second:delivery',
                data: expect.objectContaining({
                    kind: 'delivery',
                    status: 'success',
                    outputs: [
                        expect.objectContaining({
                            resource: expect.objectContaining({ artifactVersionId: 'version-1' })
                        })
                    ]
                })
            })
        )
    })
    it('presents arbitrary existing files outside outputs without modifying them', async () => {
        jest.mocked(snapshotWorkspace).mockResolvedValue({
            ...snapshot('print(1)'),
            files: [{ ...snapshot('print(1)').files[0], path: 'scripts/example.py' }]
        })
        jest.mocked(backend.downloadFiles).mockResolvedValue([
            { path: '/workspace/scripts/example.py', content: Buffer.from('print(1)'), error: null }
        ])
        const result = await presentFiles(storage, context, backend, 'call', ['scripts/example.py'])
        expect(result).toEqual({
            status: 'success',
            files: [{ path: 'scripts/example.py', name: 'example.py', size: 8 }]
        })
        expect(dispatchCustomEvent).toHaveBeenCalledTimes(1)
        expect(dispatchCustomEvent).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ data: expect.objectContaining({ kind: 'delivery' }) })
        )
    })
    it('validates the entire batch before archiving when a later file is missing', async () => {
        jest.mocked(snapshotWorkspace).mockResolvedValueOnce(snapshot('{"value":1}')).mockResolvedValueOnce(empty)
        await expect(
            presentFiles(storage, context, backend, 'call', ['outputs/final.json', 'missing.docx'])
        ).rejects.toThrow()
        expect(files.uploadBuffer).not.toHaveBeenCalled()
        expect(dispatchCustomEvent).toHaveBeenCalledTimes(1)
        expect(dispatchCustomEvent).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ data: expect.objectContaining({ status: 'error' }) })
        )
    })
    it.each(['../private.json', '/workspace/file.json', '.xpert/internal.json', 'a\\b.json'])(
        'rejects unsafe path %s before access',
        async (path) => {
            await expect(presentFiles(storage, context, backend, 'call', [path])).rejects.toThrow()
            expect(snapshotWorkspace).not.toHaveBeenCalled()
            expect(backend.downloadFiles).not.toHaveBeenCalled()
        }
    )
    it.each([
        { files: [], complete: false, skipped: 1 },
        { files: [], complete: true, skipped: 0 },
        { ...snapshot(''), complete: true },
        { ...snapshot('large'), files: [{ ...snapshot('large').files[0], size: 25 * 1024 * 1024 + 1 }] }
    ])('rejects unavailable, symlink, empty and oversized selections: %j', async (state) => {
        jest.mocked(snapshotWorkspace).mockResolvedValue(state)
        await expect(presentFiles(storage, context, backend, 'call', ['outputs/final.json'])).rejects.toThrow()
        expect(files.uploadBuffer).not.toHaveBeenCalled()
        expect(backend.downloadFiles).not.toHaveBeenCalled()
    })
    it('rejects malformed file content instead of silently dropping it from the selection', async () => {
        jest.mocked(snapshotWorkspace).mockResolvedValue(snapshot('{'))
        jest.mocked(backend.downloadFiles).mockResolvedValue([
            { path: '/workspace/outputs/final.json', content: Buffer.from('{'), error: null }
        ])
        await expect(presentFiles(storage, context, backend, 'call', ['outputs/final.json'])).rejects.toThrow()
        expect(files.uploadBuffer).not.toHaveBeenCalled()
    })
    it('does not emit success cards when a later archive fails; the retry reuses saved versions', async () => {
        const first = snapshot('{"value":1}').files[0]
        jest.mocked(snapshotWorkspace).mockImplementation(async (_backend, path) => ({
            files: [{ ...first, path: path! }],
            complete: true,
            skipped: 0
        }))
        files.uploadBuffer
            .mockResolvedValueOnce({ filePath: 'private/first.json', workspacePath: 'private/first.json' })
            .mockRejectedValueOnce(new Error('storage detail'))
        await expect(presentFiles(storage, context, backend, 'call', ['a.json', 'b.json'])).rejects.toThrow()
        expect(dispatchCustomEvent).toHaveBeenCalledTimes(1)
        expect(dispatchCustomEvent).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ data: expect.objectContaining({ status: 'error' }) })
        )
        expect(JSON.stringify(jest.mocked(dispatchCustomEvent).mock.calls)).not.toContain('storage detail')
        artifactApi.listArtifactVersions.mockResolvedValueOnce([{ id: 'version-1' }]).mockResolvedValueOnce([])
        files.uploadBuffer.mockResolvedValue({ filePath: 'private/second.json', workspacePath: 'private/second.json' })
        await presentFiles(storage, context, backend, 'retry', ['a.json', 'b.json'])
        expect(files.uploadBuffer).toHaveBeenCalledTimes(3)
        expect(dispatchCustomEvent).toHaveBeenLastCalledWith(
            expect.any(String),
            expect.objectContaining({
                data: expect.objectContaining({
                    status: 'success',
                    outputs: expect.arrayContaining([
                        expect.objectContaining({ workspacePath: 'a.json' }),
                        expect.objectContaining({ workspacePath: 'b.json' })
                    ])
                })
            })
        )
    })
    it('pins changed content to a new version without changing an earlier delivery receipt', async () => {
        await presentFiles(storage, context, backend, 'first', ['outputs/final.json'])
        const earlier = jest.mocked(dispatchCustomEvent).mock.calls[0][1]
        jest.mocked(snapshotWorkspace).mockResolvedValue(snapshot('{"value":2}'))
        jest.mocked(backend.downloadFiles).mockResolvedValue([
            { path: '/workspace/outputs/final.json', content: Buffer.from('{"value":2}'), error: null }
        ])
        artifactApi.ensureArtifactVersion.mockResolvedValue({ version: { id: 'version-2' } })
        await presentFiles(storage, context, backend, 'next', ['outputs/final.json'])
        expect(earlier).toMatchObject({ data: { outputs: [{ resource: { artifactVersionId: 'version-1' } }] } })
        expect(jest.mocked(dispatchCustomEvent).mock.calls[1][1]).toMatchObject({
            data: { outputs: [{ resource: { artifactVersionId: 'version-2' } }] }
        })
    })

    it.each([{ paths: [] }, { paths: Array(21).fill('outputs/final.json') }])(
        'bounds the selected file count',
        async ({ paths }) => {
            await expect(presentFiles(storage, context, backend, 'call', paths)).rejects.toThrow()
            expect(snapshotWorkspace).not.toHaveBeenCalled()
        }
    )
    it('bounds total captured bytes before storing any versions', async () => {
        const bytes = Buffer.alloc(24 * 1024 * 1024, 1)
        jest.mocked(snapshotWorkspace).mockImplementation(async (_backend, path) => ({
            files: [{ path: path!, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }],
            complete: true,
            skipped: 0
        }))
        jest.mocked(backend.downloadFiles).mockResolvedValue([
            { path: '/workspace/data.bin', content: bytes, error: null }
        ])
        await expect(presentFiles(storage, context, backend, 'call', ['a.bin', 'b.bin', 'c.bin'])).rejects.toThrow()
        expect(backend.downloadFiles).toHaveBeenCalledTimes(2)
        expect(files.uploadBuffer).not.toHaveBeenCalled()
    })
    it('requires the trusted conversation context for artifact identity', async () => {
        await expect(
            presentFiles(storage, { ...context, threadId: undefined, conversationId: undefined }, backend, 'call', [
                'outputs/final.json'
            ])
        ).rejects.toThrow()
        expect(snapshotWorkspace).not.toHaveBeenCalled()
    })
})
