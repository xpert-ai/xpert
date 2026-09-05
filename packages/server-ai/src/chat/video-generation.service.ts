import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import {
    RequestContext,
    ToolsetRegistry,
    type QueryVideoGenerationInput,
    type QueryVideoGenerationResult,
    type SubmitVideoGenerationInput,
    type SubmitVideoGenerationResult,
    type VideoGenerationMode,
    type VideoGenerationModelOption,
    type VideoGenerationPermissionService,
    type VideoGenerationReferenceInput,
    type VideoGenerationToolsetCapability,
    type VideoGeneratorSummary,
    type WorkspacePortableFileReference,
    MANAGED_QUEUE_SERVICE_TOKEN,
    type ManagedQueueService
} from '@xpert-ai/plugin-sdk'
import {
    SecretTokenBindingType,
    XpertToolsetCategoryEnum,
    type IXpertToolset,
    type XpertWorkspaceDataScope
} from '@xpert-ai/contracts'
import { createBuiltinToolset, XpertToolsetService } from '../xpert-toolset'
import { PublishedXpertAccessService } from '../xpert'
import { AgentMiddlewareRuntimeService } from '../shared/agent/middleware-runtime/index'
import { resolveToolRuntimeScope } from '../tool-runtime/workspace-scope'

const COMPLETED_STATUSES = new Set(['completed', 'done', 'succeeded', 'success'])
const FAILED_STATUSES = new Set(['failed', 'error', 'cancelled', 'canceled', 'expired'])

@Injectable()
export class VideoGenerationService implements VideoGenerationPermissionService {
    private readonly logger = new Logger(VideoGenerationService.name)

    constructor(
        private readonly xpertAccess: PublishedXpertAccessService,
        private readonly toolsets: XpertToolsetService,
        private readonly registry: ToolsetRegistry,
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus,
        private readonly modelRuntime: AgentMiddlewareRuntimeService,
        @Inject(MANAGED_QUEUE_SERVICE_TOKEN)
        private readonly managedQueue: ManagedQueueService
    ) {}

    async listGenerators(input: { xpertId: string }) {
        const resolved = await this.resolveGenerators(input.xpertId)
        return { generators: resolved.map(({ summary }) => summary) }
    }

    async submit(input: SubmitVideoGenerationInput): Promise<SubmitVideoGenerationResult> {
        const generator = await this.requireGenerator(input.xpertId, input.toolsetId)
        const model = validateSubmissionOptions(generator.capability, input)
        const references = normalizeReferences(input)
        const submission = resolveSubmission(generator.capability, model, references)
        if (!enabledToolNames(generator.toolset).has(submission.toolName)) {
            throw new BadRequestException('video_generation_mode_not_enabled')
        }

        const toolInput = {
            prompt: requireText(input.prompt, 'video_generation_prompt_required'),
            ...submission.referenceArguments,
            model: model.id,
            ...(input.resolution ? { resolution: input.resolution } : {}),
            ...(input.aspectRatio ? { ratio: input.aspectRatio } : {}),
            ...(input.durationSeconds != null ? { duration: input.durationSeconds } : {}),
            ...(input.generateAudio != null ? { generate_audio: toolBoolean(input.generateAudio) } : {})
        }
        this.logger.log(
            JSON.stringify({
                event: 'video_generation_tool_submit',
                xpertId: input.xpertId,
                projectId: input.projectId ?? null,
                toolsetId: input.toolsetId,
                generatorFamily: generator.capability.family,
                generatorName: generator.summary.displayName,
                mode: submission.mode,
                toolName: submission.toolName,
                acceptedReferenceCount: references.length,
                parameters: toolInput
            })
        )
        const result = await this.invokeTool(
            generator.toolset,
            input.xpertId,
            input.projectId,
            generator.workspaceDataScope,
            submission.toolName,
            toolInput
        )
        const data = readArtifactData(result)
        const providerTaskId = readString(data, 'task_id')
        if (!providerTaskId) throw new BadRequestException('video_generation_task_id_missing')
        return {
            providerTaskId,
            status: readString(data, 'status') || 'submitted',
            model: readString(data, 'model') || model.id,
            mode: submission.mode,
            acceptedReferenceCount: references.length
        }
    }

