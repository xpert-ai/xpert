import {
    RequestContext as PluginRequestContext,
    runWithRequestContext as runWithPluginRequestContext
} from '@xpert-ai/plugin-sdk'
import { RequestContext as LegacyRequestContext } from '@xpert-ai/server-core'
import { XpertPrincipalService } from '../xpert'
import { PluginSpeechToTextPermissionService } from './speech-to-text-permission'
import { SpeechToTextService } from './speech-to-text.service'

describe('PluginSpeechToTextPermissionService', () => {
    it('runs plugin speech-to-text calls in the target assistant principal context', async () => {
        const speechToTextService = {
            transcribe: jest.fn().mockImplementation(async () => ({
                text: [
                    PluginRequestContext.currentUserId(),
                    PluginRequestContext.currentTenantId(),
                    PluginRequestContext.getOrganizationId(),
                    PluginRequestContext.currentApiKey()?.type,
                    PluginRequestContext.currentApiKey()?.entityId,
                    LegacyRequestContext.currentUserId(),
                    LegacyRequestContext.currentTenantId(),
                    LegacyRequestContext.getOrganizationId(),
                    LegacyRequestContext.currentApiKey()?.type,
                    LegacyRequestContext.currentApiKey()?.entityId
                ].join(':')
            }))
        }
        const xpertPrincipalService = {
            ensurePrincipalUserByXpertId: jest.fn().mockResolvedValue({
                xpert: {
                    id: 'xpert-1',
                    tenantId: 'tenant-1',
                    organizationId: 'org-1',
                    userId: 'assistant-user-1'
                },
                user: {
                    id: 'assistant-user-1',
                    tenantId: 'tenant-1'
                }
            })
        }
        const service = new PluginSpeechToTextPermissionService(
            speechToTextService as unknown as SpeechToTextService,
            xpertPrincipalService as unknown as XpertPrincipalService
        )

        await expect(
            runInPluginContext(() =>
                service.transcribe({
                    xpertId: 'xpert-1',
                    tenantId: 'tenant-1',
                    organizationId: 'org-1',
                    file: {
                        data: new Uint8Array([1, 2, 3]),
                        originalName: 'voice.wav',
                        mimeType: 'audio/wav'
                    }
                })
            )
        ).resolves.toEqual({
            text: 'assistant-user-1:tenant-1:org-1:assistant:xpert-1:assistant-user-1:tenant-1:org-1:assistant:xpert-1'
        })
        expect(speechToTextService.transcribe).toHaveBeenCalledTimes(1)
        expect(xpertPrincipalService.ensurePrincipalUserByXpertId).toHaveBeenCalledWith({
            xpertId: 'xpert-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1'
        })
    })

    it('initializes the target xpert principal user before transcribing plugin voice input', async () => {
        const speechToTextService = {
            transcribe: jest.fn().mockResolvedValue({
                text: 'hello'
            })
        }
        const xpertPrincipalService = {
            ensurePrincipalUserByXpertId: jest.fn().mockResolvedValue({
                xpert: {
                    id: 'xpert-1',
                    tenantId: 'tenant-1',
                    organizationId: 'org-1',
                    userId: 'assistant-user-1'
                },
                user: {
                    id: 'assistant-user-1',
                    tenantId: 'tenant-1'
                }
            })
        }
        const service = new PluginSpeechToTextPermissionService(
            speechToTextService as unknown as SpeechToTextService,
            xpertPrincipalService as unknown as XpertPrincipalService
        )

        await expect(
            runInPluginContext(() =>
                service.transcribe({
                    xpertId: 'xpert-1',
                    tenantId: 'tenant-1',
                    organizationId: 'org-1',
                    file: {
                        data: new Uint8Array([1, 2, 3]),
                        originalName: 'voice.wav',
                        mimeType: 'audio/wav'
                    }
                })
            )
        ).resolves.toEqual({
            text: 'hello'
        })
        expect(xpertPrincipalService.ensurePrincipalUserByXpertId).toHaveBeenCalledWith({
            xpertId: 'xpert-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1'
        })
        expect(speechToTextService.transcribe).toHaveBeenCalledTimes(1)
    })

    it('requires an authenticated plugin request principal', async () => {
        const speechToTextService = {
            transcribe: jest.fn()
        }
        const xpertPrincipalService = {
            ensurePrincipalUserByXpertId: jest.fn()
        }
        const service = new PluginSpeechToTextPermissionService(
            speechToTextService as unknown as SpeechToTextService,
            xpertPrincipalService as unknown as XpertPrincipalService
        )

        await expect(
            service.transcribe({
                xpertId: 'xpert-1',
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                file: {
                    data: new Uint8Array([1, 2, 3]),
                    originalName: 'voice.wav',
                    mimeType: 'audio/wav'
                }
            })
        ).rejects.toThrow('speech_to_text_principal_required')
        expect(speechToTextService.transcribe).not.toHaveBeenCalled()
        expect(xpertPrincipalService.ensurePrincipalUserByXpertId).not.toHaveBeenCalled()
    })
})

function runInPluginContext<T>(callback: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        runWithPluginRequestContext(
            {
                headers: {
                    'tenant-id': 'tenant-1',
                    'organization-id': 'org-1',
                    'x-scope-level': 'organization'
                },
                user: {
                    id: 'integration-user-1',
                    tenantId: 'tenant-1',
                    apiKey: {
                        token: 'integration-webhook:integration-1',
                        type: 'integration',
                        entityId: 'integration-1',
                        tenantId: 'tenant-1',
                        organizationId: 'org-1'
                    },
                    ownerUserId: 'integration-owner-1',
                    apiKeyUserId: 'integration-user-1',
                    principalType: 'api_key'
                } as never
            },
            {},
            () => {
                callback().then(resolve).catch(reject)
            }
        )
    })
}
