import { TestBed } from '@angular/core/testing'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { AppPlatformStorageUsage } from '@xpert-ai/contracts'
import { BehaviorSubject, of, Subject, throwError } from 'rxjs'
import { Store } from '../../../@core/services/store.service'
import { AppPlatformService } from '../../../@core/services/app-platform.service'
import zhHans from '../../../../assets/i18n/zh-Hans.json'
import { AccountStorageUsageComponent } from './storage-usage.component'

const measured: AppPlatformStorageUsage = {
  limitBytes: 2 * 1024 ** 3,
  snapshot: {
    fileBytes: 2 * 1024 ** 3,
    databaseBytes: 20 * 1024 ** 2,
    usedBytes: 2 * 1024 ** 3 + 20 * 1024 ** 2,
    measuredAt: '2026-11-18T05:38:08Z',
    stale: false,
    refreshPending: false
  }
}

describe('account storage display', () => {
  const selectedOrganization$ = new BehaviorSubject({ tenantId: 'tenant', id: 'org' })
  const platform = { getStorageUsage: jest.fn() }
  beforeEach(() => {
    selectedOrganization$.next({ tenantId: 'tenant', id: 'org' })
    platform.getStorageUsage.mockReset().mockReturnValue(of(measured))
    TestBed.configureTestingModule({
      imports: [AccountStorageUsageComponent, TranslateModule.forRoot()],
      providers: [
        { provide: AppPlatformService, useValue: platform },
        { provide: Store, useValue: { selectedOrganization$ } }
      ]
    })
    const translate = TestBed.inject(TranslateService)
    translate.setTranslation('zh-Hans', zhHans)
    translate.use('zh-Hans')
  })

  afterEach(() => TestBed.resetTestingModule())

  async function render() {
    const fixture = TestBed.createComponent(AccountStorageUsageComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    const host: HTMLElement = fixture.nativeElement
    return { fixture, component: fixture.componentInstance, host }
  }

  it('shows real overshoot, zero remaining space and the measured breakdown', async () => {
    const { component, host } = await render()
    expect(host.textContent).toContain('存储空间')
    expect(host.textContent).toContain('2.02 GiB')
    expect(host.textContent).toContain('20 MiB')
    expect(host.textContent).toContain('101%')
    expect(component.progress()).toBe(100)
    expect(component.remaining()).toBe(0)
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('存储空间已满')
  })

  it('reflects a newly assigned storage allowance on refresh', async () => {
    const { component, host, fixture } = await render()
    platform.getStorageUsage.mockReturnValue(of({ ...measured, limitBytes: 20 * 1024 ** 3 }))
    await component.load()
    fixture.detectChanges()
    expect(component.exceeded()).toBe(false)
    expect(host.textContent).toContain('20 GiB')
  })

  it('distinguishes unmeasured usage from an empty account', async () => {
    platform.getStorageUsage.mockReturnValue(of({ limitBytes: measured.limitBytes, snapshot: null }))
    const { host } = await render()
    expect(host.textContent).toContain('等待统计')
    expect(host.textContent).not.toContain('0 B')
    expect(host.querySelector('z-progress-bar')).toBeNull()
  })

  it('reports old snapshots and keeps the actual measurement timestamp', async () => {
    platform.getStorageUsage.mockReturnValue(of({ ...measured, snapshot: { ...measured.snapshot, stale: true } }))
    const { host } = await render()
    expect(host.textContent).toContain('2026')
    expect(host.textContent).toContain('统计存在延迟')
  })

  it('shows a retryable failure instead of a zero balance and recovers on refresh', async () => {
    platform.getStorageUsage.mockReturnValueOnce(throwError(() => Error('private diagnostics')))
    const { host, component, fixture } = await render()
    expect(host.textContent).toContain('暂时无法读取')
    expect(host.textContent).not.toContain('private diagnostics')
    await component.load()
    fixture.detectChanges()
    expect(host.textContent).toContain('2.02 GiB')
  })

  it('hides the card when no account storage entitlement applies', async () => {
    platform.getStorageUsage.mockReturnValue(of(null))
    const { host } = await render()
    expect(host.querySelector('z-card')).toBeNull()
  })

  it('clears old usage on organization switch and ignores its late response', async () => {
    const pending = new Subject<AppPlatformStorageUsage>()
    platform.getStorageUsage.mockReturnValueOnce(pending)
    const fixture = TestBed.createComponent(AccountStorageUsageComponent)
    fixture.detectChanges()
    platform.getStorageUsage.mockReturnValue(of({ ...measured, limitBytes: 10 * 1024 ** 3 }))
    selectedOrganization$.next({ tenantId: 'tenant', id: 'other-org' })
    await fixture.whenStable()
    pending.next(measured)
    pending.complete()
    await fixture.whenStable()
    expect(fixture.componentInstance.usage()?.limitBytes).toBe(10 * 1024 ** 3)
  })

  it('does not apply a late response after leaving the account page', async () => {
    const pending = new Subject<AppPlatformStorageUsage>()
    platform.getStorageUsage.mockReturnValue(pending)
    const fixture = TestBed.createComponent(AccountStorageUsageComponent)
    fixture.detectChanges()
    fixture.destroy()
    pending.next(measured)
    pending.complete()
    await Promise.resolve()
    expect(fixture.componentInstance.usage()).toBeNull()
  })
})
