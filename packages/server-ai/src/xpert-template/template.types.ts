import type {
    ISkillMarketFeaturedRef,
    ISkillMarketFilterGroups,
    ISkillRepository,
    ISkillRepositoryIndex,
    IXpert
} from '@xpert-ai/contracts'
import type { TXpertTemplateDescriptor } from './plugin-template-descriptor'
export type TXpertTemplateGroup = {
    categories?: string[]
    recommendedApps: TXpertTemplateDescriptor[]
}

export type TXpertTemplatesCatalog = {
    templates: Record<string, TXpertTemplateGroup>
    details: Record<string, TXpertTemplateDescriptor>
}

export type TTemplateMarketRef = {
    id: string
}

export type TTemplateMarketConfig = {
    recommendedApps: TTemplateMarketRef[]
}

export type TLocalizedTemplates<T> = Record<string, { categories?: string[]; templates: T[] }>

export type TSkillMarketLocaleConfig = {
    featured: ISkillMarketFeaturedRef[]
    filters: ISkillMarketFilterGroups
}

export type TLocalizedSkillMarketCatalog = Record<string, TSkillMarketLocaleConfig>

export type TDefaultSkillRepositoryEntry = Pick<ISkillRepository, 'name' | 'provider'> &
    Partial<Pick<ISkillRepository, 'options' | 'credentials'>>

export type TDefaultSkillRepositoriesConfig = {
    repositories: TDefaultSkillRepositoryEntry[]
}

export type TWorkspaceDefaultSkillRef = {
    provider: string
    repositoryName: string
    skillId: string
}

export type TWorkspaceDefaultsConfig = {
    userDefault: {
        skills: TWorkspaceDefaultSkillRef[]
    }
}

export type TResolvedSkillRef = {
    ref: TWorkspaceDefaultSkillRef
    skill: ISkillRepositoryIndex
}

export type TTemplateSkillBundle = {
    ref: TWorkspaceDefaultSkillRef
    directoryName: string
    directoryPath: string
    sharedSkillId: string
}

export type TExportXpertTemplateInput = {
    xpert: Pick<IXpert, 'id' | 'name' | 'title' | 'description' | 'avatar' | 'type'>
    dslYaml: string
    isDraft: boolean
    includeMemory: boolean
}

export type TXpertTemplateQuery = {
    targetApp?: string
    templateType?: string
    locale?: string
}
