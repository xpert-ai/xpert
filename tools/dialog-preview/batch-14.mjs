const confirmation = (name, title, description, action, options = {}) => ({
  name,
  title,
  description,
  action,
  ...options
})
const membership = (name, key, destructive = false) =>
  confirmation(
    name,
    `XP.Membership.${key}ConfirmTitle`,
    `XP.Membership.${key}ConfirmDescription`,
    `XP.Membership.${key}`,
    { destructive }
  )

export const batchFourteen = {
  membershipRenew: membership('续期用户会员', 'Renew'),
  membershipCancelPeriod: membership('取消待生效会员周期', 'CancelPeriod', true),
  membershipPause: membership('暂停用户会员', 'Pause'),
  membershipResume: membership('恢复用户会员', 'Resume'),
  membershipRevoke: membership('撤销用户会员', 'Revoke', true),
  roleDelete: confirmation('删除角色', 'XP.Role.DeleteTitle', 'XP.Role.DeleteConfirm', 'XP.ACTIONS.Delete', {
    destructive: true,
    params: { name: 'Research reviewer' }
  }),
  dataSourceDelete: confirmation('删除数据源', 'COMPONENTS.CONFIRM.DELETE', null, 'COMPONENTS.COMMON.Confirm', {
    destructive: true,
    cancel: 'COMPONENTS.COMMON.CANCEL',
    sourceName: 'Research warehouse'
  }),
  referralRegenerate: confirmation(
    '重新生成邀请码',
    'XP.Referral.RegenerateConfirmTitle',
    'XP.Referral.RegenerateConfirmDescription',
    'XP.Referral.RegenerateCode',
    { destructive: true }
  ),
  runtimeRestartPrompt: confirmation(
    '插件重启提示',
    'XP.Plugin.RestartRequiredTitle',
    'XP.Plugin.RestartRequiredDescription',
    'XP.Plugin.RestartNow',
    {
      cancel: 'XP.Plugin.RestartLater',
      maskClosable: false,
      closable: false,
      params: { pluginNames: '@xpert-ai/plugin-example' }
    }
  ),
  runtimeRestartConfirm: confirmation(
    '插件重启二次确认',
    'XP.Plugin.RestartConfirmTitle',
    'XP.Plugin.RestartConfirmDescription',
    'XP.Plugin.RestartConfirmAction',
    {
      destructive: true,
      maskClosable: false,
      closable: false
    }
  )
}

export function batchFourteenOptions(key, translate) {
  const spec = batchFourteen[key]
  const title = translate(spec.title, spec.params)
  return {
    layout: 'standard',
    title: spec.sourceName ? `${title} [${spec.sourceName}]?` : title,
    description: spec.description ? translate(spec.description, spec.params) : undefined,
    actionText: translate(spec.action),
    cancelText: translate(spec.cancel ?? 'XP.ACTIONS.Cancel'),
    destructive: spec.destructive,
    closable: spec.closable,
    maskClosable: spec.maskClosable
  }
}
