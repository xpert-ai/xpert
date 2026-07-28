jest.mock('echarts/core', () => ({ registerTheme: jest.fn() }))

import { TestBed } from '@angular/core/testing'
import { TranslateService } from '@ngx-translate/core'
import {
  IMembershipPlan,
  MembershipBulkActionEnum,
  MembershipPeriodEnum,
  MembershipPlanStatusEnum
} from '@xpert-ai/contracts'
import { ZardAlertDialogService } from '@xpert-ai/headless-ui'
import { of } from 'rxjs'
import { MembershipService, ToastrService } from '../../../@core'
import { MembershipAdminComponent } from './membership.component'

describe('MembershipAdminComponent', () => {
  const sourcePlan = {
    id: 'plan-source',
    code: 'source',
    name: 'Source',
    status: MembershipPlanStatusEnum.Active,
    period: MembershipPeriodEnum.Monthly,
    includedPoints: 100
  } as IMembershipPlan
  const targetPlan = {
    id: 'plan-target',
    code: 'target',
    name: 'Target',
    status: MembershipPlanStatusEnum.Active,
    period: MembershipPeriodEnum.Monthly,
    includedPoints: 200
  } as IMembershipPlan

  let membershipService: {
    archivePlan: jest.Mock
    reassignPlanMembers: jest.Mock
    getScopeStatus: jest.Mock
    getPlans: jest.Mock
    getModelOptions: jest.Mock
    getAdminUsers: jest.Mock
    getAdminMembers: jest.Mock
    applyBulkUserAction: jest.Mock
  }
  let alertDialog: { confirm: jest.Mock }
  let component: MembershipAdminComponent

  beforeEach(() => {
    membershipService = {
      archivePlan: jest.fn().mockReturnValue(of(sourcePlan)),
      reassignPlanMembers: jest.fn().mockReturnValue(of({ updated: 2 })),
      getScopeStatus: jest.fn().mockReturnValue(of(null)),
      getPlans: jest.fn().mockReturnValue(of([sourcePlan, targetPlan])),
      getModelOptions: jest.fn().mockReturnValue(of([])),
      getAdminUsers: jest.fn().mockReturnValue(of({ items: [], total: 0 })),
      getAdminMembers: jest.fn().mockReturnValue(of({ items: [], total: 0 })),
      applyBulkUserAction: jest.fn().mockReturnValue(of({ succeeded: 1, failed: [] }))
    }
    alertDialog = {
      confirm: jest.fn().mockReturnValue(of(false))
    }

    TestBed.configureTestingModule({
      imports: [MembershipAdminComponent],
      providers: [
        { provide: MembershipService, useValue: membershipService },
        { provide: ToastrService, useValue: { error: jest.fn(), success: jest.fn() } },
        { provide: ZardAlertDialogService, useValue: alertDialog },
        { provide: TranslateService, useValue: { instant: jest.fn((key: string) => key) } }
      ]
    }).overrideComponent(MembershipAdminComponent, {
      set: {
        imports: [],
        template: ''
      }
    })

    const fixture = TestBed.createComponent(MembershipAdminComponent)
    component = fixture.componentInstance
    component.plans.set([sourcePlan, targetPlan])
  })

  it('does not archive a plan when confirmation is cancelled', async () => {
    await component.archive(sourcePlan)

    expect(alertDialog.confirm).toHaveBeenCalledWith(expect.objectContaining({ destructive: true }))
    expect(membershipService.archivePlan).not.toHaveBeenCalled()
  })

  it('archives a plan only after confirmation', async () => {
    alertDialog.confirm.mockReturnValue(of(true))

    await component.archive(sourcePlan)

    expect(membershipService.archivePlan).toHaveBeenCalledWith(sourcePlan.id)
  })

  it('reassigns plan members only after confirming the affected member count', async () => {
    component.migrationTargetPlanId = targetPlan.id
    component.planMemberCount.set(2)

    await component.reassignMembers(sourcePlan)
    expect(membershipService.reassignPlanMembers).not.toHaveBeenCalled()

    alertDialog.confirm.mockReturnValue(of(true))
    await component.reassignMembers(sourcePlan)

    expect(alertDialog.confirm).toHaveBeenLastCalledWith(expect.objectContaining({ destructive: true }))
    expect(membershipService.reassignPlanMembers).toHaveBeenCalledWith(sourcePlan.id, {
      targetPlanId: targetPlan.id
    })
  })

  it('applies the selected batch action only after confirmation', async () => {
    component.selectedUserIds.set(new Set(['user-1']))
    component.bulkActionForm.patchValue({
      action: MembershipBulkActionEnum.Assign,
      planId: targetPlan.id
    })

    await component.applyBulkAction()
    expect(membershipService.applyBulkUserAction).not.toHaveBeenCalled()

    alertDialog.confirm.mockReturnValue(of(true))
    await component.applyBulkAction()

    expect(membershipService.applyBulkUserAction).toHaveBeenCalledWith(
      expect.objectContaining({
        userIds: ['user-1'],
        action: MembershipBulkActionEnum.Assign,
        planId: targetPlan.id
      })
    )
  })

  it('formats the member expiration filter for the API', () => {
    component.memberFilterForm.patchValue({
      expiringBefore: new Date(2027, 2, 14)
    })

    component.loadAdminMembers()

    expect(membershipService.getAdminMembers).toHaveBeenCalledWith(
      expect.objectContaining({
        expiringBefore: '2027-03-14'
      })
    )
  })
})
