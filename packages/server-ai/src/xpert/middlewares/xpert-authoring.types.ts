import { AiModelTypeEnum, I18nObject, ISkillPackage, ModelFeature, TAgentMiddlewareMeta, TAvatar } from '@metad/contracts'

export const Icon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-bot-icon lucide-bot"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>`

export type AuthoringToolName = 'newXpert' | 'editXpert'
export type AuthoringCatalogStatus = 'available' | 'rejected'
export type AuthoringConflictType = 'unsaved-local' | 'stale-server'

export class AssistantDraftConflictError extends Error {
    readonly name = 'AssistantDraftConflictError'

    constructor(
        readonly toolName: AuthoringToolName,
        readonly conflictType: AuthoringConflictType,
        message: string,
        readonly requiresRefresh: boolean,
        readonly committedDraftHash: string | null
    ) {
        super(message)
        Object.setPrototypeOf(this, new.target.prototype)
    }
}

export type AssistantDraftMutationResult = {
    status: 'applied' | 'rejected' | 'conflict'
    toolName: AuthoringToolName
    summary: string
    diagnostics?: AuthoringDiagnostic[] | null
    syncMode: 'none' | 'refresh'
    conflictType: AuthoringConflictType | null
    requiresRefresh: boolean
    committedDraftHash: string | null
    updatedDraftFragment: Record<string, unknown> | null
    dslYaml?: string | null
    warnings: string[]
}

export type CurrentXpertDslResult = {
    xpertId: string | null
    dslYaml: string | null
    summary: string
    committedDraftHash?: string | null
}

export type AuthoringDiagnostic = {
    kind: 'request' | 'yaml' | 'model' | 'validation' | 'import'
    source?: 'structure' | 'checklist' | 'catalog' | null
    message: string
}

export type AuthoringCatalogResult<T> = {
    status: AuthoringCatalogStatus
    summary: string
    total: number
    workspaceId?: string | null
    items: T[]
}

export type AgentMiddlewareCatalogItem = {
    name: string
    label?: I18nObject
    description?: I18nObject
    icon?: TAgentMiddlewareMeta['icon']
    configSchema?: TAgentMiddlewareMeta['configSchema']
}

export type ToolsetCatalogItem = {
    id: string
    name: string
    category?: string | null
    type?: string | null
    description?: string | null
    tags: string[]
    avatar?: TAvatar
}

export type KnowledgebaseCatalogItem = {
    id: string
    name: string
    description?: string | null
    status?: string | null
    permission?: string | null
    language?: string | null
    avatar?: TAvatar
}

export type SkillCatalogItem = {
    id: string | null
    name: string | null
    version: string | null
    summary: string | null
    visibility: ISkillPackage['visibility'] | null
}

export type CopilotModelCatalogItem = {
    copilotId: string
    provider: string | null
    modelType: AiModelTypeEnum
    model: string
    label: string | null
    features?: ModelFeature[] | null
    isCurrentProvider: boolean
    isCurrentModel: boolean
}

export type CopilotModelCatalogResult = AuthoringCatalogResult<CopilotModelCatalogItem> & {
    currentCopilotId: string | null
    currentProvider: string | null
    currentModelId: string | null
}

export type CopilotModelCatalogSnapshot = {
    targetXpertId: string | null
    currentCopilotId: string | null
    currentProvider: string | null
    currentModelId: string | null
    availableModelIds: string[]
    items?: CopilotModelCatalogItem[] | null
}

export type AuthoringAssistantRequestContext = {
    workspaceId?: string
    env?: Record<string, unknown>
    targetXpertId?: string
    unsaved?: boolean
    baseDraftHash?: string
}

export type AuthoringAssistantState = {
    xpertId?: string | null
    baseDraftHash?: string | null
    copilotModelCatalogTargetXpertId?: string | null
    copilotModelCatalogCurrentCopilotId?: string | null
    copilotModelCatalogCurrentProvider?: string | null
    copilotModelCatalogCurrentModelId?: string | null
    copilotModelCatalogAvailableModelIds?: string[] | null
    copilotModelCatalogItems?: CopilotModelCatalogItem[] | null
}

export type NewXpertPayload = {
    userIntent: string
    templateId?: string
    xpertName?: string
}

export type EditXpertPayload = {
    dslYaml: string
}

export type AuthoringAssistantEffect = {
    name: 'navigate_to_studio' | 'refresh_studio'
    data: {
        xpertId: string
    }
}