    async query(input: QueryVideoGenerationInput): Promise<QueryVideoGenerationResult> {
        const generator = await this.requireGenerator(input.xpertId, input.toolsetId)
        const providerTaskId = requireText(input.providerTaskId, 'video_generation_task_id_required')
        const result = await this.invokeTool(
            generator.toolset,
            input.xpertId,
            input.projectId,
            generator.workspaceDataScope,
            generator.capability.tools.query,
            { task_id: providerTaskId, wait_seconds: 0, download_video: toolBoolean(true) }
        )
        const data = readArtifactData(result)
        const status = (readString(data, 'status') || 'unknown').toLowerCase()
        const error = readProviderError(data.error)
        const outputFile = readOutputFile(result)
        return {
            providerTaskId: readString(data, 'task_id') || providerTaskId,
            status,
            completed: COMPLETED_STATUSES.has(status) && Boolean(outputFile),
            failed: FAILED_STATUSES.has(status),
            ...(readString(data, 'model') ? { model: readString(data, 'model') } : {}),
            ...(error.code ? { errorCode: error.code } : {}),
            ...(error.message ? { errorMessage: error.message } : {}),
            ...(outputFile ? { outputFile } : {})
        }
    }

    async cancel(input: { xpertId: string; toolsetId: string; providerTaskId: string }) {
        const generator = await this.requireGenerator(input.xpertId, input.toolsetId)
        const toolName = generator.capability.tools.cancel
        if (!toolName) {
            return {
                providerTaskId: input.providerTaskId,
                supported: false,
                cancelled: false,
                status: 'tracking_stopped'
            }
        }
        const result = await this.invokeTool(
            generator.toolset,
            input.xpertId,
            null,
            generator.workspaceDataScope,
            toolName,
            {
                task_id: input.providerTaskId
            }
        )
        const data = readArtifactData(result)
        const status = (readString(data, 'status') || 'cancelled').toLowerCase()
        return {
            providerTaskId: input.providerTaskId,
            supported: true,
            cancelled: status === 'cancelled' || status === 'canceled',
            status
        }
    }

    private async requireGenerator(xpertId: string, toolsetId: string) {
        const generator = (await this.resolveGenerators(xpertId)).find((item) => item.toolset.id === toolsetId)
        if (!generator) throw new NotFoundException('video_generation_generator_not_available')
        return generator
    }

    private async resolveGenerators(xpertId: string) {
        const xpert = await this.xpertAccess.getAccessiblePublishedXpert(
            requireText(xpertId, 'video_generation_xpert_id_required'),
            { relations: ['toolsets'] }
        )
        if (!xpert.workspaceId) return []
        const result = await this.toolsets.getAllByWorkspaceForRuntime(
            xpert.workspaceId,
            {
                relations: ['tools'],
                skip: 0,
                take: 100,
                where: {},
                withDeleted: false,
                order: { name: 'ASC', id: 'ASC' }
            },
            false,
            RequestContext.currentUser()
        )
        const linkedIds = new Set((xpert.toolsets ?? []).map((item) => item.id).filter(Boolean))
        const publicSession =
            RequestContext.currentApiPrincipal()?.clientSecretBindingType === SecretTokenBindingType.PUBLIC_XPERT

        return (result.items ?? []).flatMap((toolset) => {
            if (
                toolset.category !== XpertToolsetCategoryEnum.BUILTIN ||
                !toolset.type ||
                (publicSession && !linkedIds.has(toolset.id))
            ) {
                return []
            }
            const capability = this.readCapability(toolset.type)
            if (!capability || !hasRequiredEnabledTools(toolset, capability)) return []
            const modes = availableModes(toolset, capability)
            const models = effectiveModels(capability, modes)
            if (!models.length) return []
            const summary: VideoGeneratorSummary = {
                id: toolset.id,
                family: capability.family,
                name: toolset.name,
                displayName: toolset.name || capability.displayName,
                linkedToXpert: linkedIds.has(toolset.id),
                modes,
                models,
                defaultModel: capability.defaultModel,
                resolutions: [...capability.resolutions],
                aspectRatios: [...capability.aspectRatios],
                durationSeconds: capability.durationSeconds,
                supportsAudio: capability.supportsAudio,
                supportsCancel: Boolean(capability.tools.cancel)
            }
            return [{ toolset, capability, summary, workspaceDataScope: xpert.workspaceDataScope }]
        })
    }

    private readCapability(type: string): VideoGenerationToolsetCapability | null {
        try {
            return this.registry.get(type).meta.videoGeneration ?? null
        } catch {
            return null
        }
    }

