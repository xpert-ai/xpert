jest.mock('echarts/core', () => ({ registerTheme: jest.fn() }))

import { TestBed } from '@angular/core/testing'
import { TranslateService } from '@ngx-translate/core'
import {
  IUserMembershipPeriod,
  MembershipPeriodEnum,
  MembershipPeriodStatusEnum,
  MembershipRenewalModeEnum,
  MembershipSourceEnum
} from '@xpert-ai/contracts'
import { ZardAlertDialogService } from '@xpert-ai/headless-ui'
import { of } from 'rxjs'
import { MembershipService, RequestScopeLevel, Store, ToastrService } from '../../../../@core'
import { UserMembershipComponent } from './user-membership.component'

describe('UserMembershipComponent', () => {
  const membership = { id: 'membership-1' }
  let membershipService: {
    pauseUser: jest.Mock
    resumeUser: jest.Mock
    revokeUser: jest.Mock
    renewUser: jest.Mock
    cancelAdminUserPeriod: jest.Mock
    getPlans: jest.Mock
    getAdminUsers: jest.Mock
    getAdminUserPeriods: jest.Mock
    getPersonalPoints: jest.Mock
  }
  let alertDialog: { confirm: jest.Mock }
  let store: { activeScope: { level: RequestScopeLevel }; hasPermission: jest.Mock }
  let component: UserMembershipComponent

  const createPeriod = (overrides: Partial<IUserMembershipPeriod> = {}): IUserMembershipPeriod => ({
    id: 'period-1',
    tenantId: 'tenant-1',
    membershipId: 'membership-1',
    userId: 'user-1',
    planId: 'plan-1',
    status: MembershipPeriodStatusEnum.Scheduled,
    periodStart: new Date('2030-08-01T00:00:00.000Z'),
    periodEnd: new Date('2030-09-01T00:00:00.000Z'),
    pointsGranted: 100,
    pointsUsed: 0,
    source: MembershipSourceEnum.Admin,
    renewalMode: MembershipRenewalModeEnum.Manual,
    sourceReference: null,
    sourceSequence: 1,
    planSnapshot: {
      planId: 'plan-1',
      code: 'default',
      name: 'Default',
      period: MembershipPeriodEnum.Monthly,
      includedPoints: 100,
      tokensPerPoint: 1000
    },
    ...overrides
  })

  beforeEach(() => {
    membershipService = {
      pauseUser: jest.fn().mockReturnValue(of(membership)),
      resumeUser: jest.fn().mockReturnValue(of(membership)),
      revokeUser: jest.fn().mockReturnValue(of(membership)),
      renewUser: jest.fn().mockReturnValue(of(membership)),
      cancelAdminUserPeriod: jest.fn().mockReturnValue(of({ id: 'period-1', status: 'cancelled' })),
      getPlans: jest.fn().mockReturnValue(of([])),
      getAdminUsers: jest.fn().mockReturnValue(of({ items: [], total: 0 })),
      getAdminUserPeriods: jest.fn().mockReturnValue(of([])),
      getPersonalPoints: jest.fn().mockReturnValue(of({ balance: 10 }))
    }
    alertDialog = {
      confirm: jest.fn().mockReturnValue(of(false))
    }
    store = {
      activeScope: { level: RequestScopeLevel.TENANT },
      hasPermission: jest.fn().mockReturnValue(true)
    }

    TestBed.configureTestingModule({
      imports: [UserMembershipComponent],
      providers: [
        { provide: MembershipService, useValue: membershipService },
        { provide: Store, useValue: store },
        { provide: ToastrService, useValue: { error: jest.fn() } },
        { provide: ZardAlertDialogService, useValue: alertDialog },
        { provide: TranslateService, useValue: { instant: jest.fn((key: string) => key) } }
      ]
    }).overrideComponent(UserMembershipComponent, {
      set: {
        imports: [],
        template: ''
      }
    })

    const fixture = TestBed.createComponent(UserMembershipComponent)
    component = fixture.componentInstance
    component.userId = 'user-1'
  })

  it('does not run membership status actions when confirmation is cancelled', async () => {
    await component.pause()
    await component.resume()
    await component.revoke()
    await component.renew()

    expect(alertDialog.confirm).toHaveBeenCalledTimes(4)
    expect(membershipService.pauseUser).not.toHaveBeenCalled()
    expect(membershipService.resumeUser).not.toHaveBeenCalled()
    expect(membershipService.revokeUser).not.toHaveBeenCalled()
    expect(membershipService.renewUser).not.toHaveBeenCalled()
  })

  it('runs membership status actions only after confirmation', async () => {
    alertDialog.confirm.mockReturnValue(of(true))

    await component.pause()
    await component.resume()
    await component.revoke()
    await component.renew()

    expect(membershipService.pauseUser).toHaveBeenCalledWith('user-1')
    expect(membershipService.resumeUser).toHaveBeenCalledWith('user-1')
    expect(membershipService.revokeUser).toHaveBeenCalledWith('user-1')
    expect(membershipService.renewUser).toHaveBeenCalledWith('user-1')
    expect(alertDialog.confirm.mock.calls[2][0]).toMatchObject({ destructive: true })
  })

  it('reloads scheduled periods after renewing', async () => {
    alertDialog.confirm.mockReturnValue(of(true))
    membershipService.getAdminUserPeriods.mockReturnValue(of([createPeriod()]))

    await component.renew()

    expect(membershipService.getAdminUserPeriods).toHaveBeenCalledWith('user-1')
    expect(component.scheduledPeriods()).toHaveLength(1)
  })

  it('cancels an admin-managed upcoming period only after confirmation', async () => {
    alertDialog.confirm.mockReturnValue(of(true))
    const period = createPeriod({ source: MembershipSourceEnum.Organization })
    component.periods.set([period])

    await component.cancelPeriod(period)

    expect(membershipService.cancelAdminUserPeriod).toHaveBeenCalledWith('user-1', 'period-1')
    expect(alertDialog.confirm.mock.calls[0][0]).toMatchObject({ destructive: true })
  })

  it('does not cancel a scheduled period before the last one', async () => {
    alertDialog.confirm.mockReturnValue(of(true))
    const firstPeriod = createPeriod({
      id: 'period-first',
      periodStart: new Date('2030-08-01T00:00:00.000Z'),
      periodEnd: new Date('2030-09-01T00:00:00.000Z')
    })
    const lastPeriod = createPeriod({
      id: 'period-last',
      periodStart: new Date('2030-09-01T00:00:00.000Z'),
      periodEnd: new Date('2030-10-01T00:00:00.000Z')
    })
    component.periods.set([firstPeriod, lastPeriod])

    await component.cancelPeriod(firstPeriod)

    expect(component.canCancelPeriod(firstPeriod)).toBe(false)
    expect(component.canCancelPeriod(lastPeriod)).toBe(true)
    expect(alertDialog.confirm).not.toHaveBeenCalled()
    expect(membershipService.cancelAdminUserPeriod).not.toHaveBeenCalled()
  })

  it('does not cancel externally managed periods from the admin page', async () => {
    await component.cancelPeriod(
      createPeriod({
        id: 'period-paid',
        source: MembershipSourceEnum.External,
        sourceReference: 'order-1'
      })
    )

    expect(alertDialog.confirm).not.toHaveBeenCalled()
    expect(membershipService.cancelAdminUserPeriod).not.toHaveBeenCalled()
  })

  it('allows membership management whenever the current scope grants Copilot edit permission', () => {
    expect(component.canManage).toBe(true)
    expect(store.hasPermission).toHaveBeenCalled()
  })

  it('does not request tenant-owned personal points from organization scope', () => {
    store.activeScope = { level: RequestScopeLevel.ORGANIZATION }

    component.load()

    expect(membershipService.getPersonalPoints).not.toHaveBeenCalled()
    expect(component.personalPointsBalance()).toBe(0)
  })

  it('accepts point adjustments with up to three decimal places', () => {
    component.cyclePointsForm.controls.points.setValue(1.234)
    component.personalPointsForm.controls.points.setValue(1.234)

    expect(component.cyclePointsForm.controls.points.valid).toBe(true)
    expect(component.personalPointsForm.controls.points.valid).toBe(true)

    component.cyclePointsForm.controls.points.setValue(1.2345)
    component.personalPointsForm.controls.points.setValue(1.2345)

    expect(component.cyclePointsForm.controls.points.valid).toBe(false)
    expect(component.personalPointsForm.controls.points.valid).toBe(false)
  })
})
