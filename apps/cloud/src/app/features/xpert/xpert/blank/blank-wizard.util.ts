import { XpertTypeEnum } from '@metad/contracts'

export const BLANK_XPERT_WORKFLOW_MODE = 'workflow' as const

export type BlankXpertMode = XpertTypeEnum.Agent | XpertTypeEnum.Knowledge | typeof BLANK_XPERT_WORKFLOW_MODE
export type BlankXpertCompletionMode = 'create' | 'publish'

const DEFAULT_AVAILABLE_MODES: BlankXpertMode[] = [
  XpertTypeEnum.Agent,
  BLANK_XPERT_WORKFLOW_MODE,
  XpertTypeEnum.Knowledge
]

export function getBlankWizardAvailableModes(
  _type?: XpertTypeEnum | null,
  allowedModes?: BlankXpertMode[] | null
): BlankXpertMode[] {
  const allowed = new Set((allowedModes?.length ? allowedModes : DEFAULT_AVAILABLE_MODES) as BlankXpertMode[])
  return DEFAULT_AVAILABLE_MODES.filter((mode) => allowed.has(mode))
}

export function getBlankWizardDefaultMode(
  type?: XpertTypeEnum | null,
  allowedModes?: BlankXpertMode[] | null
): BlankXpertMode {
  const availableModes = getBlankWizardAvailableModes(type, allowedModes)
  if (type === XpertTypeEnum.Knowledge && availableModes.includes(XpertTypeEnum.Knowledge)) {
    return XpertTypeEnum.Knowledge
  }
  if (type === XpertTypeEnum.Agent && availableModes.includes(XpertTypeEnum.Agent)) {
    return XpertTypeEnum.Agent
  }

  return availableModes[0] ?? XpertTypeEnum.Agent
}

export function isBlankWizardModeDisabled(
  mode: BlankXpertMode,
  type?: XpertTypeEnum | null,
  allowedModes?: BlankXpertMode[] | null
): boolean {
  return !getBlankWizardAvailableModes(type, allowedModes).includes(mode)
}

export function getBlankWizardPersistedType(mode: BlankXpertMode): XpertTypeEnum {
  return mode === BLANK_XPERT_WORKFLOW_MODE ? XpertTypeEnum.Agent : mode
}

export function shouldHideBlankWizardPrimaryAgent(mode: BlankXpertMode): boolean {
  return mode !== XpertTypeEnum.Agent
}

export function shouldInitializeBlankWizardDraft(
  mode: BlankXpertMode,
  hasAgentAdvancedSelections: boolean,
  completionMode: BlankXpertCompletionMode = 'create'
): boolean {
  if (completionMode === 'publish') {
    return true
  }

  return (
    mode === XpertTypeEnum.Knowledge ||
    mode === BLANK_XPERT_WORKFLOW_MODE ||
    (mode === XpertTypeEnum.Agent && hasAgentAdvancedSelections)
  )
}
