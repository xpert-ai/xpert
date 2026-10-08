import { ModelFeature } from '@xpert-ai/contracts'
import { AIMessage, ToolMessage } from '@langchain/core/messages'
import type {
    ArtifactRecord,
    ArtifactVersionRecord,
    CreateArtifactInput,
    EnsureArtifactVersionInput,
    RuntimeIdentityScope,
    WorkspaceRuntimeWriteInput,
    WorkspacePortableFileReference
} from '@xpert-ai/plugin-sdk'
import sharp from 'sharp'
import { createToolImagesApi } from './tool-images-runtime'

const initialScope = {
    tenantId: 'tenant',
    organizationId: 'org',
    userId: 'user',
    conversationId: 'conversation',
    projectId: 'project'
}
function fixture() {
    let scope: RuntimeIdentityScope = { ...initialScope }
    const stored = new Map<string, Buffer>()
    const records = new Map<string, ArtifactRecord>()
    const versions = new Map<string, ArtifactVersionRecord>()
    const artifacts = {
        createArtifact: jest.fn(async (input: CreateArtifactInput) => {
            const id = input.source.resourceId
            const value: ArtifactRecord = {
                ...input.scope,
                ...input.source,
                id,
                kind: 'image',
                status: 'active',
                metadata: input.metadata
            }
            records.set(id, value)
            return value
        }),
        ensureArtifactVersion: jest.fn(async (input: EnsureArtifactVersionInput) => {
            const version: ArtifactVersionRecord = {
                ...input,
                id: `${input.artifactId}:version`,
                versionNumber: 1,
                status: 'active'
            }
            versions.set(input.artifactId, version)
            return { version, outcome: 'created' as const }
        }),
        getArtifact: jest.fn(async (id: string) => records.get(id)!),
        listArtifactVersions: jest.fn(async ({ artifactId }: { artifactId: string }) => [versions.get(artifactId)!])
    }
    const createArtifacts = jest.fn(() => artifacts)
    const createFiles = jest.fn((bound: RuntimeIdentityScope) => ({
        writeRuntimeBuffer: jest.fn(async (input: WorkspaceRuntimeWriteInput) => {
            const path = `${input.folder}/${input.fileName}`
            stored.set(path, input.buffer)
            const reference: WorkspacePortableFileReference = {
                source: 'platform.workspace.files',
                catalog: 'projects',
                scopeId: 'project',
                projectId: 'project',
                tenantId: bound.tenantId,
                organizationId: bound.organizationId,
                userId: bound.userId,
                filePath: path,
                workspacePath: `/workspace/${path}`
            }
            return {
                name: input.fileName!,
                filePath: path,
                workspacePath: reference.workspacePath,
                catalog: 'projects' as const,
                reference
            }
        }),
        readRuntimeBuffer: jest.fn(async (input: string | WorkspacePortableFileReference) => {
            if (typeof input === 'string') throw new Error('Portable reference required')
            return {
                name: 'image.png',
                filePath: input.filePath,
                workspacePath: input.workspacePath!,
                catalog: 'projects' as const,
                reference: input,
                buffer: stored.get(input.filePath)!
            }
        })
    }))
    const deps = { resolveScope: () => scope, createArtifacts, createFiles }
    const api = createToolImagesApi(deps)
    const png = () =>
        sharp({ create: { width: 3, height: 2, channels: 3, background: '#abcdef' } })
            .png()
            .toBuffer()
    return {
        deps,
        api,
        png,
        artifacts,
        createArtifacts,
        createFiles,
        scope,
        changeScope: (value: RuntimeIdentityScope) => {
            scope = value
        }
    }
}

describe('scoped tool-images runtime API', () => {
    it('binds the current host identity and fixed platform source, ignoring additional caller identity fields', async () => {
        const f = fixture()
        const input = {
            buffer: await f.png(),
            mimeType: 'image/png' as const,
            title: '施工工艺',
            scope: { tenantId: 'foreign', conversationId: 'foreign' },
            pluginName: 'caller-selected'
        }
        const result = await f.api.save(input)
        expect(f.createArtifacts).toHaveBeenCalledWith(initialScope)
        expect(f.createFiles).toHaveBeenCalledWith(initialScope)
        expect(f.artifacts.createArtifact).toHaveBeenCalledWith(
            expect.objectContaining({
                scope: { tenantId: 'tenant', organizationId: 'org', userId: 'user' },
                source: expect.objectContaining({ pluginName: '@xpert-ai/platform', resourceType: 'tool-image' }),
                metadata: expect.objectContaining({ conversationId: 'conversation' })
            })
        )
        expect(result.attachments[0].source).toBe('tool')
        expect(JSON.stringify(result)).not.toMatch(/buffer|base64|workspacePath|data:image/)
    })

    it.each(['tenantId', 'organizationId', 'userId', 'conversationId'] as const)(
        'rejects missing %s before any persistence',
        async (key) => {
            const f = fixture()
            f.changeScope({ ...initialScope, [key]: undefined })
            await expect(f.api.save({ buffer: await f.png(), mimeType: 'image/png', title: 'image' })).rejects.toThrow()
            await expect(f.api.prepareModelInput([], ['image_tool'])).rejects.toThrow()
            expect(f.createFiles).not.toHaveBeenCalled()
            expect(f.createArtifacts).not.toHaveBeenCalled()
        }
    )

    it('resolves each invocation independently and rejects a reference from another conversation', async () => {
        const f = fixture(),
            input = { buffer: await f.png(), mimeType: 'image/png' as const, title: 'image' }
        const first = await f.api.save(input)
        f.changeScope({ ...initialScope, conversationId: 'child', executionId: 'child-execution' })
        const second = await f.api.save(input)
        expect(first.attachments[0].artifactId).not.toBe(second.attachments[0].artifactId)
        const round = (artifact: typeof first) => [
            new AIMessage({ content: '', tool_calls: [{ name: 'image_tool', id: 'call', args: {} }] }),
            new ToolMessage({ content: 'candidate', name: 'image_tool', tool_call_id: 'call', artifact })
        ]
        await expect(f.api.prepareModelInput(round(first), ['image_tool'])).rejects.toThrow()
        expect((await f.api.prepareModelInput(round(second), ['image_tool'])).requirements).toEqual({
            features: [ModelFeature.VISION]
        })
        f.changeScope({ ...initialScope, executionId: 'retry' })
        const resumed = createToolImagesApi(f.deps)
        expect((await resumed.prepareModelInput(round(first), ['image_tool'])).requirements).toEqual({
            features: [ModelFeature.VISION]
        })
        expect(JSON.stringify(round(first))).not.toContain('base64')
    })

    it('freezes per-call scope before parallel persistence yields', async () => {
        const f = fixture(),
            input = { buffer: await f.png(), mimeType: 'image/png' as const, title: 'image' }
        const first = f.api.save(input)
        f.changeScope({ ...initialScope, conversationId: 'parallel-child' })
        const second = f.api.save(input)
        const results = await Promise.all([first, second])
        expect(results[0].attachments[0].artifactId).not.toBe(results[1].attachments[0].artifactId)
        expect(f.createFiles.mock.calls.map(([value]) => value.conversationId)).toEqual([
            'conversation',
            'parallel-child'
        ])
    })
})
