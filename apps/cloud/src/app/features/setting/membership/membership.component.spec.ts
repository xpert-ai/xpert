jest.mock('echarts/core', () => ({ registerTheme: jest.fn() }))

import { TestBed } from '@angular/core/testing'
import { TranslateService } from '@ngx-translate/core'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  IMembershipPlan,
  MembershipBulkActionEnum,
  MembershipPeriodEnum,
  MembershipPlanStatusEnum
} from '@xpert-ai/contracts'
import { ZardAlertDialogService } from '@xpert-ai/headless-ui'
import { of, Subject, throwError } from 'rxjs'
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
  let toastr: { error: jest.Mock; success: jest.Mock }
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
    toastr = {
      error: jest.fn(),
      success: jest.fn()
    }

    TestBed.configureTestingModule({
      imports: [MembershipAdminComponent],
      providers: [
        { provide: MembershipService, useValue: membershipService },
        { provide: ToastrService, useValue: toastr },
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

  it('loads assigned plan members page by page', () => {
    membershipService.getAdminUsers.mockReturnValue(of({ items: [], total: 86 }))
    component.loadPlanMembers(sourcePlan.id)

    expect(membershipService.getAdminUsers).toHaveBeenLastCalledWith({
      planId: sourcePlan.id,
      take: 10,
      skip: 0
    })

    component.selectedPlanId.set(sourcePlan.id)
    component.onPlanMemberPage({
      previousPageIndex: 0,
      pageIndex: 2,
      pageSize: 20,
      length: 86
    })

    expect(component.planMemberPageIndex()).toBe(2)
    expect(component.planMemberPageSize()).toBe(20)
    expect(membershipService.getAdminUsers).toHaveBeenLastCalledWith({
      planId: sourcePlan.id,
      take: 20,
      skip: 40
    })

    component.selectPlan(targetPlan)

    expect(component.planMemberPageIndex()).toBe(0)
    expect(membershipService.getAdminUsers).toHaveBeenLastCalledWith({
      planId: targetPlan.id,
      take: 20,
      skip: 0
    })
  })

  it('keeps the last successful page when loading another page fails', () => {
    component.selectedPlanId.set(sourcePlan.id)
    membershipService.getAdminUsers.mockReturnValueOnce(throwError(() => new Error('request failed')))

    component.onPlanMemberPage({
      previousPageIndex: 0,
      pageIndex: 1,
      pageSize: 10,
      length: 30
    })

    expect(component.planMemberPageIndex()).toBe(0)
    expect(component.planMemberPageSize()).toBe(10)
    expect(toastr.error).toHaveBeenCalledWith('request failed')
  })

  it('ignores an older member page response after a newer request succeeds', () => {
    const firstPage = new Subject<{ items: []; total: number }>()
    const secondPage = new Subject<{ items: []; total: number }>()
    membershipService.getAdminUsers.mockReturnValueOnce(firstPage).mockReturnValueOnce(secondPage)
    component.selectedPlanId.set(sourcePlan.id)

    component.loadPlanMembers(sourcePlan.id)
    component.onPlanMemberPage({
      previousPageIndex: 0,
      pageIndex: 1,
      pageSize: 10,
      length: 20
    })
    secondPage.next({ items: [], total: 20 })
    secondPage.complete()
    firstPage.next({ items: [], total: 99 })
    firstPage.complete()

    expect(component.planMemberPageIndex()).toBe(1)
    expect(component.planMemberCount()).toBe(20)
    expect(component.planMembersLoading()).toBe(false)
  })

  it('reloads the last valid page when the member count shrinks', () => {
    membershipService.getAdminUsers
      .mockReturnValueOnce(of({ items: [], total: 20 }))
      .mockReturnValueOnce(of({ items: [], total: 20 }))
    component.planMemberPageIndex.set(2)
    component.selectedPlanId.set(sourcePlan.id)

    component.loadPlanMembers(sourcePlan.id)

    expect(membershipService.getAdminUsers).toHaveBeenNthCalledWith(1, {
      planId: sourcePlan.id,
      take: 10,
      skip: 20
    })
    expect(membershipService.getAdminUsers).toHaveBeenNthCalledWith(2, {
      planId: sourcePlan.id,
      take: 10,
      skip: 10
    })
    expect(component.planMemberPageIndex()).toBe(1)
  })

  it('shows and disables the plan member paginator according to the current page size and loading state', () => {
    const template = readFileSync(join(__dirname, 'membership.component.html'), 'utf8')

    expect(template).toContain('planMemberCount() > planMemberPageSize()')
    expect(template).toContain('[disabled]="planMembersLoading()"')
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
