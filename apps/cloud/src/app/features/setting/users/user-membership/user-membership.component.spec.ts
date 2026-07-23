jest.mock('echarts/core', () => ({ registerTheme: jest.fn() }))

import { TestBed } from '@angular/core/testing'
import { TranslateService } from '@ngx-translate/core'
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
    getPlans: jest.Mock
    getAdminUsers: jest.Mock
    getPersonalPoints: jest.Mock
  }
  let alertDialog: { confirm: jest.Mock }
  let store: { activeScope: { level: RequestScopeLevel }; hasPermission: jest.Mock }
  let component: UserMembershipComponent

  beforeEach(() => {
    membershipService = {
      pauseUser: jest.fn().mockReturnValue(of(membership)),
      resumeUser: jest.fn().mockReturnValue(of(membership)),
      revokeUser: jest.fn().mockReturnValue(of(membership)),
      renewUser: jest.fn().mockReturnValue(of(membership)),
      getPlans: jest.fn().mockReturnValue(of([])),
      getAdminUsers: jest.fn().mockReturnValue(of({ items: [], total: 0 })),
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
