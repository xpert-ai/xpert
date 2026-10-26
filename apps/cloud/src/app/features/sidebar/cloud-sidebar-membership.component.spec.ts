import { OverlayContainer } from '@angular/cdk/overlay'
import { fakeAsync, TestBed, tick } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import {
  IMembershipMe,
  MembershipPeriodEnum,
  MembershipPlanStatusEnum,
  MembershipRenewalModeEnum,
  MembershipSourceEnum,
  MembershipStatusEnum
} from '@xpert-ai/contracts'
import { BehaviorSubject, of, Subject, throwError } from 'rxjs'
import english from '../../../assets/i18n/en.json'
import { MembershipService } from '../../@core/services/membership.service'
import { Store } from '../../@core/state'
import { CloudSidebarMembershipComponent } from './cloud-sidebar-membership.component'

const period = {
  currentPeriodStart: new Date('2026-10-01T00:00:00Z'),
  currentPeriodEnd: new Date('2026-11-01T00:00:00Z'),
  pointsGranted: 1000,
  pointsUsed: 120,
  pointsTotalUsed: 120
}
const account: IMembershipMe = {
  ...period,
  // Consumption is not the quota deduction basis.
  consumedPoints: 9999,
  pointsRemaining: 880,
  personalPointsBalance: 59025,
  personalPointsOnly: false,
  plan: {
    code: 'pro',
    name: 'Pro',
    level: 1,
    period: MembershipPeriodEnum.Monthly,
    includedPoints: 1000,
    status: MembershipPlanStatusEnum.Active
  },
  membership: {
    ...period,
    userId: 'user',
    status: MembershipStatusEnum.Active,
    source: MembershipSourceEnum.Organization,
    renewalMode: MembershipRenewalModeEnum.Auto
  }
}

