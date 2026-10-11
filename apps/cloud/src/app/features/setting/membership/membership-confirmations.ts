import { inject } from '@angular/core'
import { TranslateService } from '@ngx-translate/core'
import { MembershipBulkActionEnum } from '@xpert-ai/contracts'
import { ZardAlertDialogService } from '@xpert-ai/headless-ui'
import { firstValueFrom } from 'rxjs'

export function injectMembershipConfirmations() {
  const dialog = inject(ZardAlertDialogService)
  const translate = inject(TranslateService)
  return {
    archivePlan: (name: string) =>
      firstValueFrom(
        dialog.confirm({
          layout: 'standard',
          title: translate.instant('XP.Membership.ArchivePlanConfirmTitle', {
            Default: 'Archive membership plan?'
          }),
          description: translate.instant('XP.Membership.ArchivePlanConfirmDescription', {
            Default: 'Archive plan "{{name}}"? It will no longer be available for new assignments.',
            name
          }),
          actionText: translate.instant('XP.Membership.ArchivePlan', { Default: 'Archive' }),
          cancelText: translate.instant('XP.ACTIONS.Cancel', { Default: 'Cancel' }),
          destructive: true
        })
      ),
    deletePlan: (name: string) =>
      firstValueFrom(
        dialog.confirm({
          layout: 'standard',
          title: translate.instant('XP.Membership.DeletePlan', { Default: 'Delete plan' }),
          description: translate.instant('XP.Membership.DeletePlanConfirm', {
            Default: 'Delete archived plan "{{name}}"? This cannot be undone.',
            name
          }),
          actionText: translate.instant('XP.ACTIONS.Delete', { Default: 'Delete' }),
          cancelText: translate.instant('XP.ACTIONS.Cancel', { Default: 'Cancel' }),
          destructive: true
        })
      ),
    applyBulkAction: (action: MembershipBulkActionEnum, count: number) =>
      firstValueFrom(
        dialog.confirm({
          layout: 'standard',
          title: translate.instant('XP.Membership.BulkActionConfirmTitle', {
            Default: 'Apply membership action?'
          }),
          description: translate.instant('XP.Membership.BulkActionConfirmDescription', {
            Default: 'Apply "{{action}}" to {{count}} selected users?',
            action,
            count
          }),
          actionText: translate.instant('XP.Membership.ApplyBulkAction', { Default: 'Apply action' }),
          cancelText: translate.instant('XP.ACTIONS.Cancel', { Default: 'Cancel' }),
          destructive: action === MembershipBulkActionEnum.Revoke
        })
      ),
    reassignMembers: (count: number, source: string, target: string) =>
      firstValueFrom(
        dialog.confirm({
          layout: 'standard',
          title: translate.instant('XP.Membership.ReassignConfirmTitle', {
            Default: 'Reassign plan members?'
          }),
          description: translate.instant('XP.Membership.ReassignConfirmDescription', {
            Default:
              'Move {{count}} members from "{{source}}" to "{{target}}"? Their current cycle and used cycle points will be reset.',
            count,
            source,
            target
          }),
          actionText: translate.instant('XP.Membership.ReassignMembers', { Default: 'Reassign members' }),
          cancelText: translate.instant('XP.ACTIONS.Cancel', { Default: 'Cancel' }),
          destructive: true
        })
      )
  }
}
