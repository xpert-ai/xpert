import { TestBed } from '@angular/core/testing'
import { By } from '@angular/platform-browser'
import { TranslateModule } from '@ngx-translate/core'
import {
  IMembershipMe,
  IMembershipPointLedger,
  IMembershipUsageSummary,
  MembershipLedgerSourceEnum,
  MembershipPeriodEnum,
  MembershipPlanStatusEnum,
  MembershipRenewalModeEnum,
  MembershipSourceEnum,
  MembershipStatusEnum,
  ModelGatewayUsageChannelEnum
} from '@xpert-ai/contracts'
import { ZardTabGroupComponent } from '@xpert-ai/headless-ui'
import { BehaviorSubject, of, Subject, throwError } from 'rxjs'
import { MembershipService, ToastrService } from '../../../@core'
import { Store } from '../../../@core/state'
import { CopilotUsageService } from '../../../@core/services/copilot-usage.service'
import { XpAccountBillingComponent } from './billing.component'
import { ExecutionUsageComponent } from './execution-usage.component'

const period = {
  currentPeriodStart: new Date('2026-10-01T00:00:00Z'),
  currentPeriodEnd: new Date('2026-11-01T00:00:00Z'),
  pointsGranted: 1000,
  pointsUsed: 25,
  pointsTotalUsed: 25
}
const account: IMembershipMe = {
  ...period,
  consumedPoints: 2203.208332,
  pointsRemaining: 975,
  personalPointsBalance: 12.5,
  personalPointsOnly: false,
  plan: {
    code: 'test',
    name: 'Test plan',
    level: 1,
    status: MembershipPlanStatusEnum.Active,
    period: MembershipPeriodEnum.Monthly,
    includedPoints: 1000
  },
  membership: {
    ...period,
    userId: 'user',
    status: MembershipStatusEnum.Active,
    source: MembershipSourceEnum.Organization,
    renewalMode: MembershipRenewalModeEnum.Auto
  }
}
const group = {
  usageHour: '2026-10-01T00:00:00Z',
  usageChannel: ModelGatewayUsageChannelEnum.ExternalApi,
  organizationId: 'org-a',
  xpertId: 'xpert',
  threadId: 'thread',
  copilotId: 'copilot',
  provider: 'provider',
  model: 'model'
}
const summary: IMembershipUsageSummary = {
  ...group,
  groupKey: group,
  conversationTitle: 'Session title',
  callCount: 2,
  pointsDelta: -1.25,
  pointsUsed: 1.25,
  tokenUsed: 200,
  lastUsedAt: '2026-10-01T00:10:00Z'
}
const ledger: IMembershipPointLedger = {
  id: 'ledger',
  source: MembershipLedgerSourceEnum.PersonalUsage,
  pointsDelta: -1.25,
  createdAt: new Date('2026-10-01T00:10:00Z')
}

