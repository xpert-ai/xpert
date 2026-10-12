import { signal } from '@angular/core'

export const bulkMembershipAction = signal('assign')
const confirmation = (name, title, description, action, options = {}) => ({
  name,
  title,
  description,
  action,
  ...options
})
const simple = (name, description, options = {}) =>
  confirmation(name, 'XP.KEY_WORDS.Confirm', description, 'XP.KEY_WORDS.Confirm', options)

export const batchFifteen = {
  planArchiveConfirm: confirmation(
    '归档会员套餐',
    'XP.Membership.ArchivePlanConfirmTitle',
    'XP.Membership.ArchivePlanConfirmDescription',
    'XP.Membership.ArchivePlan',
    { destructive: true, params: { name: 'Research plan' } }
  ),
  planDeleteConfirm: confirmation(
    '删除已归档套餐',
    'XP.Membership.DeletePlan',
    'XP.Membership.DeletePlanConfirm',
    'XP.ACTIONS.Delete',
    { destructive: true, params: { name: 'Research plan' } }
  ),
  membershipBulkConfirm: confirmation(
    '批量调整用户会员',
    'XP.Membership.BulkActionConfirmTitle',
    'XP.Membership.BulkActionConfirmDescription',
    'XP.Membership.ApplyBulkAction'
  ),
  planReassignConfirm: confirmation(
    '迁移套餐成员',
    'XP.Membership.ReassignConfirmTitle',
    'XP.Membership.ReassignConfirmDescription',
    'XP.Membership.ReassignMembers',
    { destructive: true, params: { count: 12, source: 'Research plan', target: 'Team plan' } }
  ),
  buildCandidateConfirm: confirmation(
    '构建隔离候选版本',
    'XP.AgentEvolution.BuildIsolatedCandidateTitle',
    'XP.AgentEvolution.BuildIsolatedCandidateDescription',
    'XP.AgentEvolution.BuildCandidate'
  ),
  discardAppConfigConfirm: confirmation(
    '丢弃应用配置',
    'XP.Explore.Application.Toolsets.Discard',
    'XP.Explore.Application.Toolsets.DiscardDescription',
    'XP.Explore.Application.Toolsets.Discard',
    { destructive: true }
  ),
  unsavedLeaveConfirm: confirmation(
    '未保存离开',
    'XP.KEY_WORDS.Confirm',
    'XP.MESSAGE.ConfirmExitDirtyData',
    'XP.MESSAGE.Sure',
    { descriptionDefault: 'Has dirty data, confirm exit?', actionDefault: 'Sure' }
  ),
  projectOwnershipConfirm: simple('转移项目所有权', 'XP.XProject.TransferOwnershipConfirmation', {
    params: { name: 'Research reviewer' }
  }),
  projectSkillUninstallConfirm: simple('卸载项目技能', 'XP.XProject.UninstallProjectSkillConfirmation', {
    params: { name: 'Research skill' }
  }),
  templateFullSyncConfirm: simple('全量同步模板技能', 'Pro.SkillSync.ConfirmFullSync', {
    descriptionDefault:
      'Force a full template sync? This will re-check repositories, indexes, and bundled workspace-public skills.'
  })
}

export function batchFifteenOptions(key, translate) {
  const spec = batchFifteen[key]
  const bulk = key === 'membershipBulkConfirm'
  const params = bulk ? { action: bulkMembershipAction(), count: 12 } : spec.params
  return {
    layout: 'standard',
    title: translate(spec.title, { Default: 'Confirm', ...params }),
    description: translate(spec.description, { Default: spec.descriptionDefault, ...params }),
    actionText: translate(spec.action, { Default: spec.actionDefault ?? 'Confirm' }),
    cancelText: translate('XP.ACTIONS.Cancel', { Default: 'Cancel' }),
    destructive: bulk ? bulkMembershipAction() === 'revoke' : spec.destructive
  }
}
