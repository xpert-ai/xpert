import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages'
import type {
    ArtifactRecord,
    ArtifactVersionRecord,
    CreateArtifactInput,
    EnsureArtifactVersionInput,
    WorkspacePortableFileReference,
    WorkspaceRuntimeWriteInput
} from '@xpert-ai/plugin-sdk'
import { END, MemorySaver, MessagesAnnotation, START, StateGraph } from '@langchain/langgraph'
import sharp from 'sharp'
import { ToolImageArtifacts } from './tool-image-artifacts'

const scope = { tenantId: 'tenant', organizationId: 'org', userId: 'user', conversationId: 'conversation' }
const source = { pluginName: 'test.images', resourceType: 'image', presentationSource: 'sandbox' as const }
const toolName = 'test_screenshot'

function fixture() {
    let artifact: ArtifactRecord
    let version: ArtifactVersionRecord
    let buffer: Buffer
    const reference: WorkspacePortableFileReference = {
        source: 'platform.workspace.files',
        catalog: 'users',
        scopeId: 'user',
        ...scope,
        filePath: 'image.png',
        workspacePath: '/workspace/image.png'
    }
    const files = {
        writeRuntimeBuffer: jest.fn(async (input: WorkspaceRuntimeWriteInput) => {
            buffer = input.buffer
            const name = input.fileName ?? 'image.png'
            return { name, filePath: name, workspacePath: `/workspace/${name}`, catalog: 'users' as const, reference }
        }),
        readRuntimeBuffer: jest.fn(async () => ({
            name: 'image.png',
            filePath: 'image.png',
            workspacePath: '/workspace/image.png',
            catalog: 'users' as const,
            reference,
            buffer
        }))
    }
    const artifacts = {
        createArtifact: jest.fn(async (input: CreateArtifactInput) => {
            artifact = { id: 'artifact', kind: 'image', status: 'active', ...input.scope, ...input.source }
            return artifact
        }),
        ensureArtifactVersion: jest.fn(async (input: EnsureArtifactVersionInput) => {
            version = { ...input, id: 'version', versionNumber: 1, status: 'active' }
            return { version, outcome: 'created' as const }
        }),
        getArtifact: jest.fn(async () => artifact),
        listArtifactVersions: jest.fn(async () => [version])
    }
    const images = new ToolImageArtifacts(artifacts, files, scope, source)
    const save = async () => {
        const png = await sharp({ create: { width: 8, height: 6, channels: 3, background: '#336699' } })
            .png()
            .toBuffer()
        const presentation = await images.save({ buffer: png, mimeType: 'image/png', title: 'Screenshot' })
        const message = new ToolMessage({
            name: toolName,
            tool_call_id: 'call',
            content: 'Captured',
            artifact: presentation
        })
        const messages = [
            new AIMessage({ content: '', tool_calls: [{ name: toolName, id: 'call', args: {} }] }),
            message
        ]
        return { png, presentation, messages }
    }
    return {
        files,
        artifacts,
        images,
        save,
        setBuffer: (value: Buffer) => {
            buffer = value
        }
    }
}

