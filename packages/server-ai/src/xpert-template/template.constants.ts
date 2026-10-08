import type { ISkillMarketFilterGroups } from '@xpert-ai/contracts'
export const builtinTemplatePath = 'packages/server-ai/src/xpert-template'
export const fallbackLanguage = 'en-US'
export const templateDirectoryName = 'xpert-template'
export const exportedXpertTemplateCategory = 'Xpert'
export const templateDirectories = ['templates', 'pipelines', 'skill-packages'] as const
export const templateFiles = [
    'templates.json',
    'mcp-templates.json',
    'knowledge-pipelines.json',
    'skills-market.yaml',
    'skill-repositories.yaml',
    'workspace-defaults.yaml'
] as const
export const builtinTemplateFiles = [...templateFiles, 'templates-market.yaml'] as const

export const DEFAULT_SKILL_MARKET_FILTERS: ISkillMarketFilterGroups = {
    roles: {
        label: 'Roles',
        options: []
    },
    appTypes: {
        label: 'Application types',
        options: []
    },
    hot: {
        label: 'Trending',
        options: []
    }
}

export const TEMPLATE_SKILL_BUNDLE_MANIFEST_FILE = 'bundle.yaml'
export const TEMPLATE_SKILL_BUNDLE_SEPARATOR = '__'
export const TEMPLATE_SKILL_BUNDLE_SHARED_PREFIX = 'template-bundle'
export const TEMPLATE_SKILL_BUNDLE_SKILL_FILE = 'SKILL.md'
export const TEMPLATE_SKILL_BUNDLE_LOCAL_PROVIDER = 'local'
export const TEMPLATE_SKILL_BUNDLE_LOCAL_REPOSITORY = 'root/skills'
