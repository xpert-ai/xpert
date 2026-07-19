import { type IXpertWorkspace, XpertTypeEnum } from '@cloud/app/@core'
import type { BlankXpertDialogData } from '../../xpert/xpert'

export function createAgentTemplateWizardData(
  templateId: string,
  workspace: IXpertWorkspace | null
): BlankXpertDialogData {
  return {
    workspace,
    type: XpertTypeEnum.Agent,
    allowedModes: [XpertTypeEnum.Agent],
    allowWorkspaceSelection: true,
    completionMode: 'create',
    initialStartMode: 'template',
    initialTemplateId: templateId,
    lockStartMode: true,
    lockType: true,
    skipTemplateSelectionStep: true
  }
}
