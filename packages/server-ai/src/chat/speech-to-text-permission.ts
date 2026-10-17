import {
    createOperationGuardedPermissionService,
    PluginServicePermissionHandler,
    registerPluginServicePermissionHandler,
    resolvePermissionOperations
} from '@xpert-ai/server-core'
import {
    Permissions,
    RequirePermissionOperation,
    SPEECH_TO_TEXT_PERMISSION_SERVICE_TOKEN,
    SPEECH_TO_TEXT_SERVICE_TOKEN,
    SpeechToTextPermissionOperation,
    SpeechToTextPermissionService,
    SpeechToTextTranscribeInput,
    SpeechToTextTranscribeResult
} from '@xpert-ai/plugin-sdk'
import { Injectable } from '@nestjs/common'
import { SpeechToTextService } from './speech-to-text.service'

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
    constructor(private readonly speechToTextService: SpeechToTextService) {}

    @RequirePermissionOperation('speech_to_text', 'transcribe')
    async transcribe(input: SpeechToTextTranscribeInput): Promise<SpeechToTextTranscribeResult> {
        // The shared service authorizes before model access for both plugin and HTTP callers.
        return this.speechToTextService.transcribe(input)
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
