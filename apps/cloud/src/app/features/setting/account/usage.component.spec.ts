import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import {
  IMembershipUsageOverview,
  IUserMembershipPeriod,
  MembershipPeriodEnum,
  MembershipPlanStatusEnum
} from '@xpert-ai/contracts'
import { Subject, of, throwError } from 'rxjs'
import { MembershipService, ToastrService } from '../../../@core'
import { XpAccountUsageComponent } from './usage.component'

describe('personal consumption overview', () => {
  afterEach(() => TestBed.resetTestingModule())
  it('loads from non-completing scope streams and preserves usage precision behind integer display', () => {
    const overview = new Subject<IMembershipUsageOverview>()
    const activity = new Subject<IMembershipUsageOverview>()
    const periods = new Subject<IUserMembershipPeriod[]>()
    TestBed.configureTestingModule({
      imports: [XpAccountUsageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        {
          provide: MembershipService,
          useValue: {
            getOverview: jest.fn().mockReturnValueOnce(overview).mockReturnValueOnce(activity),
            getMyPeriods: () => periods
          }
        },
        { provide: ToastrService, useValue: { error: jest.fn() } }
      ]
    })
    const fixture = TestBed.createComponent(XpAccountUsageComponent)
    fixture.detectChanges()
    const result: IMembershipUsageOverview = {
      plan: {
        code: 'test',
        name: 'Test plan',
        level: 1,
        status: MembershipPlanStatusEnum.Active,
        period: MembershipPeriodEnum.Monthly,
        includedPoints: null
      },
      pointsGranted: null,
      pointsUsed: 0,
      consumedPoints: 2203.208332,
      pointsRemaining: null,
      totalTokens: 0,
      peakDailyTokens: 0,
      activeDays: 1,
      buckets: [{ date: '2026-10-03', pointsUsed: 0.05704, tokenUsed: 0 }],
      topModels: [],
      topXperts: [],
      topThreads: []
    }
    overview.next(result)
    periods.next([])
    expect(fixture.componentInstance.loading()).toBe(true)
    activity.next(result)
    fixture.detectChanges()
    expect(fixture.componentInstance.loading()).toBe(false)
    expect(fixture.componentInstance.overview()?.consumedPoints).toBe(2203.208332)
    expect(fixture.componentInstance.activityBuckets()).toEqual(result.buckets)
    const host: HTMLElement = fixture.nativeElement
    expect(host.textContent).toContain('2,203')
    expect(host.textContent).not.toContain('2,203.208332')
    expect(host.querySelector('z-progress-bar')).toBeNull()
    expect(host.querySelector('a[href="/settings/account/billing"]')).not.toBeNull()
    fixture.destroy()
  })

  it('shows a retry state instead of zero usage on failure and recovers without fabricating plan benefits', () => {
    let fail = true
    const empty: IMembershipUsageOverview = {
      totalTokens: 0,
      peakDailyTokens: 0,
      activeDays: 0,
      buckets: [],
      topModels: [],
      topXperts: [],
      topThreads: []
    }
    TestBed.configureTestingModule({
      imports: [XpAccountUsageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        {
          provide: MembershipService,
          useValue: {
            getOverview: () => (fail ? throwError(() => new Error('Unavailable')) : of(empty)),
            getMyPeriods: () => of([])
          }
        },
        { provide: ToastrService, useValue: { error: jest.fn() } }
      ]
    })
    const fixture = TestBed.createComponent(XpAccountUsageComponent)
    fixture.detectChanges()
    const host: HTMLElement = fixture.nativeElement
    expect(host.textContent).toContain('XP.UsageDashboard.LoadFailed')
    expect(host.textContent).not.toContain('XP.Membership.UsedPoints')
    fail = false
    host.querySelector<HTMLButtonElement>('z-empty button')?.click()
    fixture.detectChanges()
    expect(fixture.componentInstance.loadFailed()).toBe(false)
    expect(host.textContent).toContain('XP.UsageDashboard.NoPlan')
    expect(host.textContent).toContain('XP.UsageDashboard.NoConsumption')
    expect(host.textContent).not.toContain('XP.Membership.MemberStatuses.active')
    expect(host.querySelector('z-progress-bar')).toBeNull()
    fixture.destroy()
  })
})