    private async invokeTool(
        toolset: IXpertToolset,
        xpertId: string,
        projectId: string | null | undefined,
        workspaceDataScope: XpertWorkspaceDataScope | null | undefined,
        toolName: string,
        input: Record<string, unknown>
    ): Promise<unknown> {
        const tenantId = RequestContext.currentTenantId()
        const organizationId = RequestContext.getOrganizationId()
        const userId = RequestContext.currentUserId()
        const runtimeScope = resolveToolRuntimeScope(
            {
                tenantId,
                organizationId,
                userId,
                workspaceId: toolset.workspaceId,
                projectId,
                xpertId
            },
            workspaceDataScope
        )
        const scopedModelRuntime = this.modelRuntime.createScopedApi(runtimeScope)
        const controller = await createBuiltinToolset(toolset.type, toolset, {
            tenantId,
            organizationId,
            userId,
            xpertId,
            ...(projectId ? { projectId } : {}),
            env: {},
            commandBus: this.commandBus,
            queryBus: this.queryBus,
            managedQueue: this.managedQueue,
            modelRuntime: {
                createModelClient: scopedModelRuntime.createModelClient,
                getModelProvider: scopedModelRuntime.getModelProvider
            },
            runtimeCapabilities: scopedModelRuntime.capabilities,
            runtimeScope
        })
        try {
            await controller.initTools()
            const tool = controller.getTool(toolName)
            if (!tool) throw new NotFoundException('video_generation_tool_not_enabled')
            return await tool.invoke(
                {
                    type: 'tool_call',
                    id: `video-generation:${toolName}`,
                    name: toolName,
                    args: input
                },
                {
                    configurable: {
                        tenantId,
                        organizationId,
                        userId
                    }
                }
            )
        } finally {
            await controller.close()
        }
    }
}

function validateSubmissionOptions(capability: VideoGenerationToolsetCapability, input: SubmitVideoGenerationInput) {
    const modelId = input.model?.trim() || capability.defaultModel
    const model = capability.models.find((item) => item.id === modelId)
    if (!model) {
        throw new BadRequestException('video_generation_model_not_supported')
    }
    if (input.resolution && !capability.resolutions.includes(input.resolution)) {
        throw new BadRequestException('video_generation_resolution_not_supported')
    }
    if (input.aspectRatio && !capability.aspectRatios.includes(input.aspectRatio)) {
        throw new BadRequestException('video_generation_aspect_ratio_not_supported')
    }
    if (
        input.durationSeconds != null &&
        (!Number.isInteger(input.durationSeconds) ||
            input.durationSeconds < capability.durationSeconds.min ||
            input.durationSeconds > capability.durationSeconds.max)
    ) {
        throw new BadRequestException('video_generation_duration_not_supported')
    }
    if (input.generateAudio === true && !capability.supportsAudio) {
        throw new BadRequestException('video_generation_audio_not_supported')
    }
    return model
}

function normalizeReferences(input: SubmitVideoGenerationInput): VideoGenerationReferenceInput[] {
    const submitted = input.references?.length ? input.references : []
    if (submitted.length && input.inputImage) {
        throw new BadRequestException('video_generation_reference_inputs_conflict')
    }
    const references = submitted.length
        ? submitted
        : input.inputImage
          ? [{ kind: 'image' as const, purpose: 'reference' as const, file: input.inputImage }]
          : []
    if (references.length > 15) {
        throw new BadRequestException('video_generation_too_many_references')
    }

    const seen = new Set<string>()
    return references.map((reference) => {
        if (!['image', 'video', 'audio'].includes(reference.kind)) {
            throw new BadRequestException('video_generation_reference_kind_not_supported')
        }
        const purpose = reference.purpose ?? 'reference'
        if (!['reference', 'first_frame', 'last_frame'].includes(purpose)) {
            throw new BadRequestException('video_generation_reference_purpose_not_supported')
        }
        if (reference.kind !== 'image' && purpose !== 'reference') {
            throw new BadRequestException('video_generation_reference_purpose_not_supported')
        }
        if (!isWorkspaceFileReference(reference.file)) {
            throw new BadRequestException('video_generation_reference_file_invalid')
        }
        const key = `${reference.kind}:${purpose}:${reference.file.source}:${reference.file.filePath}`
        if (seen.has(key)) {
            throw new BadRequestException('video_generation_duplicate_reference')
        }
        seen.add(key)
        return { ...reference, purpose }
    })
}

