import { XpertTypeEnum } from '@metad/contracts'

export const BLANK_XPERT_WORKFLOW_MODE = 'workflow' as const

export type BlankXpertMode = XpertTypeEnum.Agent | XpertTypeEnum.Knowledge | typeof BLANK_XPERT_WORKFLOW_MODE

export function getBlankWizardAvailableModes(type?: XpertTypeEnum | null): BlankXpertMode[] {
  if (type === XpertTypeEnum.Knowledge) {
    return [XpertTypeEnum.Knowledge]
  }

  if (type === XpertTypeEnum.Agent) {
    return [XpertTypeEnum.Agent, BLANK_XPERT_WORKFLOW_MODE]
  }

  return [XpertTypeEnum.Agent, BLANK_XPERT_WORKFLOW_MODE, XpertTypeEnum.Knowledge]
}

export function getBlankWizardDefaultMode(type?: XpertTypeEnum | null): BlankXpertMode {
  return type === XpertTypeEnum.Knowledge ? XpertTypeEnum.Knowledge : XpertTypeEnum.Agent
}

export function isBlankWizardModeDisabled(mode: BlankXpertMode, type?: XpertTypeEnum | null): boolean {
  return !getBlankWizardAvailableModes(type).includes(mode)
}

export function getBlankWizardPersistedType(mode: BlankXpertMode): XpertTypeEnum {
  return mode === BLANK_XPERT_WORKFLOW_MODE ? XpertTypeEnum.Agent : mode
}

export function shouldHideBlankWizardPrimaryAgent(mode: BlankXpertMode): boolean {
  return mode !== XpertTypeEnum.Agent
}

export function shouldInitializeBlankWizardDraft(mode: BlankXpertMode, hasAgentAdvancedSelections: boolean): boolean {
  return (
    mode === XpertTypeEnum.Knowledge ||
    mode === BLANK_XPERT_WORKFLOW_MODE ||
    (mode === XpertTypeEnum.Agent && hasAgentAdvancedSelections)
  )
}
