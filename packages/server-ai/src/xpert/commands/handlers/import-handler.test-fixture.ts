jest.mock('@xpert-ai/plugin-sdk', () => ({ RequestContext: jest.requireMock('@xpert-ai/server-core').RequestContext }))
import { BadRequestException } from '@nestjs/common'

jest.mock('@xpert-ai/contracts', () => ({
    AiModelTypeEnum: {
        LLM: 'llm',
        TEXT_EMBEDDING: 'text-embedding',
        RERANK: 'rerank',
        SPEECH2TEXT: 'speech2text',
        TTS: 'tts'
    },
    AiProviderRole: {
        Primary: 'primary'
    },
    DEFAULT_XPERT_WORKSPACE_DATA_SCOPE: 'shared',
    FetchFrom: {
        CUSTOMIZABLE_MODEL: 'customizable-model'
    },
    ModelFeature: {
        VISION: 'vision'
    },
    LongTermMemoryTypeEnum: {
        QA: 'qa'
    },
    WorkflowNodeTypeEnum: {
        MIDDLEWARE: 'middleware',
        KNOWLEDGE_BASE: 'knowledge-base'
    },
    XpertTypeEnum: {
        Agent: 'agent'
    },
    convertToUrlPath: (value: string) => value?.trim().toLowerCase().replace(/\s+/g, '-'),
    mapTranslationLanguage: (value: string) => value,
    resolveI18nText: (value: unknown, language = 'en-US') => {
        if (typeof value === 'string') {
            return value.trim() || null
        }
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return null
        }

        const preferredKeys = language.toLowerCase().startsWith('zh')
            ? [language, language.replace(/-/g, '_'), 'zh_Hans', 'en_US']
            : [language, language.replace(/-/g, '_'), 'en_US', 'zh_Hans']
        for (const key of preferredKeys) {
            const candidate = Reflect.get(value, key)
            if (typeof candidate === 'string' && candidate.trim()) {
                return candidate.trim()
            }
        }
        return null
    },
    omitXpertRelations: (xpert: Record<string, any>) => {
        const { agent, agents, toolsets, knowledgebases, ...rest } = xpert
        return rest
    },
    replaceAgentInDraft: (draft: Record<string, any>, sourceKey: string, agent: Record<string, any>) => ({
        ...draft,
        team: {
            ...(draft.team ?? {}),
            agent: {
                ...(draft.team?.agent ?? {}),
                ...agent,
                key: agent.key
            }
        },
        nodes: (draft.nodes ?? []).map((node: Record<string, any>) =>
            node.type === 'agent' && node.key === sourceKey
                ? {
                      ...node,
                      key: agent.key,
                      entity: {
                          ...(node.entity ?? {}),
                          ...agent,
                          key: agent.key
                      }
                  }
                : node
        ),
        connections: (draft.connections ?? []).map((connection: Record<string, any>) => {
            const from = connection.from === sourceKey ? agent.key : connection.from
            const to = connection.to === sourceKey ? agent.key : connection.to

            return from === connection.from && to === connection.to
                ? connection
                : {
                      ...connection,
                      from,
                      to,
                      key: `${from}/${to}`
                  }
        })
    })
}))

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
        if (key === 'server-ai:Error.ManagedImportRequiresLlmSelection') {
            return `Choose an authorized language model for this import, or configure an authorized default.`
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
import { CopilotOneByRoleQuery, FindCopilotModelsQuery } from '../../../copilot/queries'
import { AiModelTypeEnum, AiProviderRole, WorkflowNodeTypeEnum, XpertTypeEnum } from '@xpert-ai/contracts'
import type { IWFNMiddleware } from '@xpert-ai/contracts'

const i18n = {
    t: jest.fn().mockResolvedValue('Name invalid')
}

export const buildHandler = (overrides: Record<string, any> = {}) => {
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

    return {
        xpertService,
        queryBus,
        xpertAgentService,
        handler: new XpertImportHandler(
            xpertService as never,
            i18n as never,
            queryBus as never,
            xpertAgentService as never,
            { execute: jest.fn() }
        )
    }
}

export {
    BadRequestException,
    XpertImportCommand,
    CopilotOneByRoleQuery,
    FindCopilotModelsQuery,
    AiModelTypeEnum,
    AiProviderRole,
    WorkflowNodeTypeEnum,
    XpertTypeEnum
}
export type { XpertDraftDslDTO, IWFNMiddleware }
