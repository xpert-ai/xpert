import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { IMembershipUsageOverview, IUserMembershipPeriod } from '@xpert-ai/contracts'
import { Subject } from 'rxjs'
import { MembershipService, ToastrService } from '../../../@core'
import { XpAccountUsageComponent } from './usage.component'

describe('personal consumption overview', () => {
  it('loads from non-completing scope streams and preserves usage precision behind integer display', () => {
    const overview = new Subject<IMembershipUsageOverview>()
    const activity = new Subject<IMembershipUsageOverview>()
    const periods = new Subject<IUserMembershipPeriod[]>()
    TestBed.configureTestingModule({
      imports: [XpAccountUsageComponent, TranslateModule.forRoot()],
      providers: [
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
    fixture.destroy()
    TestBed.resetTestingModule()
  })
})
