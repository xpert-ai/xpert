import { XpertTypeEnum } from '@metad/contracts'
import {
  BLANK_XPERT_WORKFLOW_MODE,
  getBlankWizardAvailableModes,
  getBlankWizardDefaultMode,
  getBlankWizardPersistedType,
  isBlankWizardModeDisabled,
  shouldHideBlankWizardPrimaryAgent,
  shouldInitializeBlankWizardDraft
} from './blank-wizard.util'

describe('blank wizard util', () => {
  it('should keep all modes available while defaulting to knowledge from the knowledge flow', () => {
    expect(getBlankWizardAvailableModes(XpertTypeEnum.Knowledge)).toEqual([
      XpertTypeEnum.Agent,
      BLANK_XPERT_WORKFLOW_MODE,
      XpertTypeEnum.Knowledge
    ])
    expect(getBlankWizardDefaultMode(XpertTypeEnum.Knowledge)).toBe(XpertTypeEnum.Knowledge)
    expect(isBlankWizardModeDisabled(XpertTypeEnum.Agent, XpertTypeEnum.Knowledge)).toBe(false)
    expect(isBlankWizardModeDisabled(BLANK_XPERT_WORKFLOW_MODE, XpertTypeEnum.Knowledge)).toBe(false)
  })

  it('should keep all modes available from the digital expert entry', () => {
    expect(getBlankWizardAvailableModes(XpertTypeEnum.Agent)).toEqual([
      XpertTypeEnum.Agent,
      BLANK_XPERT_WORKFLOW_MODE,
      XpertTypeEnum.Knowledge
    ])
    expect(getBlankWizardDefaultMode(XpertTypeEnum.Agent)).toBe(XpertTypeEnum.Agent)
    expect(isBlankWizardModeDisabled(XpertTypeEnum.Knowledge, XpertTypeEnum.Agent)).toBe(false)
    expect(isBlankWizardModeDisabled(BLANK_XPERT_WORKFLOW_MODE, XpertTypeEnum.Agent)).toBe(false)
  })

  it('should persist workflow mode as agent type', () => {
    expect(getBlankWizardPersistedType(BLANK_XPERT_WORKFLOW_MODE)).toBe(XpertTypeEnum.Agent)
    expect(getBlankWizardPersistedType(XpertTypeEnum.Agent)).toBe(XpertTypeEnum.Agent)
    expect(getBlankWizardPersistedType(XpertTypeEnum.Knowledge)).toBe(XpertTypeEnum.Knowledge)
  })

  it('should hide the primary agent for workflow and knowledge starters', () => {
    expect(shouldHideBlankWizardPrimaryAgent(BLANK_XPERT_WORKFLOW_MODE)).toBe(true)
    expect(shouldHideBlankWizardPrimaryAgent(XpertTypeEnum.Knowledge)).toBe(true)
    expect(shouldHideBlankWizardPrimaryAgent(XpertTypeEnum.Agent)).toBe(false)
  })

  it('should always initialize workflow drafts and only initialize agent drafts when needed', () => {
    expect(shouldInitializeBlankWizardDraft(BLANK_XPERT_WORKFLOW_MODE, false)).toBe(true)
    expect(shouldInitializeBlankWizardDraft(BLANK_XPERT_WORKFLOW_MODE, true)).toBe(true)
    expect(shouldInitializeBlankWizardDraft(XpertTypeEnum.Knowledge, false)).toBe(true)
    expect(shouldInitializeBlankWizardDraft(XpertTypeEnum.Agent, false)).toBe(false)
    expect(shouldInitializeBlankWizardDraft(XpertTypeEnum.Agent, true)).toBe(true)
  })
})
