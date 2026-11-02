import { ComponentFixture, TestBed } from '@angular/core/testing'
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { signal } from '@angular/core'
import { AIPermissionsEnum, AppPlatformStatus } from '@xpert-ai/contracts'
import { Store } from '../../@core/state'
import { AppPlatformService } from '../../@core/services/app-platform.service'
import { AppPlatformPageComponent } from './app-platform-page.component'

const status = (): AppPlatformStatus => ({
  mode: 'managed-apps',
  branding: { name: 'Test' },
  platformKey: 'test',
  version: 1,
  organizationId: 'organization',
  home: 'main',
  ready: false,
  apps: [{ key: 'main', required: true, status: 'pending', entries: [] }]
})

describe('App preparation within the website layout', () => {
  let fixture: ComponentFixture<AppPlatformPageComponent>
  const permission = { permission: AIPermissionsEnum.CHAT_VIEW, enabled: true }
  const platform = { status: signal<AppPlatformStatus | null>(null), refresh: jest.fn() }
  const router = { navigate: jest.fn(), navigateByUrl: jest.fn() }
  const route = { snapshot: { queryParamMap: convertToParamMap({}) } }
  const ready = () => {
    const result = status()
    result.ready = true
    result.apps[0] = {
      ...result.apps[0],
      status: 'ready',
      entries: [{ key: 'assistant', id: 'entry', slug: 'assigned', title: 'Main' }]
    }
    return result
  }

  beforeEach(() => {
    jest.useFakeTimers()
    jest.clearAllMocks()
    permission.enabled = true
    platform.status.set(null)
    platform.refresh.mockResolvedValue(status())
    route.snapshot.queryParamMap = convertToParamMap({})
    TestBed.configureTestingModule({
      imports: [AppPlatformPageComponent, TranslateModule.forRoot()],
      providers: [
        { provide: AppPlatformService, useValue: platform },
        { provide: Store, useValue: { user: { role: { rolePermissions: [permission] } } } },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: route }
      ]
    })
    fixture = TestBed.createComponent(AppPlatformPageComponent)
  })
  afterEach(() => {
    fixture.destroy()
    TestBed.resetTestingModule()
    jest.useRealTimers()
  })

  it('polls preparation and enters the assigned Assistant when ready', async () => {
    await fixture.componentInstance.refresh()
    expect(router.navigate).not.toHaveBeenCalled()
    platform.refresh.mockResolvedValue(ready())
    await jest.advanceTimersByTimeAsync(3000)
    expect(router.navigate).toHaveBeenCalledWith(['/chat/x', 'assigned'], { replaceUrl: true })
    expect(fixture.componentInstance.busy()).toBe(false)
  })

  it.each(['/chat/x/assigned/c/thread?view=studio', '/project'])(
    'resumes a permitted business URL: %s',
    async (returnUrl) => {
      route.snapshot.queryParamMap = convertToParamMap({ returnUrl })
      platform.refresh.mockResolvedValue(ready())
      await fixture.componentInstance.refresh()
      expect(router.navigateByUrl).toHaveBeenCalledWith(returnUrl, { replaceUrl: true })
    }
  )

  it('falls back to the assigned home for an external return URL', async () => {
    route.snapshot.queryParamMap = convertToParamMap({ returnUrl: '//outside.example' })
    platform.refresh.mockResolvedValue(ready())
    await fixture.componentInstance.refresh()
    expect(router.navigateByUrl).not.toHaveBeenCalled()
    expect(router.navigate).toHaveBeenCalledWith(['/chat/x', 'assigned'], { replaceUrl: true })
  })

  it('stops polling a failed required App until the user retries', async () => {
    const failed = status()
    failed.apps[0].status = 'failed'
    platform.refresh.mockResolvedValue(failed)
    await fixture.componentInstance.refresh()
    expect(fixture.componentInstance.error()).toBe(true)
    await jest.advanceTimersByTimeAsync(6000)
    expect(platform.refresh).toHaveBeenCalledTimes(1)
    await fixture.componentInstance.refresh(true)
    expect(platform.refresh).toHaveBeenLastCalledWith(true)
  })

  it('checks chat permission before requesting preparation', async () => {
    permission.enabled = false
    await fixture.componentInstance.refresh()
    expect(platform.refresh).not.toHaveBeenCalled()
    expect(fixture.componentInstance.error()).toBe(true)
  })

  it('does not navigate after the page is destroyed during a request', async () => {
    let complete: (value: AppPlatformStatus) => void = () => undefined
    platform.refresh.mockReturnValue(
      new Promise<AppPlatformStatus>((resolve) => {
        complete = resolve
      })
    )
    const pending = fixture.componentInstance.refresh()
    fixture.destroy()
    complete(ready())
    await pending
    expect(router.navigate).not.toHaveBeenCalled()
    expect(router.navigateByUrl).not.toHaveBeenCalled()
  })
})