describe('personal billing settings', () => {
  const membership = { getMe: jest.fn(), getMyUsageSummary: jest.fn(), getMyDetails: jest.fn() }
  const usage = { getExecutionCalls: jest.fn(), getExecutionCallOptions: jest.fn() }
  beforeEach(() => {
    membership.getMe.mockReset().mockReturnValue(of(account))
    membership.getMyUsageSummary.mockReset().mockReturnValue(of({ items: [summary], total: 1 }))
    membership.getMyDetails.mockReset().mockReturnValue(of({ items: [ledger], total: 1 }))
    usage.getExecutionCalls.mockReset().mockReturnValue(of({ items: [], total: 0 }))
    usage.getExecutionCallOptions.mockReset().mockReturnValue(of({ assistants: [], models: [], tools: [] }))
    TestBed.configureTestingModule({
      imports: [XpAccountBillingComponent, TranslateModule.forRoot()],
      providers: [
        { provide: MembershipService, useValue: membership },
        { provide: ToastrService, useValue: { error: jest.fn() } },
        { provide: Store, useValue: { selectOrganizationId: () => new BehaviorSubject('org-a') } },
        { provide: CopilotUsageService, useValue: usage }
      ]
    })
  })
  afterEach(() => TestBed.resetTestingModule())

  it('keeps model consumption separate from quota deductions and handles unlimited plans', () => {
    const fixture = TestBed.createComponent(XpAccountBillingComponent)
    fixture.detectChanges()
    const component = fixture.componentInstance
    const host: HTMLElement = fixture.nativeElement
    expect(component.me()?.consumedPoints).toBe(2203.208332)
    expect(component.usedPercent()).toBe(3)
    expect(host.textContent).toContain('2,203')
    expect(host.textContent).toContain('975')
    expect(host.textContent).toContain('12.5')
    component.me.set({ ...account, pointsGranted: null, pointsRemaining: null })
    fixture.detectChanges()
    expect(host.querySelector('z-progress-bar')).toBeNull()
    expect(host.textContent).toContain('XP.Membership.Unlimited')
    fixture.destroy()
  })

  it('preserves every detail query dimension, signed values and cached expansion', () => {
    const fixture = TestBed.createComponent(XpAccountBillingComponent)
    fixture.detectChanges()
    const component = fixture.componentInstance
    const tabs: ZardTabGroupComponent = fixture.debugElement.query(
      By.directive(ZardTabGroupComponent)
    ).componentInstance
    tabs.selectedIndex = 1
    fixture.detectChanges()
    const host: HTMLElement = fixture.nativeElement
    host.querySelector<HTMLButtonElement>('button[aria-expanded]')?.click()
    fixture.detectChanges()
    expect(membership.getMyUsageSummary).toHaveBeenCalledWith({ take: 20 })
    expect(membership.getMyDetails).toHaveBeenCalledWith(group)
    expect(host.textContent).toContain('XP.Membership.ApiCall')
    expect(host.textContent).toContain('-1.25')
    expect(host.querySelector('button[aria-expanded]')?.getAttribute('aria-expanded')).toBe('true')
    component.toggleSummary(summary)
    component.toggleSummary(summary)
    expect(membership.getMyDetails).toHaveBeenCalledTimes(1)
    fixture.destroy()
  })

  it('distinguishes loading failures from an empty balance and supports retry', () => {
    membership.getMe.mockReturnValueOnce(throwError(() => new Error('Unavailable')))
    const fixture = TestBed.createComponent(XpAccountBillingComponent)
    fixture.detectChanges()
    const host: HTMLElement = fixture.nativeElement
    expect(host.textContent).toContain('XP.BillingSettings.LoadFailed')
    expect(host.textContent).not.toContain('XP.Membership.RemainingPoints')
    host.querySelector<HTMLButtonElement>('z-empty button')?.click()
    fixture.detectChanges()
    expect(fixture.componentInstance.loadFailed()).toBe(false)
    expect(host.textContent).toContain('975')
    fixture.destroy()
  })

  it('allows failed detail requests to retry and rejects pre-refresh detail responses', () => {
    const fixture = TestBed.createComponent(XpAccountBillingComponent)
    fixture.detectChanges()
    const component = fixture.componentInstance
    membership.getMyDetails.mockReturnValueOnce(throwError(() => new Error('Unavailable')))
    component.toggleSummary(summary)
    expect(component.summaryDetailsFailed()[component.summaryKey(summary)]).toBe(true)
    const pending = new Subject<{ items: IMembershipPointLedger[]; total: number }>()
    membership.getMyDetails.mockReturnValueOnce(pending)
    component.loadSummaryDetails(summary)
    expect(component.isSummaryDetailsLoading(summary)).toBe(true)
    component.load()
    pending.next({ items: [ledger], total: 1 })
    expect(component.getSummaryDetails(summary)).toEqual([])
    component.toggleSummary(summary)
    expect(component.getSummaryDetails(summary)).toEqual([ledger])
    fixture.destroy()
  })

  it('loads tools on demand and preserves filter edits when switching tabs', async () => {
    const fixture = TestBed.createComponent(XpAccountBillingComponent)
    fixture.detectChanges()
    expect(usage.getExecutionCalls).not.toHaveBeenCalled()
    const tabs: ZardTabGroupComponent = fixture.debugElement.query(
      By.directive(ZardTabGroupComponent)
    ).componentInstance
    tabs.selectedIndex = 2
    fixture.detectChanges()
    await fixture.whenStable()
    const tools: ExecutionUsageComponent = fixture.debugElement.query(
      By.directive(ExecutionUsageComponent)
    ).componentInstance
    tools.filters.controls.model.setValue('custom-model')
    tabs.selectedIndex = 0
    fixture.detectChanges()
    tabs.selectedIndex = 2
    fixture.detectChanges()
    expect(fixture.debugElement.query(By.directive(ExecutionUsageComponent)).componentInstance).toBe(tools)
    expect(tools.filters.controls.model.value).toBe('custom-model')
    expect(usage.getExecutionCalls).toHaveBeenCalledTimes(1)
    fixture.destroy()
  })
})
