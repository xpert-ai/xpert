import {
    createOperationGuardedPermissionService,
    PluginServicePermissionHandler,
    registerPluginServicePermissionHandler,
    resolvePermissionOperations
} from '@xpert-ai/server-core'
import {
    Permissions,
    RequestContext as PluginRequestContext,
    RequirePermissionOperation,
    SPEECH_TO_TEXT_PERMISSION_SERVICE_TOKEN,
    SPEECH_TO_TEXT_SERVICE_TOKEN,
    SpeechToTextPermissionOperation,
    SpeechToTextPermissionService,
    SpeechToTextTranscribeInput,
    SpeechToTextTranscribeResult
} from '@xpert-ai/plugin-sdk'
import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common'
import type { IApiPrincipal } from '@xpert-ai/contracts'
import { ApiKeyBindingType, SecretTokenBindingType } from '@xpert-ai/contracts'
import { SpeechToTextService } from './speech-to-text.service'
import { PublishedXpertAccessService } from '../xpert'

const SPEECH_TO_TEXT_ALL_OPERATIONS = ['transcribe'] as const
function resolveSpeechToTextOperations(permissions: Permissions): Set<SpeechToTextPermissionOperation> {
    return resolvePermissionOperations<SpeechToTextPermissionOperation>(
        permissions,
        'speech_to_text',
        SPEECH_TO_TEXT_ALL_OPERATIONS,
        (operation): operation is SpeechToTextPermissionOperation => operation === 'transcribe'
    )
}

function createGuardedSpeechToTextPermissionService(
    pluginName: string,
    service: SpeechToTextPermissionService,
    permissions: Permissions
): SpeechToTextPermissionService {
    return createOperationGuardedPermissionService<SpeechToTextPermissionOperation, SpeechToTextPermissionService>(
        pluginName,
        'speech_to_text',
        service,
        permissions,
        resolveSpeechToTextOperations
    )
}

@Injectable()
export class PluginSpeechToTextPermissionService implements SpeechToTextPermissionService {
    constructor(
        private readonly speechToTextService: SpeechToTextService,
        private readonly publishedXpertAccessService: PublishedXpertAccessService
    ) {}

    @RequirePermissionOperation('speech_to_text', 'transcribe')
    async transcribe(input: SpeechToTextTranscribeInput): Promise<SpeechToTextTranscribeResult> {
        const tenantId = this.normalizeString(input.tenantId) || PluginRequestContext.currentTenantId()
        if (!tenantId) {
            return this.speechToTextService.transcribe(input)
        }

        const actor = PluginRequestContext.currentUser()
        if (!actor?.id) {
            throw new BadRequestException('speech_to_text_actor_required')
        }
        if (this.normalizeString(actor.tenantId) !== tenantId) {
            throw new ForbiddenException('speech_to_text_actor_tenant_mismatch')
        }
        const organizationId = this.normalizeString(input.organizationId)
        const currentOrganizationId = this.normalizeString(PluginRequestContext.getOrganizationId())
        if (organizationId && currentOrganizationId && organizationId !== currentOrganizationId) {
            throw new ForbiddenException('speech_to_text_actor_organization_mismatch')
        }

        await this.assertTargetXpertAccess(input, organizationId)
        return this.speechToTextService.transcribe(input)
    }

    private validateTargetXpertId(input: SpeechToTextTranscribeInput): void {
        if (!this.normalizeString(input.xpertId)) {
            throw new BadRequestException('speech_to_text_xpert_id_required')
        }
    }

    private resolveCurrentApiPrincipal(): IApiPrincipal | null {
        return PluginRequestContext.currentApiPrincipal() as IApiPrincipal | null
    }

    private async assertTargetXpertAccess(input: SpeechToTextTranscribeInput, organizationId: string): Promise<void> {
        this.validateTargetXpertId(input)
        const xpertId = this.normalizeString(input.xpertId)
        const principal = this.resolveCurrentApiPrincipal()
        const apiKey = principal?.apiKey

        if (apiKey?.type === ApiKeyBindingType.ASSISTANT && apiKey.entityId) {
            if (this.normalizeString(apiKey.entityId) !== xpertId) {
                throw new ForbiddenException('speech_to_text_xpert_delegation_mismatch')
            }

            const isPublicXpertSession =
                principal.principalType === 'client_secret' &&
                principal.clientSecretBindingType === SecretTokenBindingType.PUBLIC_XPERT
            if (!principal.requestedUserId && !isPublicXpertSession) {
                const xpert = await this.publishedXpertAccessService.getPublishedXpertInTenant(xpertId)
                if (organizationId && this.normalizeString(xpert.organizationId) !== organizationId) {
                    throw new ForbiddenException('speech_to_text_xpert_organization_mismatch')
                }
                return
            }
        }

        await this.publishedXpertAccessService.getAccessiblePublishedXpert(xpertId)
    }

    private normalizeString(value: unknown): string {
        return typeof value === 'string' ? value.trim() : ''
    }
}

const SPEECH_TO_TEXT_PLUGIN_SERVICE_PERMISSION_HANDLER: PluginServicePermissionHandler = {
    token: SPEECH_TO_TEXT_PERMISSION_SERVICE_TOKEN,
    permissionType: 'speech_to_text',
    resolveToken: SPEECH_TO_TEXT_SERVICE_TOKEN,
    cacheKey: 'speech_to_text',
    createGuardedService: (pluginName, resolvedService, permissions) =>
        createGuardedSpeechToTextPermissionService(
            pluginName,
            resolvedService as SpeechToTextPermissionService,
            permissions
        ),
    unavailableMessage: (pluginName) =>
        `Plugin '${pluginName}' attempted to resolve speech-to-text service but it is not available.`
}

export function registerSpeechToTextPluginServicePermissionHandler(): void {
    registerPluginServicePermissionHandler(SPEECH_TO_TEXT_PLUGIN_SERVICE_PERMISSION_HANDLER)
}
