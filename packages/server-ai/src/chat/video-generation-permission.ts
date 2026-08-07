import {
    createOperationGuardedPermissionService,
    type PluginServicePermissionHandler,
    registerPluginServicePermissionHandler,
    resolvePermissionOperations
} from '@xpert-ai/server-core'
import {
    RequirePermissionOperation,
    VIDEO_GENERATION_PERMISSION_SERVICE_TOKEN,
    VIDEO_GENERATION_SERVICE_TOKEN,
    type CancelVideoGenerationInput,
    type ListVideoGeneratorsInput,
    type Permissions,
    type QueryVideoGenerationInput,
    type SubmitVideoGenerationInput,
    type VideoGenerationPermissionOperation,
    type VideoGenerationPermissionService
} from '@xpert-ai/plugin-sdk'
import { Injectable } from '@nestjs/common'
import { PublishedXpertAccessService } from '../xpert'
import { VideoGenerationService } from './video-generation.service'

const ALL_OPERATIONS = ['list', 'submit', 'query', 'cancel'] as const

function resolveOperations(permissions: Permissions) {
    return resolvePermissionOperations<VideoGenerationPermissionOperation>(
        permissions,
        'video_generation',
        ALL_OPERATIONS,
        (operation): operation is VideoGenerationPermissionOperation =>
            ALL_OPERATIONS.includes(operation as VideoGenerationPermissionOperation)
    )
}

function createGuardedService(pluginName: string, service: VideoGenerationPermissionService, permissions: Permissions) {
    return createOperationGuardedPermissionService<
        VideoGenerationPermissionOperation,
        VideoGenerationPermissionService
    >(pluginName, 'video_generation', service, permissions, resolveOperations)
}

@Injectable()
export class PluginVideoGenerationPermissionService implements VideoGenerationPermissionService {
    constructor(
        private readonly service: VideoGenerationService,
        private readonly xpertAccess: PublishedXpertAccessService
    ) {}

    @RequirePermissionOperation('video_generation', 'list')
    async listGenerators(input: ListVideoGeneratorsInput) {
        await this.assertAccess(input.xpertId)
        return this.service.listGenerators(input)
    }

    @RequirePermissionOperation('video_generation', 'submit')
    async submit(input: SubmitVideoGenerationInput) {
        await this.assertAccess(input.xpertId)
        return this.service.submit(input)
    }

    @RequirePermissionOperation('video_generation', 'query')
    async query(input: QueryVideoGenerationInput) {
        await this.assertAccess(input.xpertId)
        return this.service.query(input)
    }

    @RequirePermissionOperation('video_generation', 'cancel')
    async cancel(input: CancelVideoGenerationInput) {
        await this.assertAccess(input.xpertId)
        return this.service.cancel(input)
    }

    private async assertAccess(xpertId: string) {
        await this.xpertAccess.getAccessiblePublishedXpert(xpertId)
    }
}

const HANDLER: PluginServicePermissionHandler = {
    token: VIDEO_GENERATION_PERMISSION_SERVICE_TOKEN,
    permissionType: 'video_generation',
    resolveToken: VIDEO_GENERATION_SERVICE_TOKEN,
    cacheKey: 'video_generation',
    createGuardedService: (pluginName, resolvedService, permissions) =>
        createGuardedService(pluginName, resolvedService as VideoGenerationPermissionService, permissions),
    unavailableMessage: (pluginName) =>
        `Plugin '${pluginName}' attempted to resolve video generation service but it is not available.`
}

export function registerVideoGenerationPluginServicePermissionHandler() {
    registerPluginServicePermissionHandler(HANDLER)
}
