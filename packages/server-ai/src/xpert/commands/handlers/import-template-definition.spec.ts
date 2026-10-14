jest.mock('@xpert-ai/plugin-sdk', () => ({ RequestContext: jest.requireMock('@xpert-ai/server-core').RequestContext }))

jest.mock('../../types', () => ({
    XpertNameInvalidException: class XpertNameInvalidException extends Error {}
}))

jest.mock('../../xpert.service', () => ({
    XpertService: class XpertService {}
}))

jest.mock('../../../xpert-agent/xpert-agent.service', () => ({
    XpertAgentService: class XpertAgentService {}
}))

jest.mock('@xpert-ai/server-core', () => ({
    RequestContext: {
        getLanguageCode: jest.fn().mockReturnValue('en'),
        currentTenantId: jest.fn().mockReturnValue('tenant-1'),
        getOrganizationId: jest.fn().mockReturnValue('org-1'),
        currentUserId: jest.fn().mockReturnValue('user-1')
    },
    normalizePluginName: (value: string) => {
        const lastAt = value.lastIndexOf('@')
        return lastAt > 0 ? value.slice(0, lastAt) : value
    }
}))

jest.mock('i18next', () => ({
    t: jest.fn((key: string, options?: { scope?: string }) => {
        if (key === 'server-ai:Error.ManagedImportRequiresPrimaryLlmModel') {
            return `Managed xpert import requires an enabled primary LLM copilot model for ${options?.scope}.`
        }
        if (key === 'server-ai:Error.CurrentOrganizationScope') {
            return 'the current organization'
        }
        if (key === 'server-ai:Error.TenantScope') {
            return 'tenant scope'
        }
        if (key === 'server-ai:Error.PrimaryAgentNotFound') {
            return 'Primary agent node not found'
        }

        return key
    })
}))

import { XpertImportHandler } from './import.handler'
import { XpertImportCommand } from '../import.command'
import { XpertDraftDslDTO } from '../../dto'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import {
    PrepareAssistantDefinitionCommand,
    InstallAssistantDefinitionDependenciesCommand
} from '../../../plugin-resource/template-installation/template-readiness.command'

import { Test } from '@nestjs/testing'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { I18nService } from 'nestjs-i18n'
import { XpertService } from '../../xpert.service'
import { XpertAgentService } from '../../../xpert-agent/xpert-agent.service'

describe('Portable Assistant import', () => {
    const i18n = {
        t: jest.fn().mockResolvedValue('Name invalid')
    }

    const buildHandler = async (overrides: { getSandboxProviders?: () => Promise<{ type: string }[]> } = {}) => {
        const xpertService = {
            create: jest.fn().mockResolvedValue({
                id: 'new-xpert',
                name: 'Imported Expert',
                slug: 'imported-expert',
                agent: {
                    id: 'agent-new',
                    key: 'Agent_new',
                    name: 'Imported Expert'
                }
            }),
            validateName: jest.fn().mockResolvedValue(true),
            getSandboxProviders: jest.fn().mockResolvedValue([]),
            saveDraft: jest.fn().mockImplementation(async (_id, draft) => draft),
            createBulkMemories: jest.fn().mockResolvedValue(undefined),
            repository: {
                findOne: jest.fn(),
                update: jest.fn().mockResolvedValue(undefined)
            },
            ...overrides
        }
        const queryBus = {
            execute: jest.fn().mockResolvedValue([])
        }
        const xpertAgentService = {
            getMiddlewareStrategies: jest.fn().mockReturnValue([])
        }
        const commands = { execute: jest.fn() }

        const module = await Test.createTestingModule({
            providers: [
                XpertImportHandler,
                { provide: XpertService, useValue: xpertService },
                { provide: I18nService, useValue: i18n },
                { provide: QueryBus, useValue: queryBus },
                { provide: XpertAgentService, useValue: xpertAgentService },
                { provide: CommandBus, useValue: commands }
            ]
        }).compile()
        return { module, xpertService, commands, handler: module.get(XpertImportHandler) }
    }

    it('ordinary v2 import recomputes locks, binds dependencies and retains the server sandbox', async () => {
        const { module, handler, xpertService, commands } = await buildHandler({
            getSandboxProviders: jest.fn().mockResolvedValue([{ type: 'local-shell-sandbox' }, { type: 'nsjail' }])
        })
        const draft: Partial<XpertDraftDslDTO> = {
            template: {
                schemaVersion: 2,
                dependencies: { skills: [{ pluginName: '@test/office', componentKey: 'ledger' }] }
            },
            team: {
                name: 'Imported Expert',
                type: XpertTypeEnum.Agent,
                agent: { key: 'Agent_imported', name: 'Imported Expert' },
                features: {
                    sandbox: { enabled: true },
                    opener: { enabled: false, message: '', questions: [] },
                    suggestion: { enabled: false, prompt: '' },
                    textToSpeech: { enabled: false },
                    speechToText: { enabled: false }
                },
                options: {
                    templateDependencyLocks: [{ pluginName: '@untrusted/package', version: 'forged', components: [] }]
                }
            },
            nodes: [
                {
                    type: 'agent',
                    key: 'Agent_imported',
                    position: { x: 0, y: 0 },
                    entity: { key: 'Agent_imported', name: 'Imported Expert' }
                }
            ],
            connections: []
        }
        const locks = [{ pluginName: '@test/office', version: '1', components: [] }]
        commands.execute.mockImplementation(async (command) =>
            command instanceof PrepareAssistantDefinitionCommand
                ? { definition: { template: draft.template }, locks }
                : undefined
        )
        await handler.execute(new XpertImportCommand(draft))
        expect(xpertService.create).toHaveBeenCalledWith(
            expect.objectContaining({
                features: expect.objectContaining({ sandbox: { enabled: true, provider: 'nsjail' } }),
                options: { templateDefinition: draft.template, templateDependencyLocks: locks }
            })
        )
        expect(
            commands.execute.mock.calls.some(
                ([command]) => command instanceof InstallAssistantDefinitionDependenciesCommand
            )
        ).toBe(true)
        expect(xpertService.saveDraft.mock.calls[0][1]).not.toHaveProperty('template')
        await module.close()
    })
})
