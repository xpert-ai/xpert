import { type PluginResourceComponentSelector } from '@cloud/app/@core/state'
import {
  I18nObject,
  ICopilotModel,
  ISkillPackage,
  IXpert,
  IXpertToolset,
  IXpertWorkspace,
  TAgentMiddlewareMeta,
  TKnowledgePipelineTemplate,
  TXpertTemplate,
  WorkflowNodeTypeEnum,
  XpertTypeEnum
} from '../../../../@core'
import { BlankRepositoryDefaultSelection, BlankWorkflowStarterNodeKey } from './blank-draft.util'
import { BlankTemplateChoice } from './blank-template-selection.component'
import { BlankTemplateToolsetResolution, BlankXpertStartMode } from './blank-template.util'
import { BlankXpertCompletionMode, BlankXpertMode } from './blank-wizard.util'

export type BlankWorkflowNodeOption = {
  key: BlankWorkflowStarterNodeKey
  type: WorkflowNodeTypeEnum
  labelKey: string
  defaultLabel: string
}

export type BlankTemplateCatalog = {
  choices: BlankTemplateChoice[]
  items: Array<Omit<TXpertTemplate, 'export_data'> | TKnowledgePipelineTemplate>
}

export type BlankWorkspaceSkillItem = {
  id: string
  label: string | I18nObject
  summary?: string | I18nObject | null
  repositoryId?: string | null
  repositoryName?: string | null
  repositoryProvider?: string | null
}

export type BlankMiddlewareProviderOption = {
  meta: TAgentMiddlewareMeta
  unavailable?: boolean
}

export type BlankSkillState = {
  loading: boolean
  skills: BlankWorkspaceSkillItem[]
  errorMessage: string | null
}

export type BlankTemplatePluginSkillDependencyGroup = {
  pluginName: string
  components: PluginResourceComponentSelector[]
}

export type BlankTemplatePluginSkillBinding = {
  pluginName: string
  componentKey: string
  runtimeId: string
  targetAgentKey?: string
}

export type BlankTemplateToolsetDependency = {
  pluginName: string
  provider: string
  templateNodeKey: string
  targetAgentKey?: string
  instanceName?: string
}

export type BlankTemplateToolsetPreparation = {
  key: string
  resolutions: BlankTemplateToolsetResolution[]
}

export type BlankTemplateToolsetSelectionState = {
  key: string
  dependency: BlankTemplateToolsetDependency
  loading: boolean
  toolsets: IXpertToolset[]
  selectedToolsetId: string | null
  errorMessage: string | null
}

export type BlankXpertWizardStatus = 'created' | 'published'

export type BlankXpertWizardResult = {
  xpert: IXpert
  status: BlankXpertWizardStatus
}

export const BLANK_XPERT_DIALOG_CATEGORY = {
  CLAW: 'claw'
} as const

export type BlankXpertDialogCategory = (typeof BLANK_XPERT_DIALOG_CATEGORY)[keyof typeof BLANK_XPERT_DIALOG_CATEGORY]

export function normalizeBlankXpertDialogCategory(
  category: string | null | undefined
): BlankXpertDialogCategory | null {
  const value = category?.trim().toLowerCase()

  switch (value) {
    case BLANK_XPERT_DIALOG_CATEGORY.CLAW:
      return value
    default:
      return null
  }
}

export type BlankXpertDialogData = {
  workspace?: IXpertWorkspace | null
  type?: XpertTypeEnum | null
  allowWorkspaceSelection?: boolean
  allowedModes?: BlankXpertMode[] | null
  completionMode?: BlankXpertCompletionMode
  category?: BlankXpertDialogCategory | null
  defaultCopilotModel?: ICopilotModel | null
  initialStartMode?: BlankXpertStartMode
  initialTemplateId?: string | null
  lockStartMode?: boolean
  lockType?: boolean
  skipTemplateSelectionStep?: boolean
}

export type DraftPreparationResult = {
  xpert: IXpert
  draftSaved: boolean
  hasBlockingChecklist: boolean
  preparationFailed: boolean
}

export const XPERT_AUTO_PUBLISH_RELEASE_NOTES = 'Initial Xpert bootstrap release.'

export const EMPTY_BLANK_SKILL_STATE: BlankSkillState = {
  loading: false,
  skills: [],
  errorMessage: null
}

export const CLAWXPERT_PRIMARY_AGENT_PROMPT_TEMPLATE = [
  'When available, use the following runtime preference context to guide how you respond.',
  '',
  'Assistant soul:',
  '{{sys.soul}}',
  '',
  'User profile:',
  '{{sys.profile}}',
  '',
  'Treat the assistant soul as behavior guidance and use the user profile to personalize responses when relevant.'
].join('\n')

export const UNAVAILABLE_TEMPLATE_MIDDLEWARE_DESCRIPTION: I18nObject = {
  en_US:
    'This middleware comes from the selected template, but is not available in the current runtime. Keep it selected to preserve it in the imported draft, or deselect it to remove it.',
  zh_Hans: '该中间件来自所选模板，但当前运行时不可用。保留勾选会继续带入导入草稿，取消勾选会将其移除。'
}

