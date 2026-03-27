import { XpertTypeEnum } from '@metad/contracts'

export const BLANK_XPERT_WORKFLOW_MODE = 'workflow' as const

export type BlankXpertMode = XpertTypeEnum.Agent | XpertTypeEnum.Knowledge | typeof BLANK_XPERT_WORKFLOW_MODE

export function getBlankWizardAvailableModes(_type?: XpertTypeEnum | null): BlankXpertMode[] {
  return [XpertTypeEnum.Agent, BLANK_XPERT_WORKFLOW_MODE, XpertTypeEnum.Knowledge]
}

export function getBlankWizardDefaultMode(type?: XpertTypeEnum | null): BlankXpertMode {
  return type === XpertTypeEnum.Knowledge ? XpertTypeEnum.Knowledge : XpertTypeEnum.Agent
}

export function isBlankWizardModeDisabled(_mode: BlankXpertMode, _type?: XpertTypeEnum | null): boolean {
  return false
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