describe('Tool image artifacts', () => {
    it('hydrates images from multiple action tools while allowing non-image results in the same family', async () => {
        const f = fixture()
        const { presentation } = await f.save()
        const messages = [
            new AIMessage({
                content: '',
                tool_calls: [
                    { name: 'desktop_action', id: 'action', args: {} },
                    { name: 'desktop_apps', id: 'apps', args: {} }
                ]
            }),
            new ToolMessage({
                name: 'desktop_action',
                tool_call_id: 'action',
                content: 'Observed',
                artifact: presentation
            }),
            new ToolMessage({ name: 'desktop_apps', tool_call_id: 'apps', content: 'Released' })
        ]
        const result = await f.images.messagesForModel(messages, ['desktop_action', 'desktop_apps'])
        expect(result).toHaveLength(4)
        expect(JSON.stringify(result[3].content)).toContain('data:image/png;base64,')
        expect(JSON.stringify(messages)).not.toContain('base64')
        expect(await f.images.messagesForModel(messages, ['unrelated_tool'])).toBe(messages)
    })
    it('stores one binary path for repeated content and returns reference-only presentation', async () => {
        const f = fixture()
        const first = await f.save()
        const second = await f.save()
        expect(first.presentation).toEqual(second.presentation)
        expect(first.presentation.attachments[0]).toMatchObject({
            type: 'image',
            artifactId: 'artifact',
            artifactVersionId: 'version',
            width: 8,
            height: 6
        })
        const writes = f.files.writeRuntimeBuffer.mock.calls
        expect(writes[0][0].fileName).toBe(writes[1][0].fileName)
        expect(writes[0][0].buffer).toBeInstanceOf(Buffer)
        expect(f.artifacts.createArtifact.mock.calls[0][0].scope).toEqual({
            tenantId: 'tenant',
            organizationId: 'org',
            userId: 'user'
        })
        expect(JSON.stringify(first.presentation)).not.toMatch(/data:|base64|workspacePath|buffer/i)
    })

    it('hydrates only model input without changing persisted messages, and supports retries and resumes', async () => {
        const f = fixture()
        const { messages } = await f.save()
        const serialized = JSON.stringify(messages)
        const forwarded = await f.images.messagesForModel(messages, toolName)
        expect(forwarded).toHaveLength(3)
        expect(forwarded[2]).toBeInstanceOf(HumanMessage)
        expect(JSON.stringify(forwarded[2].content)).toContain('data:image/png;base64,')
        expect(JSON.stringify(messages)).toBe(serialized)
        expect(serialized).not.toContain('base64')
        // A fresh facade recovers from immutable storage, not an in-memory batch.
        const resumed = new ToolImageArtifacts(f.artifacts, f.files, scope, source)
        expect((await resumed.messagesForModel(messages, toolName))[2].content).toEqual(forwarded[2].content)
        expect((await f.images.messagesForModel(messages, toolName))[2].content).toEqual(forwarded[2].content)
    })

    it('keeps image bytes out of graph checkpoints while the model receives them', async () => {
        const f = fixture()
        const { messages } = await f.save()
        const graph = new StateGraph(MessagesAnnotation)
            .addNode('inspect-image', async (state) => {
                const modelMessages = await f.images.messagesForModel(state.messages, toolName)
                expect(JSON.stringify(modelMessages.at(-1)?.content)).toContain('data:image/png;base64,')
                return { messages: [new AIMessage('Image inspected')] }
            })
            .addEdge(START, 'inspect-image')
            .addEdge('inspect-image', END)
            .compile({ checkpointer: new MemorySaver() })
        const config = { configurable: { thread_id: 'tool-image-checkpoint-test' } }
        await graph.invoke({ messages }, config)
        const state = await graph.getState(config)
        expect(JSON.stringify(state.values)).toContain('artifactVersionId')
        for await (const checkpoint of graph.getStateHistory(config)) {
            expect(JSON.stringify(checkpoint.values)).not.toMatch(/data:image|base64|iVBOR/)
        }
    })

    it.each(['tenantId', 'organizationId', 'userId', 'conversationId'] as const)(
        'rejects %s scope changes before reading bytes',
        async (key) => {
            const f = fixture()
            const { messages } = await f.save()
            const foreign = new ToolImageArtifacts(f.artifacts, f.files, { ...scope, [key]: 'other' }, source)
            await expect(foreign.messagesForModel(messages, toolName)).rejects.toThrow()
            expect(f.files.readRuntimeBuffer).not.toHaveBeenCalled()
        }
    )

    it('rejects forged versions, missing references, changed bytes and unavailable artifacts', async () => {
        const f = fixture()
        const { messages, presentation } = await f.save()
        presentation.attachments[0].artifactVersionId = 'different'
        await expect(f.images.messagesForModel(messages, toolName)).rejects.toThrow()
        expect(f.files.readRuntimeBuffer).not.toHaveBeenCalled()
        presentation.attachments[0].artifactVersionId = 'version'
        f.setBuffer(Buffer.from('changed'))
        await expect(f.images.messagesForModel(messages, toolName)).rejects.toThrow()
        f.artifacts.listArtifactVersions.mockResolvedValue([])
        await expect(f.images.messagesForModel(messages, toolName)).rejects.toThrow()
        f.artifacts.getArtifact.mockRejectedValue(new Error('Revoked'))
        await expect(f.images.messagesForModel(messages, toolName)).rejects.toThrow('Revoked')
    })

    it('does not replay historical images or hydrate incomplete or failed tool batches', async () => {
        const f = fixture()
        const { messages } = await f.save()
        const history = [...messages, new AIMessage('done'), new HumanMessage('Continue')]
        expect(await f.images.messagesForModel(history, toolName)).toBe(history)
        expect(await f.images.messagesForModel(messages.slice(0, 1), toolName)).toHaveLength(1)
        expect(await f.images.messagesForModel(messages, 'another_tool')).toBe(messages)
        const failed = [
            messages[0],
            new ToolMessage({ content: 'Failure', status: 'error', name: toolName, tool_call_id: 'call' })
        ]
        expect(await f.images.messagesForModel(failed, toolName)).toBe(failed)
        expect(f.files.readRuntimeBuffer).not.toHaveBeenCalled()
    })

    it('limits parallel images and rejects malformed presentation without echoing it', async () => {
        const f = fixture()
        const { presentation } = await f.save()
        const calls = Array.from({ length: 4 }, (_, index) => ({ name: toolName, id: `call-${index}`, args: {} }))
        const messages = [
            new AIMessage({ content: '', tool_calls: calls }),
            ...calls.map(
                (call) =>
                    new ToolMessage({
                        content: 'Captured',
                        name: toolName,
                        tool_call_id: call.id,
                        artifact: presentation
                    })
            )
        ]
        await expect(f.images.messagesForModel(messages, toolName)).rejects.toThrow()
        expect(f.files.readRuntimeBuffer).not.toHaveBeenCalled()
        const bad = new ToolMessage({
            content: 'Captured',
            name: toolName,
            tool_call_id: 'call',
            artifact: { type: 'xpert.tool-output', version: 1, attachments: [{ data: 'SECRET_DATA_URL' }] }
        })
        await expect(
            f.images.messagesForModel(
                [new AIMessage({ content: '', tool_calls: [{ name: toolName, id: 'call', args: {} }] }), bad],
                toolName
            )
        ).rejects.not.toThrow('SECRET_DATA_URL')
    })

    it('rejects invalid, oversized and MIME-mismatched image data before storing anything', async () => {
        const f = fixture()
        for (const buffer of [Buffer.from('invalid'), Buffer.alloc(6_000_001)]) {
            await expect(f.images.save({ buffer, mimeType: 'image/png', title: 'Bad' })).rejects.toThrow()
        }
        const jpeg = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#ffffff' } })
            .jpeg()
            .toBuffer()
        await expect(f.images.save({ buffer: jpeg, mimeType: 'image/png', title: 'Bad' })).rejects.toThrow()
        expect(f.files.writeRuntimeBuffer).not.toHaveBeenCalled()
    })
})
