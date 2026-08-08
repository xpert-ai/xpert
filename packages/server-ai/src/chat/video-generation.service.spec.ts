import { BadRequestException } from '@nestjs/common'
import { RequestContext, type VideoGenerationToolsetCapability } from '@xpert-ai/plugin-sdk'
import { SecretTokenBindingType, XpertToolsetCategoryEnum } from '@xpert-ai/contracts'
import { createBuiltinToolset } from '../xpert-toolset'
import { VideoGenerationService } from './video-generation.service'

jest.mock('../xpert-toolset', () => ({
    ...jest.requireActual('../xpert-toolset'),
    createBuiltinToolset: jest.fn()
}))

describe('VideoGenerationService', () => {
    afterEach(() => {
        jest.restoreAllMocks()
        jest.clearAllMocks()
    })

    it('discovers only compatible enabled generators in the Xpert workspace', async () => {
        const harness = createHarness()
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ id: 'user-1' } as never)
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue(null)

        const result = await harness.service.listGenerators({ xpertId: 'xpert-1' })

        expect(harness.toolsets.getAllByWorkspaceForRuntime).toHaveBeenCalledWith(
            'workspace-1',
            expect.objectContaining({ take: 100, where: {}, withDeleted: false }),
            false,
            expect.objectContaining({ id: 'user-1' })
        )
        expect(result.generators.map((item) => item.id)).toEqual(['seedance-linked', 'veo-workspace'])
        expect(result.generators[0]).toMatchObject({
            family: 'seedance',
            linkedToXpert: true,
            supportsCancel: false,
            modes: expect.arrayContaining([
                'text_to_video',
                'image_to_video',
                'first_last_frame_to_video',
                'reference_to_video'
            ])
        })
        expect(result.generators[0]).not.toHaveProperty('tools')
        expect(result.generators[0]).not.toHaveProperty('credentials')
    })

    it('limits a public session to compatible generators already linked to the Xpert', async () => {
        const harness = createHarness()
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ id: 'public-user' } as never)
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue({
            clientSecretBindingType: SecretTokenBindingType.PUBLIC_XPERT
        } as never)

        const result = await harness.service.listGenerators({ xpertId: 'xpert-1' })

        expect(result.generators.map((item) => item.id)).toEqual(['seedance-linked'])
    })

    it('rejects unsupported generation options before invoking a provider tool', async () => {
        const harness = createHarness()
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ id: 'user-1' } as never)
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue(null)

        await expect(
            harness.service.submit({
                xpertId: 'xpert-1',
                toolsetId: 'seedance-linked',
                prompt: 'Generate a clip',
                model: 'unknown-model',
                resolution: '720p',
                aspectRatio: '9:16',
                durationSeconds: 8,
                generateAudio: true
            })
        ).rejects.toEqual(new BadRequestException('video_generation_model_not_supported'))
    })

    it('reports local-only cancellation when the generator has no cancel action', async () => {
        const harness = createHarness()
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ id: 'user-1' } as never)
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue(null)

        await expect(
            harness.service.cancel({
                xpertId: 'xpert-1',
                toolsetId: 'seedance-linked',
                providerTaskId: 'provider-task-1'
            })
        ).resolves.toEqual({
            providerTaskId: 'provider-task-1',
            supported: false,
            cancelled: false,
            status: 'tracking_stopped'
        })
    })

    it('maps standard boolean options to the Seedance tool input protocol', async () => {
        const harness = createHarness()
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ id: 'user-1' } as never)
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue(null)
        const invoke = jest
            .fn()
            .mockResolvedValueOnce({
                content: 'submitted',
                artifact: { data: { task_id: 'provider-task-1', status: 'queued' } }
            })
            .mockResolvedValueOnce({
                content: 'generating',
                artifact: { data: { task_id: 'provider-task-1', status: 'running' } }
            })
        jest.mocked(createBuiltinToolset).mockResolvedValue({
            initTools: jest.fn(),
            getTool: jest.fn(() => ({ invoke })),
            close: jest.fn()
        } as never)

        await harness.service.submit({
            xpertId: 'xpert-1',
            toolsetId: 'seedance-linked',
            prompt: 'Generate a clip',
            model: 'seedance-model',
            resolution: '720p',
            aspectRatio: '9:16',
            durationSeconds: 8,
            generateAudio: true
        })
        await harness.service.query({
            xpertId: 'xpert-1',
            toolsetId: 'seedance-linked',
            providerTaskId: 'provider-task-1'
        })

        expect(invoke.mock.calls[0][0]).toMatchObject({
            type: 'tool_call',
            name: 'submit_video',
            args: { generate_audio: 'true' }
        })
        expect(invoke.mock.calls[1][0]).toMatchObject({
            type: 'tool_call',
            name: 'query_video',
            args: { download_video: 'true' }
        })
    })

    it('routes multiple reference images through a protocol v2 reference tool', async () => {
        const harness = createHarness()
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ id: 'user-1' } as never)
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue(null)
        const invoke = jest.fn().mockResolvedValue({
            content: 'submitted',
            artifact: { data: { task_id: 'provider-reference-task', status: 'queued' } }
        })
        jest.mocked(createBuiltinToolset).mockResolvedValue({
            initTools: jest.fn(),
            getTool: jest.fn(() => ({ invoke })),
            close: jest.fn()
        } as never)
        const references = [workspaceImage('pony.jpg'), workspaceImage('river.jpg')].map((file) => ({
            kind: 'image' as const,
            purpose: 'reference' as const,
            file
        }))

        await expect(
            harness.service.submit({
                xpertId: 'xpert-1',
                toolsetId: 'seedance-linked',
                prompt: 'Use image 1 as the character and image 2 as the location',
                references,
                model: 'seedance-model',
                resolution: '720p',
                aspectRatio: '9:16',
                durationSeconds: 8,
                generateAudio: true
            })
        ).resolves.toMatchObject({
            providerTaskId: 'provider-reference-task',
            mode: 'reference_to_video',
            acceptedReferenceCount: 2
        })

        expect(invoke).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'submit_reference_video',
                args: expect.objectContaining({ reference_image_files: references.map((item) => item.file) })
            }),
            expect.anything()
        )
    })

    it('routes initial and final frames through the dedicated protocol v2 tool', async () => {
        const harness = createHarness()
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ id: 'user-1' } as never)
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue(null)
        const invoke = jest.fn().mockResolvedValue({
            artifact: { data: { task_id: 'frame-task', status: 'queued' } }
        })
        jest.mocked(createBuiltinToolset).mockResolvedValue({
            initTools: jest.fn(),
            getTool: jest.fn(() => ({ invoke })),
            close: jest.fn()
        } as never)
        const firstFrame = workspaceImage('first.jpg')
        const lastFrame = workspaceImage('last.jpg')

        await harness.service.submit({
            xpertId: 'xpert-1',
            toolsetId: 'seedance-linked',
            prompt: 'Move from the first composition to the final composition',
            references: [
                { kind: 'image', purpose: 'first_frame', file: firstFrame },
                { kind: 'image', purpose: 'last_frame', file: lastFrame }
            ],
            model: 'seedance-model'
        })

        expect(invoke).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'submit_first_last_video',
                args: expect.objectContaining({
                    first_frame_file: firstFrame,
                    last_frame_file: lastFrame
                })
            }),
            expect.anything()
        )
    })

    it('routes mixed reference media without losing their kinds', async () => {
        const harness = createHarness()
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ id: 'user-1' } as never)
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue(null)
        const invoke = jest.fn().mockResolvedValue({
            artifact: { data: { task_id: 'multimodal-task', status: 'queued' } }
        })
        jest.mocked(createBuiltinToolset).mockResolvedValue({
            initTools: jest.fn(),
            getTool: jest.fn(() => ({ invoke })),
            close: jest.fn()
        } as never)
        const image = workspaceImage('character.jpg')
        const audio = workspaceFile('voice.mp3', 'audio/mpeg')

        await harness.service.submit({
            xpertId: 'xpert-1',
            toolsetId: 'seedance-linked',
            prompt: 'Keep the character and voice consistent',
            references: [
                { kind: 'image', purpose: 'reference', file: image },
                { kind: 'audio', purpose: 'reference', file: audio }
            ],
            model: 'seedance-model'
        })

        expect(invoke).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'submit_reference_video',
                args: expect.objectContaining({
                    reference_image_files: [image],
                    reference_audio_files: [audio]
                })
            }),
            expect.anything()
        )
    })

    it('rejects references above the selected model limit before provider invocation', async () => {
        const harness = createHarness()
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ id: 'user-1' } as never)
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue(null)

        await expect(
            harness.service.submit({
                xpertId: 'xpert-1',
                toolsetId: 'seedance-linked',
                prompt: 'Generate a clip',
                references: Array.from({ length: 10 }, (_, index) => ({
                    kind: 'image' as const,
                    purpose: 'reference' as const,
                    file: workspaceImage(`reference-${index}.jpg`)
                })),
                model: 'seedance-model'
            })
        ).rejects.toEqual(new BadRequestException('video_generation_reference_images_not_supported'))

        expect(createBuiltinToolset).not.toHaveBeenCalled()
    })

    it('keeps protocol v1 single-image providers compatible', async () => {
        const harness = createHarness()
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ id: 'user-1' } as never)
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue(null)
        const invoke = jest.fn().mockResolvedValue({
            artifact: { data: { task_id: 'veo-task', status: 'queued' } }
        })
        jest.mocked(createBuiltinToolset).mockResolvedValue({
            initTools: jest.fn(),
            getTool: jest.fn(() => ({ invoke })),
            close: jest.fn()
        } as never)
        const image = workspaceImage('legacy.jpg')

        await harness.service.submit({
            xpertId: 'xpert-1',
            toolsetId: 'veo-workspace',
            prompt: 'Generate a clip',
            inputImage: image,
            model: 'veo-model'
        })

        expect(invoke).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'submit_image_video',
                args: expect.objectContaining({ input_image_file: image })
            }),
            expect.anything()
        )
    })
})