function resolveSubmission(
    capability: VideoGenerationToolsetCapability,
    model: VideoGenerationModelOption,
    references: VideoGenerationReferenceInput[]
): {
    mode: VideoGenerationMode
    toolName: string
    referenceArguments: Record<string, unknown>
} {
    if (!references.length) {
        assertModelMode(capability, model, 'text_to_video')
        return requireSubmissionTool(capability, 'text_to_video', {})
    }
    if (capability.protocolVersion === 1) {
        if (
            references.length !== 1 ||
            references[0].kind !== 'image' ||
            !['reference', 'first_frame'].includes(references[0].purpose ?? 'reference')
        ) {
            throw new BadRequestException('video_generation_references_not_supported')
        }
        assertModelMode(capability, model, 'image_to_video')
        return requireSubmissionTool(capability, 'image_to_video', {
            input_image_file: references[0].file
        })
    }

    validateReferenceCapabilities(model, references)
    const firstFrames = references.filter((item) => item.purpose === 'first_frame')
    const lastFrames = references.filter((item) => item.purpose === 'last_frame')
    const generic = references.filter((item) => item.purpose === 'reference')
    if (firstFrames.length || lastFrames.length) {
        if (generic.length || firstFrames.length !== 1 || lastFrames.length > 1) {
            throw new BadRequestException('video_generation_frame_combination_invalid')
        }
        if (lastFrames.length) {
            assertModelMode(capability, model, 'first_last_frame_to_video')
            return requireSubmissionTool(capability, 'first_last_frame_to_video', {
                first_frame_file: firstFrames[0].file,
                last_frame_file: lastFrames[0].file
            })
        }
        assertModelMode(capability, model, 'image_to_video')
        return requireSubmissionTool(capability, 'image_to_video', {
            input_image_file: firstFrames[0].file
        })
    }

    if (capability.tools.referenceToVideo && modelModes(capability, model).includes('reference_to_video')) {
        return requireSubmissionTool(capability, 'reference_to_video', referenceArguments(generic))
    }
    if (generic.length === 1 && generic[0].kind === 'image') {
        assertModelMode(capability, model, 'image_to_video')
        return requireSubmissionTool(capability, 'image_to_video', {
            input_image_file: generic[0].file
        })
    }
    throw new BadRequestException('video_generation_references_not_supported')
}

function assertModelMode(
    capability: VideoGenerationToolsetCapability,
    model: VideoGenerationModelOption,
    mode: VideoGenerationMode
) {
    if (!modelModes(capability, model).includes(mode)) {
        throw new BadRequestException('video_generation_mode_not_supported_by_model')
    }
}

function modelModes(capability: VideoGenerationToolsetCapability, model: VideoGenerationModelOption) {
    return model.modes ?? capability.modes
}

function validateReferenceCapabilities(model: VideoGenerationModelOption, references: VideoGenerationReferenceInput[]) {
    const firstFrames = references.filter((item) => item.purpose === 'first_frame')
    const lastFrames = references.filter((item) => item.purpose === 'last_frame')
    if (firstFrames.length > 1 || (firstFrames.length && model.inputs?.initialFrame !== true)) {
        throw new BadRequestException('video_generation_initial_frame_not_supported')
    }
    if (lastFrames.length > 1 || (lastFrames.length && model.inputs?.lastFrame !== true)) {
        throw new BadRequestException('video_generation_last_frame_not_supported')
    }
    if (lastFrames.length && !firstFrames.length) {
        throw new BadRequestException('video_generation_last_frame_requires_initial_frame')
    }

    const generic = references.filter((item) => item.purpose === 'reference')
    validateReferenceCount(
        generic.filter((item) => item.kind === 'image').length,
        model.inputs?.referenceImages?.maxItems,
        'video_generation_reference_images_not_supported'
    )
    validateReferenceCount(
        generic.filter((item) => item.kind === 'video').length,
        model.inputs?.referenceVideos?.maxItems,
        'video_generation_reference_videos_not_supported'
    )
    validateReferenceCount(
        generic.filter((item) => item.kind === 'audio').length,
        model.inputs?.referenceAudios?.maxItems,
        'video_generation_reference_audios_not_supported'
    )
}

function validateReferenceCount(count: number, maxItems: number | undefined, code: string) {
    if (!count) return
    if (!maxItems || count > maxItems) throw new BadRequestException(code)
}

function referenceArguments(references: VideoGenerationReferenceInput[]) {
    const files = (kind: VideoGenerationReferenceInput['kind']) =>
        references.filter((item) => item.kind === kind).map((item) => item.file)
    const images = files('image')
    const videos = files('video')
    const audios = files('audio')
    return {
        ...(images.length ? { reference_image_files: images } : {}),
        ...(videos.length ? { reference_video_files: videos } : {}),
        ...(audios.length ? { reference_audio_files: audios } : {})
    }
}

function requireSubmissionTool(
    capability: VideoGenerationToolsetCapability,
    mode: VideoGenerationMode,
    referenceArguments: Record<string, unknown>
) {
    if (!capability.modes.includes(mode)) {
        throw new BadRequestException('video_generation_mode_not_supported')
    }
    const toolName = submissionToolName(capability, mode)
    if (!toolName) throw new BadRequestException('video_generation_mode_not_supported')
    return { mode, toolName, referenceArguments }
}

