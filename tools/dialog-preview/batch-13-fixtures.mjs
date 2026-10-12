import { signal } from '@angular/core'
import { batchThirteen } from './batch-13.mjs'

export const roleNameMode = signal('create')
export const approvalPath = signal('reviewer')

export function batchThirteenFixture(scene, translate) {
  if (scene === 'roleName') {
    const rename = roleNameMode() === 'rename'
    return {
      roleNameDialogTitle: translate(rename ? 'XP.Role.RenameTitle' : 'XP.MODEL.AccessControl.NewRole'),
      roleNameDialogLabel: translate('XP.Role.NameLabel'),
      roleNameDialogAction: translate(rename ? 'XP.ACTIONS.Rename' : 'XP.MODEL.AccessControl.NewRole'),
      roleNameDraft: rename ? 'Research reviewer' : ''
    }
  }
  const spec = batchThirteen[scene]
  const description =
    scene === 'evolutionApprove' && approvalPath() === 'administrator'
      ? 'AdministratorSubmitApprovalDescription'
      : spec.description
  return {
    data: {
      title: translate('XP.AgentEvolution.' + spec.title, spec.params),
      description: translate('XP.AgentEvolution.' + description, spec.params),
      actionText: translate('XP.AgentEvolution.' + spec.action, spec.params),
      cancelText: translate('XP.ACTIONS.Cancel')
    }
  }
}