function createHarness() {
    const seedance = capability('seedance')
    const veo = capability('veo')
    const xpertAccess = {
        getAccessiblePublishedXpert: jest.fn(async () => ({
            id: 'xpert-1',
            workspaceId: 'workspace-1',
            toolsets: [{ id: 'seedance-linked' }]
        }))
    }
    const toolsets = {
        getAllByWorkspaceForRuntime: jest.fn(async () => ({
            items: [
                toolset('seedance-linked', 'seedance_type'),
                toolset('veo-workspace', 'veo_type'),
                toolset('missing-query', 'seedance_type', ['submit_video']),
                toolset('not-compatible', 'other_type'),
                { ...toolset('not-builtin', 'seedance_type'), category: XpertToolsetCategoryEnum.MCP }
            ]
        }))
    }
    const registry = {
        get: jest.fn((type: string) => {
            if (type === 'seedance_type') return { meta: { videoGeneration: seedance } }
            if (type === 'veo_type') return { meta: { videoGeneration: veo } }
            return { meta: {} }
        })
    }
    const service = new VideoGenerationService(
        xpertAccess as never,
        toolsets as never,
        registry as never,
        {} as never,
        {} as never
    )
    return { service, xpertAccess, toolsets, registry }
}

function capability(family: 'seedance' | 'veo'): VideoGenerationToolsetCapability {
    if (family === 'seedance') {
        return {
            protocolVersion: 2,
            family,
            displayName: 'Seedance',
            modes: ['text_to_video', 'image_to_video', 'first_last_frame_to_video', 'reference_to_video'],
            tools: {
                textToVideo: 'submit_video',
                imageToVideo: 'submit_image_video',
                firstLastFrameToVideo: 'submit_first_last_video',
                referenceToVideo: 'submit_reference_video',
                query: 'query_video'
            },
            models: [
                {
                    id: 'seedance-model',
                    label: 'Seedance model',
                    modes: ['text_to_video', 'image_to_video', 'first_last_frame_to_video', 'reference_to_video'],
                    inputs: {
                        referenceImages: { maxItems: 9 },
                        referenceAudios: { maxItems: 3 },
                        initialFrame: true,
                        lastFrame: true
                    }
                }
            ],
            defaultModel: 'seedance-model',
            resolutions: ['720p'],
            aspectRatios: ['9:16'],
            durationSeconds: { min: 4, max: 15, default: 5 },
            supportsAudio: true
        }
    }
    return {
        protocolVersion: 1,
        family,
        displayName: 'Veo',
        modes: ['text_to_video', 'image_to_video'],
        tools: {
            textToVideo: 'submit_video',
            imageToVideo: 'submit_image_video',
            query: 'query_video'
        },
        models: [{ id: `${family}-model`, label: `${family} model` }],
        defaultModel: `${family}-model`,
        resolutions: ['720p'],
        aspectRatios: ['9:16'],
        durationSeconds: { min: 4, max: 15, default: 5 },
        supportsAudio: true
    }
}

function toolset(
    id: string,
    type: string,
    enabledTools = [
        'submit_video',
        'submit_image_video',
        'submit_first_last_video',
        'submit_reference_video',
        'query_video'
    ]
) {
    return {
        id,
        name: id,
        type,
        category: XpertToolsetCategoryEnum.BUILTIN,
        tools: enabledTools.map((name) => ({ name, enabled: true }))
    }
}

function workspaceImage(fileName: string) {
    return workspaceFile(fileName, 'image/jpeg')
}

function workspaceFile(fileName: string, mimeType: string) {
    return {
        source: 'platform.workspace.files' as const,
        filePath: `references/${fileName}`,
        workspacePath: `references/${fileName}`,
        mimeType
    }
}
