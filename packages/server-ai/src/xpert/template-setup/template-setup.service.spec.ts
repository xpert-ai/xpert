import { Test } from '@nestjs/testing'
import { CommandBus } from '@nestjs/cqrs'
import { ForbiddenException } from '@nestjs/common'
import { AssistantTemplateSetupService } from './template-setup.service'
import { AssistantTemplateSetupCommand } from './template-setup.command'
import { PublishedXpertAccessService } from '../published-xpert-access.service'
import { AssistantUserPreferenceService } from '../assistant-user-preference.service'
import type { AssistantTemplateSetupState } from '@xpert-ai/contracts'

describe('per-user Assistant template setup', () => {
    let service: AssistantTemplateSetupService
    let state: AssistantTemplateSetupState | null
    const published = { getAccessiblePublishedXpertForCurrentUser: jest.fn() }
    const preferences = { getDomain: jest.fn(), compareAndSetDomain: jest.fn() }
    const commands = { execute: jest.fn() }
    beforeAll(async () => {
        const module = await Test.createTestingModule({
            providers: [
                AssistantTemplateSetupService,
                { provide: PublishedXpertAccessService, useValue: published },
                { provide: AssistantUserPreferenceService, useValue: preferences },
                { provide: CommandBus, useValue: commands }
            ]
        }).compile()
        service = module.get(AssistantTemplateSetupService)
    })
    beforeEach(() => {
        jest.clearAllMocks()
        state = null
        published.getAccessiblePublishedXpertForCurrentUser.mockResolvedValue({
            id: 'assistant',
            options: {
                templateDefinition: {
                    manifest: {
                        schemaVersion: 2,
                        version: '1',
                        onboarding: {
                            skill: 'setup',
                            required: true,
                            preferences: ['language', 'timezone'],
                            completionCriteria: 'Produce a welcome plan'
                        },
                        connectors: [
                            {
                                key: 'calendar',
                                provider: 'calendar',
                                required: true,
                                purpose: 'Read calendar',
                                permissions: []
                            }
                        ]
                    }
                }
            }
        })
        preferences.getDomain.mockImplementation(async () => state)
        preferences.compareAndSetDomain.mockImplementation(async (_id, _domain, _previous, next) => {
            state = structuredClone(next)
        })
        commands.execute.mockResolvedValue({ connectors: [], managementUrl: undefined })
    })
    it('persists partial preferences and resumes without marking onboarding complete', async () => {
        await service.execute(
            new AssistantTemplateSetupCommand('assistant', { revision: 0, preferences: { language: 'zh' } })
        )
        const next = await service.execute(new AssistantTemplateSetupCommand('assistant'))
        expect(next.state).toMatchObject({ revision: 1, preferences: { language: 'zh' } })
        expect(next.state.completedAt).toBeUndefined()
    })
    it('requires all preferences and a first result before completing', async () => {
        await expect(
            service.execute(new AssistantTemplateSetupCommand('assistant', { revision: 0, firstResult: 'Welcome' }))
        ).rejects.toThrow()
        expect(preferences.compareAndSetDomain).not.toHaveBeenCalled()
        const done = await service.execute(
            new AssistantTemplateSetupCommand('assistant', {
                revision: 0,
                preferences: { language: 'zh', timezone: 'Asia/Shanghai' },
                firstResult: 'Welcome plan'
            })
        )
        expect(done.state.completedAt).toBeDefined()
        expect(done.state.firstResult).toBe('Welcome plan')
        const reopened = await service.execute(new AssistantTemplateSetupCommand('assistant'))
        expect(reopened.state.completedAt).toBe(done.state.completedAt)
    })
    it('rejects stale revisions and undeclared preferences', async () => {
        await service.execute(
            new AssistantTemplateSetupCommand('assistant', { revision: 0, preferences: { language: 'zh' } })
        )
        await expect(
            service.execute(
                new AssistantTemplateSetupCommand('assistant', { revision: 0, preferences: { language: 'en' } })
            )
        ).rejects.toThrow()
        await expect(
            service.execute(
                new AssistantTemplateSetupCommand('assistant', { revision: 1, preferences: { token: 'unaccepted' } })
            )
        ).rejects.toThrow()
        expect(state.preferences).toEqual({ language: 'zh' })
    })
    it('cannot skip required connections or bind an unavailable account', async () => {
        await expect(
            service.execute(
                new AssistantTemplateSetupCommand('assistant', {
                    revision: 0,
                    connector: { key: 'calendar', selection: { choice: 'skip' } }
                })
            )
        ).rejects.toThrow()
        await expect(
            service.execute(
                new AssistantTemplateSetupCommand('assistant', {
                    revision: 0,
                    connector: { key: 'calendar', selection: { choice: 'binding', bindingId: 'foreign' } }
                })
            )
        ).rejects.toThrow()
        expect(preferences.compareAndSetDomain).not.toHaveBeenCalled()
    })
    it('checks published Assistant authorization before reading or saving user state', async () => {
        published.getAccessiblePublishedXpertForCurrentUser.mockRejectedValue(new ForbiddenException())
        await expect(service.execute(new AssistantTemplateSetupCommand('other'))).rejects.toThrow(ForbiddenException)
        expect(preferences.getDomain).not.toHaveBeenCalled()
    })
})
