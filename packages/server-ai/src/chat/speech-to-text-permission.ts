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
import { BadRequestException, Injectable } from '@nestjs/common'
import type { IApiKey, IApiPrincipal } from '@xpert-ai/contracts'
import { ApiKeyBindingType } from '@xpert-ai/contracts'
import type { IncomingMessage } from 'node:http'
import { SpeechToTextService } from './speech-to-text.service'
import { XpertPrincipalService } from '../xpert'
import { captureRequestContext, runWithCapturedRequestContext } from '../shared/request-context'

const SPEECH_TO_TEXT_ALL_OPERATIONS = ['transcribe'] as const
type SpeechToTextContextRequest = Partial<IncomingMessage> & {
    headers: Record<string, string>
    user: IApiPrincipal
}

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
        private readonly xpertPrincipalService: XpertPrincipalService
    ) {}

    @RequirePermissionOperation('speech_to_text', 'transcribe')
    async transcribe(input: SpeechToTextTranscribeInput): Promise<SpeechToTextTranscribeResult> {
        const tenantId = this.normalizeString(input.tenantId) || PluginRequestContext.currentTenantId()
        if (!tenantId) {
            return this.speechToTextService.transcribe(input)
        }

        const request = await this.createAssistantRequestContext(input, tenantId)
        return this.runInRequestContext(request, () => this.speechToTextService.transcribe(input))
    }

    private async runInRequestContext<T>(request: SpeechToTextContextRequest, callback: () => Promise<T>): Promise<T> {
        const context = captureRequestContext({
            user: request.user,
            tenantId: request.headers['tenant-id'],
            organizationId: request.headers['organization-id'],
            headers: request.headers
        })
        return runWithCapturedRequestContext(context, callback)
    }

    private async createAssistantRequestContext(
        input: SpeechToTextTranscribeInput,
        tenantId: string
    ): Promise<SpeechToTextContextRequest> {
        const currentPrincipal = this.resolveCurrentApiPrincipal()
        if (!currentPrincipal?.apiKey) {
            throw new BadRequestException('speech_to_text_principal_required')
        }

        this.validateTargetXpertId(input)
        const { xpert, user: principalUser } = await this.xpertPrincipalService.ensurePrincipalUserByXpertId({
            xpertId: input.xpertId,
            tenantId,
            organizationId: this.normalizeString(input.organizationId) || null
        })
        const organizationId = this.normalizeString(xpert.organizationId) || this.normalizeString(input.organizationId)
        const headers: Record<string, string> = {
            'tenant-id': tenantId,
            'x-scope-level': organizationId ? 'organization' : 'tenant'
        }
        if (organizationId) {
            headers['organization-id'] = organizationId
        }

        const apiKey = {
            token: `plugin-speech-to-text:${input.xpertId}`,
            type: ApiKeyBindingType.ASSISTANT,
            entityId: input.xpertId,
            tenantId,
            organizationId: organizationId || null,
            createdById: currentPrincipal.ownerUserId ?? currentPrincipal.id ?? principalUser.id,
            userId: principalUser.id,
            user: principalUser
        } as IApiKey & { createdById?: string | null }

        return {
            headers,
            user: {
                ...principalUser,
                id: principalUser.id,
                tenantId,
                apiKey: {
                    ...apiKey
                },
                ownerUserId: currentPrincipal.ownerUserId ?? apiKey.createdById ?? principalUser.id,
                apiKeyUserId: principalUser.id,
                requestedUserId: currentPrincipal.requestedUserId ?? null,
                requestedOrganizationId: (currentPrincipal.requestedOrganizationId ?? organizationId) || null,
                principalType: currentPrincipal.principalType ?? 'api_key',
                clientSecretBindingType: currentPrincipal.clientSecretBindingType ?? null,
                clientSecretId: currentPrincipal.clientSecretId ?? null
            }
        }
    }

    private validateTargetXpertId(input: SpeechToTextTranscribeInput): void {
        if (!this.normalizeString(input.xpertId)) {
            throw new BadRequestException('speech_to_text_xpert_id_required')
        }
    }

    private resolveCurrentApiPrincipal(): IApiPrincipal | null {
        return PluginRequestContext.currentApiPrincipal() as IApiPrincipal | null
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