export const WORKFLOW_ACTION_NODE_OPTIONS: BlankWorkflowNodeOption[] = [
  {
    key: 'knowledge',
    type: WorkflowNodeTypeEnum.KNOWLEDGE,
    labelKey: 'XP.Workflow.KnowledgeRetrieval',
    defaultLabel: 'Knowledge Retrieval'
  },
  {
    key: 'http',
    type: WorkflowNodeTypeEnum.HTTP,
    labelKey: 'XP.Workflow.HTTPRequest',
    defaultLabel: 'HTTP Request'
  },
  {
    key: 'code',
    type: WorkflowNodeTypeEnum.CODE,
    labelKey: 'XP.Workflow.CodeExecution',
    defaultLabel: 'Code Execution'
  }
]

export const WORKFLOW_TRANSFORM_NODE_OPTIONS: BlankWorkflowNodeOption[] = [
  {
    key: 'template',
    type: WorkflowNodeTypeEnum.TEMPLATE,
    labelKey: 'XP.Workflow.TemplateTransform',
    defaultLabel: 'Template Transform'
  },
  {
    key: 'assigner',
    type: WorkflowNodeTypeEnum.ASSIGNER,
    labelKey: 'XP.Workflow.VariableAssigner',
    defaultLabel: 'Variable Assigner'
  },
  {
    key: 'json-parse',
    type: WorkflowNodeTypeEnum.JSON_PARSE,
    labelKey: 'XP.Workflow.JSONParse',
    defaultLabel: 'JSON Parse'
  },
  {
    key: 'json-stringify',
    type: WorkflowNodeTypeEnum.JSON_STRINGIFY,
    labelKey: 'XP.Workflow.JSONStringify',
    defaultLabel: 'JSON Stringify'
  },
  {
    key: 'answer',
    type: WorkflowNodeTypeEnum.ANSWER,
    labelKey: 'XP.Workflow.Answer',
    defaultLabel: 'Answer'
  }
]

export type BlankAgentSkillSelections = {
  skills: string[]
  repositoryDefault: BlankRepositoryDefaultSelection | null
  middlewares: string[]
  middlewareRequired?: Record<string, boolean>
  preserveSkillsMiddleware?: boolean
}

export function cloneRepositoryDefaultSelection(
  selection: BlankRepositoryDefaultSelection | null
): BlankRepositoryDefaultSelection | null {
  if (!selection) {
    return null
  }

  return {
    repositoryId: selection.repositoryId,
    disabledSkillIds: [...selection.disabledSkillIds]
  }
}

export function buildBlankWorkspaceSkillState(skills: ISkillPackage[]): BlankSkillState {
  return {
    loading: false,
    skills: skills.map((skill) => ({
      id: skill.id,
      label:
        skill.metadata?.displayName ??
        normalizeI18nCandidate(skill.name) ??
        skill.metadata?.name ??
        skill.skillIndex?.name ??
        skill.skillIndex?.skillId ??
        skill.id,
      summary:
        skill.metadata?.summary ??
        skill.metadata?.description ??
        normalizeI18nCandidate(skill.metadata?.description) ??
        skill.skillIndex?.description ??
        null,
      repositoryId: skill.skillIndex?.repositoryId ?? skill.skillIndex?.repository?.id ?? null,
      repositoryName: skill.skillIndex?.repository?.name ?? null,
      repositoryProvider: skill.skillIndex?.repository?.provider ?? null
    })),
    errorMessage: null
  }
}

export function collectI18nTextValues(value: unknown): string[] {
  if (typeof value === 'string') {
    return value.trim() ? [value] : []
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return []
  }

  return Object.values(value).filter((item): item is string => typeof item === 'string' && !!item.trim())
}

export function normalizeSearchText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function matchesMiddlewareSearch(provider: BlankMiddlewareProviderOption, search: string) {
  const normalizedSearch = normalizeSearchText(search)
  if (!normalizedSearch) {
    return true
  }

  return normalizeSearchText(
    [
      provider.meta.name,
      ...collectI18nTextValues(provider.meta.label),
      ...collectI18nTextValues(provider.meta.description)
    ]
      .filter(Boolean)
      .join(' ')
  ).includes(normalizedSearch)
}

export function normalizeI18nCandidate(value: unknown): string | I18nObject | null {
  if (typeof value === 'string') {
    return value
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as I18nObject
  }

  return null
}

export function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function compareToolsetsByUpdatedAtDesc(left: IXpertToolset, right: IXpertToolset) {
  return readDateTime(right.updatedAt) - readDateTime(left.updatedAt)
}

export function readDateTime(value: unknown) {
  if (!value) {
    return 0
  }

  const time = new Date(value as string).getTime()
  return Number.isFinite(time) ? time : 0
}

export function uniqueByName<T>(values: T[], getName: (value: T) => string) {
  const seen = new Set<string>()
  return values.filter((value) => {
    const name = getName(value)
    if (!name || seen.has(name)) {
      return false
    }

    seen.add(name)
    return true
  })
}

export function hasBlockingChecklist(checklist: Array<{ level?: string }> | null | undefined) {
  return (checklist ?? []).some((item) => item.level === 'error')
}
