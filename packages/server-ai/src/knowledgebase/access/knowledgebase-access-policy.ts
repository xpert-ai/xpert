import { ForbiddenException } from '@nestjs/common'
import { t } from 'i18next'

import { FindOptionsSelect, FindOneOptions } from 'typeorm'
import { Knowledgebase } from '../persistence/knowledgebase.entity'

export const KNOWLEDGEBASE_DETAIL_RELATIONS = [
    'copilotModel',
    'chatModel',
    'wikiModel',
    'rerankModel',
    'visionModel',
    'xperts',
    'pipeline'
]

export const KNOWLEDGEBASE_SAFE_READ_RELATIONS = new Set(['createdBy'])

export function knowledgebaseAccessDenied() {
    return new ForbiddenException(
        t('server-ai:Error.KnowledgebaseAccessDenied', {
            defaultValue: 'You do not have access to this knowledgebase'
        })
    )
}

export const KNOWLEDGEBASE_MODEL_DETAIL_SELECT = {
    id: true,
    modelType: true,
    model: true,
    copilotId: true,
    referencedId: true,
    options: true
}

export const KNOWLEDGEBASE_DETAIL_SELECT: FindOptionsSelect<Knowledgebase> = {
    keywordAnalyzer: true,
    keywordAnalyzerLocked: true,
    id: true,
    name: true,
    type: true,
    vectorStore: true,
    faqConfig: true,
    wikiConfig: true,
    wikiStatus: true,
    wikiAvailability: true,
    structure: true,
    language: true,
    avatar: true,
    description: true,
    applicationTags: true,
    automaticTagging: true,
    permission: true,
    copilotModelId: true,
    chatModelId: true,
    wikiModelId: true,
    rerankModelId: true,
    visionModelId: true,
    documentNum: true,
    tokenNum: true,
    chunkNum: true,
    recall: true,
    parserConfig: true,
    status: true,
    embeddingRebuildError: true,
    metadataSchema: true,
    apiEnabled: true,
    incrementalSyncEnabled: true,
    graphRag: true,
    graphStatus: true,
    graphRevision: true,
    graphIndexError: true,
    workspaceId: true,
    pipelineId: true,
    integrationId: true,
    copilotModel: KNOWLEDGEBASE_MODEL_DETAIL_SELECT,
    chatModel: KNOWLEDGEBASE_MODEL_DETAIL_SELECT,
    wikiModel: KNOWLEDGEBASE_MODEL_DETAIL_SELECT,
    rerankModel: KNOWLEDGEBASE_MODEL_DETAIL_SELECT,
    visionModel: KNOWLEDGEBASE_MODEL_DETAIL_SELECT,
    xperts: {
        id: true,
        slug: true,
        name: true,
        description: true
    },
    pipeline: {
        id: true,
        publishAt: true,
        version: true,
        graph: true
    }
}

export type KnowledgebaseAccessSelect = {
    options?: FindOneOptions<Knowledgebase>
    addedCreatedById: boolean
    addedPermission: boolean
}

export type KnowledgebaseWriteAccessSelect = {
    options?: FindOneOptions<Knowledgebase>
    addedWorkspaceId: boolean
    addedCreatedById: boolean
}

export function addKnowledgebaseWriteAccessSelect(
    options?: FindOneOptions<Knowledgebase>
): KnowledgebaseWriteAccessSelect {
    if (!options?.select) {
        return { options, addedWorkspaceId: false, addedCreatedById: false }
    }

    if (Array.isArray(options.select)) {
        const selectedFields = options.select as string[]
        const addedWorkspaceId = !selectedFields.includes('workspaceId')
        const addedCreatedById = !selectedFields.includes('createdById')
        return {
            options: {
                ...options,
                select: [
                    ...selectedFields,
                    ...(addedWorkspaceId ? ['workspaceId'] : []),
                    ...(addedCreatedById ? ['createdById'] : [])
                ] as FindOneOptions<Knowledgebase>['select']
            },
            addedWorkspaceId,
            addedCreatedById
        }
    }

    const addedWorkspaceId = options.select.workspaceId !== true
    const addedCreatedById = options.select.createdById !== true
    return {
        options: {
            ...options,
            select: {
                ...options.select,
                workspaceId: true,
                createdById: true
            }
        },
        addedWorkspaceId,
        addedCreatedById
    }
}

export function stripKnowledgebaseWriteAccessSelect(
    knowledgebase: Knowledgebase,
    accessSelect: KnowledgebaseWriteAccessSelect
): Knowledgebase {
    if (!accessSelect.addedWorkspaceId && !accessSelect.addedCreatedById) {
        return knowledgebase
    }

    const result = { ...knowledgebase }
    if (accessSelect.addedWorkspaceId) {
        delete result.workspaceId
    }
    if (accessSelect.addedCreatedById) {
        delete result.createdById
    }
    return result
}

export function addKnowledgebaseAccessSelect(options?: FindOneOptions<Knowledgebase>): KnowledgebaseAccessSelect {
    if (!options?.select) {
        return { options, addedCreatedById: false, addedPermission: false }
    }

    if (Array.isArray(options.select)) {
        const selectedFields = options.select as string[]
        const addedCreatedById = !selectedFields.includes('createdById')
        const addedPermission = !selectedFields.includes('permission')
        return {
            options: {
                ...options,
                select: [
                    ...selectedFields,
                    ...(addedCreatedById ? ['createdById'] : []),
                    ...(addedPermission ? ['permission'] : [])
                ] as FindOneOptions<Knowledgebase>['select']
            },
            addedCreatedById,
            addedPermission
        }
    }

    const addedCreatedById = options.select.createdById !== true
    const addedPermission = options.select.permission !== true
    return {
        options: {
            ...options,
            select: {
                ...options.select,
                createdById: true,
                permission: true
            }
        },
        addedCreatedById,
        addedPermission
    }
}

export function stripKnowledgebaseAccessSelect(
    knowledgebase: Knowledgebase,
    accessSelect: KnowledgebaseAccessSelect
): Knowledgebase {
    if (!accessSelect.addedCreatedById && !accessSelect.addedPermission) {
        return knowledgebase
    }

    const result = { ...knowledgebase }
    if (accessSelect.addedCreatedById) {
        delete result.createdById
    }
    if (accessSelect.addedPermission) {
        delete result.permission
    }
    return result
}