describe('sidebar membership and usage', () => {
  const getMe = jest.fn()
  let allowed: boolean
  let organization: BehaviorSubject<string>
  let user: BehaviorSubject<{ id: string; tenantId: string }>
  let permissions: BehaviorSubject<unknown[]>
  let revisions: BehaviorSubject<void>
  let container: HTMLElement

  beforeEach(() => {
    allowed = true
    organization = new BehaviorSubject('org-a')
    user = new BehaviorSubject({ id: 'user', tenantId: 'tenant' })
    permissions = new BehaviorSubject([])
    revisions = new BehaviorSubject(undefined)
    getMe.mockReset().mockReturnValue(of(account))
    TestBed.configureTestingModule({
      imports: [CloudSidebarMembershipComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: MembershipService, useValue: { getMe, membershipStateChanges$: revisions } },
        {
          provide: Store,
          useValue: {
            user: user.value,
            user$: user,
            userRolePermissions$: permissions,
            activeScope: { level: 'organization' },
            selectActiveScope: () => of({ level: 'organization' }),
            selectOrganizationId: () => organization,
            hasPermission: () => allowed
          }
        }
      ]
    })
    const translate = TestBed.inject(TranslateService)
    translate.setTranslation('en', english)
    translate.use('en')
    container = TestBed.inject(OverlayContainer).getContainerElement()
  })

  it('shows a compact hover summary and a separate click popover with the correct balances', fakeAsync(() => {
    const fixture = TestBed.createComponent(CloudSidebarMembershipComponent)
    fixture.componentRef.setInput('collapsed', true)
    fixture.detectChanges()
    tick()
    fixture.detectChanges()
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('[data-sidebar-membership]')
    expect(fixture.componentInstance.remainingPercent()).toBe(88)
    expect(button.textContent.trim()).toBe('')
    expect(button.getAttribute('aria-label')).toContain('88% left')
    button.dispatchEvent(new MouseEvent('mouseenter'))
    tick(200)
    fixture.detectChanges()
    expect(container.querySelector('[role="tooltip"]')?.textContent).toContain('Current cycle · 88% left')
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    button.click()
    fixture.detectChanges()
    tick(200)
    fixture.detectChanges()
    expect(container.querySelector('[role="tooltip"]')).toBeNull()
    const dialog = container.querySelector('[role="dialog"]')
    expect(dialog?.textContent).toContain('Pro')
    expect(dialog?.textContent).toContain('880 / 1,000')
    expect(dialog?.textContent).toContain('59,025')
    expect(dialog?.querySelector('a')?.getAttribute('href')).toBe('/settings/account/billing')
    expect(getMe).toHaveBeenCalledTimes(2)
    fixture.componentInstance.onOverlayKeydown(new KeyboardEvent('keydown', { key: 'Escape' }))
    fixture.detectChanges()
    tick(200)
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    fixture.destroy()
    tick(200)
  }))

  it.each([
    ['zero grant', 0, 0, 0],
    ['exhausted', 1000, 0, 0],
    ['negative remaining', 1000, -5, 0],
    ['over-granted', 1000, 1500, 100],
    ['unlimited', null, null, null]
  ])('handles %s without dividing by zero or claiming unknown quota', async (_label, granted, remaining, expected) => {
    getMe.mockReturnValue(of({ ...account, pointsGranted: granted, pointsRemaining: remaining }))
    const fixture = TestBed.createComponent(CloudSidebarMembershipComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    expect(fixture.componentInstance.remainingPercent()).toBe(expected)
    expect(fixture.componentInstance.unlimited()).toBe(granted === null)
  })

  it('does not present inactive or personal-only allowance as spendable cycle quota', async () => {
    getMe.mockReturnValue(
      of({
        ...account,
        personalPointsOnly: true,
        membership: { ...account.membership, status: MembershipStatusEnum.Expired }
      })
    )
    const fixture = TestBed.createComponent(CloudSidebarMembershipComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    expect(fixture.componentInstance.activePlan()).toBe(false)
    expect(fixture.componentInstance.remainingPercent()).toBeNull()
    expect(fixture.componentInstance.summary()).toBe('Personal points')
  })

  it('keeps errors distinct from no plan and retries without stacking requests', async () => {
    getMe.mockReturnValue(throwError(() => new Error('offline')))
    const fixture = TestBed.createComponent(CloudSidebarMembershipComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    const component = fixture.componentInstance
    expect(component.state()).toBe('error')
    expect(component.summary()).toBe('Usage temporarily unavailable')
    const pending = new Subject<IMembershipMe | null>()
    getMe.mockReturnValue(pending)
    component.refresh(true)
    component.refresh(true)
    expect(getMe).toHaveBeenCalledTimes(2)
    pending.next(null)
    expect(component.state()).toBe('ready')
    expect(component.summary()).toBe('No active plan')
  })

  it('clears the open panel and cancels requests on organization, identity and permission changes', fakeAsync(() => {
    const first = new Subject<IMembershipMe>()
    getMe.mockReturnValue(first)
    const fixture = TestBed.createComponent(CloudSidebarMembershipComponent)
    fixture.detectChanges()
    tick()
    const component = fixture.componentInstance
    component.open.set(true)
    const second = new Subject<IMembershipMe>()
    getMe.mockReturnValue(second)
    organization.next('org-b')
    fixture.detectChanges()
    tick()
    expect(first.observed).toBe(false)
    expect(component.account()).toBeNull()
    expect(component.open()).toBe(false)
    user.next({ id: 'another', tenantId: 'tenant' })
    fixture.detectChanges()
    tick()
    expect(getMe).toHaveBeenCalledTimes(3)
    allowed = false
    permissions.next([])
    fixture.detectChanges()
    tick()
    expect(second.observed).toBe(false)
    expect(fixture.nativeElement.querySelector('[data-sidebar-membership]')).toBeNull()
    expect(getMe).toHaveBeenCalledTimes(3)
  }))

  it('refreshes after membership changes and disposes its request on destruction', fakeAsync(() => {
    const fixture = TestBed.createComponent(CloudSidebarMembershipComponent)
    fixture.detectChanges()
    tick()
    const pending = new Subject<IMembershipMe>()
    getMe.mockReturnValue(pending)
    revisions.next()
    fixture.detectChanges()
    tick()
    expect(getMe).toHaveBeenCalledTimes(2)
    expect(fixture.componentInstance.account()).toBeNull()
    fixture.destroy()
    expect(pending.observed).toBe(false)
  }))
})
