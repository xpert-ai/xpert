import type { IUser } from '@xpert-ai/contracts'
import {
    RequestContext as PluginRequestContext,
    runWithRequestContext as runWithPluginRequestContext
} from '@xpert-ai/plugin-sdk'
import { PublishedXpertAccessService } from '../xpert'
import { PluginSpeechToTextPermissionService } from './speech-to-text-permission'
import { SpeechToTextService } from './speech-to-text.service'

describe('PluginSpeechToTextPermissionService', () => {
    it('keeps the logged-in user as actor while authorizing the target xpert', async () => {
        const speechToTextService = createSpeechService()
        const accessService = createAccessService()
        const service = createService(speechToTextService, accessService)

        await expect(
            runInPluginContext(() => service.transcribe(transcriptionInput()), {
                id: 'business-user-1',
                tenantId: 'tenant-1'
            })
        ).resolves.toEqual({
            text: 'business-user-1:tenant-1:org-1:none:none'
        })
        expect(accessService.getAccessiblePublishedXpert).toHaveBeenCalledWith('xpert-1')
        expect(accessService.getPublishedXpertInTenant).not.toHaveBeenCalled()
    })

    it('keeps a delegated business user as actor without replacing it with the xpert technical user', async () => {
        const speechToTextService = createSpeechService()
        const accessService = createAccessService()
        const service = createService(speechToTextService, accessService)

        await expect(
            runInPluginContext(() => service.transcribe(transcriptionInput()), delegatedUser())
        ).resolves.toEqual({
            text: 'business-user-1:tenant-1:org-1:assistant:xpert-1'
        })
        expect(accessService.getAccessiblePublishedXpert).toHaveBeenCalledWith('xpert-1')
    })

    it('allows a matching assistant service delegation without pretending it is a human user', async () => {
        const speechToTextService = createSpeechService()
        const accessService = createAccessService()
        const service = createService(speechToTextService, accessService)

        await expect(
            runInPluginContext(() => service.transcribe(transcriptionInput()), assistantServiceUser())
        ).resolves.toEqual({
            text: 'assistant-user-1:tenant-1:org-1:assistant:xpert-1'
        })
        expect(accessService.getPublishedXpertInTenant).toHaveBeenCalledWith('xpert-1')
        expect(accessService.getAccessiblePublishedXpert).not.toHaveBeenCalled()
    })

    it('rejects an assistant delegation targeting another xpert', async () => {
        const speechToTextService = createSpeechService()
        const accessService = createAccessService()
        const service = createService(speechToTextService, accessService)
        const actor = assistantServiceUser()
        actor.apiKey!.entityId = 'xpert-other'

        await expect(runInPluginContext(() => service.transcribe(transcriptionInput()), actor)).rejects.toThrow(
            'speech_to_text_xpert_delegation_mismatch'
        )
        expect(speechToTextService.transcribe).not.toHaveBeenCalled()
    })

    it('requires an authenticated actor', async () => {
        const speechToTextService = createSpeechService()
        const accessService = createAccessService()
        const service = createService(speechToTextService, accessService)

        await expect(service.transcribe(transcriptionInput())).rejects.toThrow('speech_to_text_actor_required')
        expect(speechToTextService.transcribe).not.toHaveBeenCalled()
        expect(accessService.getAccessiblePublishedXpert).not.toHaveBeenCalled()
    })
})

function createSpeechService() {
    return {
        transcribe: jest.fn().mockImplementation(async () => ({
            text: [
                PluginRequestContext.currentUserId(),
                PluginRequestContext.currentTenantId(),
                PluginRequestContext.getOrganizationId(),
                PluginRequestContext.currentApiKey()?.type ?? 'none',
                PluginRequestContext.currentApiKey()?.entityId ?? 'none'
            ].join(':')
        }))
    }
}

function createAccessService() {
    return {
        getAccessiblePublishedXpert: jest.fn().mockResolvedValue({
            id: 'xpert-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1'
        }),
        getPublishedXpertInTenant: jest.fn().mockResolvedValue({
            id: 'xpert-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1'
        })
    }
}

function createService(
    speechToTextService: ReturnType<typeof createSpeechService>,
    accessService: ReturnType<typeof createAccessService>
) {
    return new PluginSpeechToTextPermissionService(
        speechToTextService as unknown as SpeechToTextService,
        accessService as unknown as PublishedXpertAccessService
    )
}

function transcriptionInput() {
    return {
        xpertId: 'xpert-1',
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        file: {
            data: new Uint8Array([1, 2, 3]),
            originalName: 'voice.wav',
            mimeType: 'audio/wav'
        }
    }
}

function delegatedUser() {
    return {
        id: 'business-user-1',
        tenantId: 'tenant-1',
        apiKey: {
            token: '[managed-queue-delegation]',
            type: 'assistant',
            entityId: 'xpert-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            userId: 'assistant-user-1'
        },
        ownerUserId: 'owner-user-1',
        apiKeyUserId: 'assistant-user-1',
        requestedUserId: 'business-user-1',
        requestedOrganizationId: 'org-1',
        principalType: 'api_key'
    } as IUser & {
        apiKey: NonNullable<ReturnType<typeof PluginRequestContext.currentApiKey>>
        requestedUserId: string
        principalType: 'api_key'
    }
}

function assistantServiceUser() {
    return {
        ...delegatedUser(),
        id: 'assistant-user-1',
        requestedUserId: null
    }
}

function runInPluginContext<T>(callback: () => Promise<T>, user: IUser): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        runWithPluginRequestContext(
            {
                headers: {
                    'tenant-id': 'tenant-1',
                    'organization-id': 'org-1',
                    'x-scope-level': 'organization'
                },
                user
            },
            {},
            () => {
                callback().then(resolve).catch(reject)
            }
        )
    })
}