function submissionToolName(capability: VideoGenerationToolsetCapability, mode: VideoGenerationMode) {
    switch (mode) {
        case 'text_to_video':
            return capability.tools.textToVideo
        case 'image_to_video':
            return capability.tools.imageToVideo
        case 'first_last_frame_to_video':
            return capability.protocolVersion === 2 ? capability.tools.firstLastFrameToVideo : undefined
        case 'reference_to_video':
            return capability.protocolVersion === 2 ? capability.tools.referenceToVideo : undefined
    }
}

function availableModes(toolset: IXpertToolset, capability: VideoGenerationToolsetCapability) {
    const enabled = enabledToolNames(toolset)
    return capability.modes.filter((mode) => {
        const toolName = submissionToolName(capability, mode)
        return Boolean(toolName && enabled.has(toolName))
    })
}

function effectiveModels(
    capability: VideoGenerationToolsetCapability,
    available: VideoGenerationMode[]
): VideoGenerationModelOption[] {
    return capability.models.flatMap((model) => {
        const modes = modelModes(capability, model).filter((mode) => available.includes(mode))
        return modes.length ? [{ ...model, modes }] : []
    })
}

function hasRequiredEnabledTools(toolset: IXpertToolset, capability: VideoGenerationToolsetCapability) {
    const enabled = enabledToolNames(toolset)
    const submitTools = capability.modes.map((mode) => submissionToolName(capability, mode)).filter(Boolean)
    return enabled.has(capability.tools.query) && submitTools.some((name) => enabled.has(name!))
}

function enabledToolNames(toolset: IXpertToolset) {
    return new Set(
        (toolset.tools ?? [])
            .filter((tool) => tool.disabled !== true && tool.enabled !== false)
            .map((tool) => tool.name)
    )
}

function isWorkspaceFileReference(value: unknown): value is WorkspacePortableFileReference {
    if (!isRecord(value)) return false
    return (
        value.source === 'platform.workspace.files' &&
        typeof value.filePath === 'string' &&
        Boolean(value.filePath.trim()) &&
        typeof value.workspacePath === 'string' &&
        Boolean(value.workspacePath.trim())
    )
}

function requireText(value: string | null | undefined, code: string) {
    const normalized = value?.trim()
    if (!normalized) throw new BadRequestException(code)
    return normalized
}

function toolBoolean(value: boolean) {
    return value ? 'true' : 'false'
}

function readArtifact(result: unknown): Record<string, unknown> {
    if (Array.isArray(result) && isRecord(result[1])) return result[1]
    if (!isRecord(result)) return {}
    if (isRecord(result.artifact)) return result.artifact
    if (Array.isArray(result.content) && isRecord(result.content[1])) return result.content[1]
    return result
}

function readArtifactData(result: unknown): Record<string, unknown> {
    const artifact = readArtifact(result)
    return isRecord(artifact.data) ? artifact.data : artifact
}

function readOutputFile(result: unknown): WorkspacePortableFileReference | undefined {
    const files = readArtifact(result).files
    if (!Array.isArray(files)) return undefined
    const file = files.find((item) => isRecord(item) && readString(item, 'mimeType').startsWith('video/'))
    if (!isRecord(file)) return undefined
    const filePath = readString(file, 'filePath')
    const workspacePath = readString(file, 'workspacePath')
    if (!filePath || !workspacePath) return undefined
    const catalog = readString(file, 'catalog') as WorkspacePortableFileReference['catalog']
    const scopeId = readString(file, 'scopeId')
    return {
        source: 'platform.workspace.files',
        filePath,
        workspacePath,
        ...(readString(file, 'fileName') ? { originalName: readString(file, 'fileName') } : {}),
        ...(readString(file, 'mimeType') ? { mimeType: readString(file, 'mimeType') } : {}),
        ...(typeof file.size === 'number' ? { size: file.size } : {}),
        ...(catalog ? { catalog } : {}),
        ...(scopeId ? { scopeId } : {})
    }
}

function readProviderError(value: unknown) {
    if (typeof value === 'string') return { message: value.slice(0, 1_000) }
    if (!isRecord(value)) return {}
    return {
        ...(readString(value, 'code') ? { code: readString(value, 'code').slice(0, 100) } : {}),
        ...(readString(value, 'message') ? { message: readString(value, 'message').slice(0, 1_000) } : {})
    }
}

function readString(value: Record<string, unknown>, key: string) {
    const item = value[key]
    return typeof item === 'string' ? item.trim() : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}
