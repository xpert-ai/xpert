import { ModelFeature } from '@xpert-ai/contracts'
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
import i18next from 'i18next'
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
            artifact = {
                id: 'artifact',
                kind: 'image',
                status: 'active',
                ...input.scope,
                ...input.source,
                metadata: input.metadata
            }
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
    beforeAll(async () => {
        await i18next.init({ lng: 'en', resources: {} })
    })
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
        const result = await f.images.messagesForModel(messages, ['desktop_action'])
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
        expect(await f.images.messagesForModel(history, toolName)).toEqual(history)
        expect(await f.images.messagesForModel(messages.slice(0, 1), toolName)).toHaveLength(1)
        expect(await f.images.messagesForModel(messages, 'another_tool')).toBe(messages)
        const failed = [
            messages[0],
            new ToolMessage({ content: 'Failure', status: 'error', name: toolName, tool_call_id: 'call' })
        ]
        expect((await f.images.prepareModelInput(failed, [toolName])).requirements).toBeUndefined()
        expect((await f.images.messagesForModel(failed, toolName))[1].content).toBe('Failure')
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

    it('projects two parallel image replies with exact call IDs and summaries and requires vision', async () => {
        const f = fixture(),
            { presentation } = await f.save()
        const messages = [
            new AIMessage({
                content: '',
                tool_calls: [
                    { name: toolName, id: 'call-a', args: {} },
                    { name: toolName, id: 'call-b', args: {} }
                ]
            }),
            ...['b', 'a'].map(
                (id) =>
                    new ToolMessage({
                        name: toolName,
                        tool_call_id: `call-${id}`,
                        content: `candidate-${id}`,
                        artifact: presentation
                    })
            )
        ]
        const input = await f.images.prepareModelInput(messages, [toolName])
        expect(input.requirements).toEqual({ features: [ModelFeature.VISION] })
        const content = JSON.stringify(input.messages.at(-1)?.content)
        expect(content).toContain('call-a')
        expect(content).toContain('candidate-a')
        expect(content).toContain('call-b')
        expect(content).toContain('candidate-b')
        expect(content.match(/data:image\/png;base64,/g)).toHaveLength(2)
        expect(JSON.stringify(messages)).not.toContain('base64')
    })

    it.each([
        'missing artifact',
        'legacy structured bytes',
        'legacy serialized bytes',
        'wrong reply name',
        'duplicate call ID',
        'extra reply',
        'missing parallel reply'
    ])('rejects a current image round with %s before reading pixels', async (variant) => {
        const f = fixture(),
            { presentation } = await f.save()
        const calls = [{ name: toolName, id: 'call', args: {} }]
        const legacy = [
            { type: 'text', text: 'candidate' },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,SECRET' } }
        ]
        const replies = [
            new ToolMessage({
                name: variant === 'wrong reply name' ? 'other' : toolName,
                tool_call_id: 'call',
                content:
                    variant === 'legacy structured bytes'
                        ? legacy
                        : variant === 'legacy serialized bytes'
                          ? JSON.stringify(legacy)
                          : 'candidate',
                artifact: variant === 'missing artifact' ? undefined : presentation
            })
        ]
        if (variant === 'duplicate call ID') calls.push(calls[0])
        if (variant === 'extra reply')
            replies.push(
                new ToolMessage({ name: toolName, tool_call_id: 'other', content: 'extra', artifact: presentation })
            )
        if (variant === 'missing parallel reply') calls.push({ name: 'another_tool', id: 'missing', args: {} })
        await expect(
            f.images.prepareModelInput([new AIMessage({ content: '', tool_calls: calls }), ...replies], [toolName])
        ).rejects.toThrow()
        expect(f.files.readRuntimeBuffer).not.toHaveBeenCalled()
    })

    it.each(['structured', 'serialized'] as const)(
        'cleans historical %s legacy image bytes only in outbound clones',
        async (variant) => {
            const f = fixture()
            const legacy = [
                { type: 'text', text: 'previous candidate' },
                { type: 'image_url', image_url: { url: 'data:image/png;base64,SECRET' } }
            ]
            const tool = new ToolMessage({
                id: 'message-id',
                name: toolName,
                tool_call_id: 'old-call',
                content: variant === 'structured' ? legacy : JSON.stringify(legacy),
                artifact: { data: 'BASE64_ARTIFACT' }
            })
            const messages = [
                new AIMessage({ content: '', tool_calls: [{ name: toolName, id: 'old-call', args: {} }] }),
                tool,
                new AIMessage('done'),
                new HumanMessage('continue')
            ]
            const original = JSON.stringify(messages)
            const result = await f.images.prepareModelInput(messages, [toolName])
            expect(result.requirements).toBeUndefined()
            expect(JSON.stringify(result.messages)).not.toMatch(/SECRET|data:image|BASE64_ARTIFACT/)
            expect(result.messages[1]).toMatchObject({ id: 'message-id', tool_call_id: 'old-call', name: toolName })
            expect(JSON.stringify(messages)).toBe(original)
            expect(f.files.readRuntimeBuffer).not.toHaveBeenCalled()
        }
    )

    it('does not hydrate error replies even when they contain an artifact', async () => {
        const f = fixture(),
            { messages, presentation } = await f.save()
        const failed = [
            messages[0],
            new ToolMessage({
                name: toolName,
                tool_call_id: 'call',
                status: 'error',
                content: 'The asset was removed. Select another candidate.',
                artifact: presentation
            })
        ]
        const input = await f.images.prepareModelInput(failed, [toolName])
        expect(input.messages[1].content).toContain('Select another candidate')
        expect(input.requirements).toBeUndefined()
        expect(f.files.readRuntimeBuffer).not.toHaveBeenCalled()
    })

    it('rejects forged dimensions and uses real checksum verification even when the size matches', async () => {
        const f = fixture(),
            { messages, presentation } = await f.save()
        presentation.attachments[0].width += 1
        await expect(f.images.prepareModelInput(messages, [toolName])).rejects.toThrow()
        expect(f.files.readRuntimeBuffer).not.toHaveBeenCalled()
        presentation.attachments[0].width -= 1
        const original = (await f.files.readRuntimeBuffer()).buffer
        f.setBuffer(Buffer.alloc(original.length))
        await expect(f.images.prepareModelInput(messages, [toolName])).rejects.toThrow()
    })
})
