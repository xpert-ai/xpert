import { DOCUMENT } from '@angular/common'
import { DestroyRef, Injectable, InjectionToken, NgZone, computed, inject, signal } from '@angular/core'
import { NavigationError, Router } from '@angular/router'
import { TranslateService } from '@ngx-translate/core'
import { ZardAlertDialogService, ZardToastRef, ZardToastService } from '@xpert-ai/headless-ui'
import { firstValueFrom } from 'rxjs'
import { WEB_RELEASE } from '@cloud/web-release'
import { environment } from '@cloud/environments/environment'
import { ChatkitLifecycleService } from '../chatkit-lifecycle.service'
import { PageLeaveService } from '../page-leave.service'
import { WebUpdateController, WebUpdateState } from './web-update-controller'

export const WEB_UPDATE_WINDOW = new InjectionToken<Window>('Web update browser', { factory: () => window })

@Injectable({ providedIn: 'root' })
export class WebUpdateService {
  private readonly browser = inject(WEB_UPDATE_WINDOW)
  private readonly document = inject(DOCUMENT)
  private readonly zone = inject(NgZone)
  private readonly destroy = inject(DestroyRef)
  private readonly router = inject(Router)
  private readonly toast = inject(ZardToastService)
  private readonly dialog = inject(ZardAlertDialogService)
  private readonly translate = inject(TranslateService)
  private readonly chatkit = inject(ChatkitLifecycleService)
  private readonly pageLeave = inject(PageLeaveService)
  readonly current = WEB_RELEASE
  readonly state = signal<WebUpdateState>({ status: 'idle', latest: null, incomplete: false, dismissed: false })
  readonly updating = signal(false)
  readonly available = computed(() => !!this.state().latest && this.state().latest.buildId !== this.current.buildId)
  readonly statusKey = computed(() => {
    const state = this.state()
    if (state.status === 'checking') return 'Checking'
    if (state.status === 'failed') return 'CheckFailed'
    return state.incomplete
      ? 'UpdateIncomplete'
      : { idle: 'NotChecked', current: 'Latest', available: 'Available' }[state.status]
  })
  private started = false
  private notice: ZardToastRef | null = null
  private noticeBuild: string | null = null
  private readonly controller = new WebUpdateController(
    this.current,
    async (signal) => {
      const response = await this.browser.fetch('/version.json', {
        cache: 'no-store',
        signal,
        headers: { 'ngsw-bypass': 'true' }
      })
      if (!response.ok) throw new Error('Version check failed')
      return response.json()
    },
    {
      getItem: (key) => this.browser.sessionStorage.getItem(key),
      setItem: (key, value) => this.browser.sessionStorage.setItem(key, value),
      removeItem: (key) => this.browser.sessionStorage.removeItem(key)
    },
    (state) =>
      this.zone.run(() => {
        this.state.set(state)
        this.syncNotice()
      })
  )

  start() {
    if (this.started || !environment.production) return
    this.started = true
    const checkVisible = () => {
      if (this.document.visibilityState === 'visible') void this.check()
    }
    const resourceError = (event: Event) => {
      const target = event.target
      if (target instanceof HTMLScriptElement || target instanceof HTMLLinkElement) void this.check()
    }
    this.zone.runOutsideAngular(() => {
      const interval = setInterval(checkVisible, 60000)
      this.document.addEventListener('visibilitychange', checkVisible)
      this.browser.addEventListener('online', checkVisible)
      this.browser.addEventListener('pageshow', checkVisible)
      this.browser.addEventListener('error', resourceError, true)
      const navigation = this.router.events.subscribe((event) => {
        if (event instanceof NavigationError) void this.check()
      })
      this.destroy.onDestroy(() => {
        clearInterval(interval)
        this.document.removeEventListener('visibilitychange', checkVisible)
        this.browser.removeEventListener('online', checkVisible)
        this.browser.removeEventListener('pageshow', checkVisible)
        this.browser.removeEventListener('error', resourceError, true)
        navigation.unsubscribe()
        this.notice?.dismiss()
      })
    })
    void this.check()
    void this.retireLegacyWorker()
  }

  async check() {
    await this.controller.check()
    if (this.state().status === 'current') {
      const url = new URL(this.browser.location.href)
      if (url.searchParams.has('_xpert_update')) {
        url.searchParams.delete('_xpert_update')
        this.browser.history.replaceState(this.browser.history.state, '', url.href)
      }
    }
  }

  async update() {
    if (this.updating() || !this.available()) return
    this.updating.set(true)
    try {
      const confirmed = await firstValueFrom(
        this.dialog.confirm({
          title: this.text('UpdateNow'),
          description: this.text('ConfirmSaved'),
          actionText: this.text('UpdateNow'),
          cancelText: this.translate.instant('COMPONENTS.COMMON.CANCEL'),
          layout: 'standard'
        })
      )
      if (!confirmed) return
      if (!(await this.pageLeave.prepareLeave()) || !(await this.chatkit.prepareLeave())) {
        this.toast.error(this.text('LeaveFailed'))
        return
      }
      // Recheck after the user finishes saving: the server may have rolled back.
      await this.check()
      if (this.state().status === 'failed' || !this.controller.expectUpdate()) return
      const url = new URL(this.browser.location.href)
      url.searchParams.set('_xpert_update', this.state().latest.buildId)
      this.browser.location.replace(url.href)
    } catch {
      this.toast.error(this.text('LeaveFailed'))
    } finally {
      this.updating.set(false)
      this.syncNotice()
    }
  }

  private syncNotice() {
    const state = this.state()
    if (!this.available() || state.dismissed) {
      this.notice?.dismiss()
      this.notice = null
      this.noticeBuild = null
      return
    }
    if (this.updating() || this.noticeBuild === state.latest.buildId) return
    this.notice?.dismiss()
    const buildId = state.latest.buildId
    this.noticeBuild = buildId
    this.notice = this.toast.info(this.text(state.incomplete ? 'UpdateIncomplete' : 'Notice'), {
      id: 'xpert-web-update',
      position: 'bottom-left',
      duration: Infinity,
      closeButton: true,
      action: {
        label: this.text('UpdateNow'),
        onClick: (event) => {
          event.preventDefault()
          void this.update()
        }
      },
      onDismiss: () => {
        if (!this.updating()) this.controller.dismiss(buildId)
      }
    })
  }

  private text(key: string) {
    return this.translate.instant(`XP.WebUpdate.${key}`)
  }

  private async retireLegacyWorker() {
    try {
      const workers = this.browser.navigator.serviceWorker
      if (!workers) return
      for (const registration of await workers.getRegistrations()) {
        const script =
          registration.active?.scriptURL ?? registration.waiting?.scriptURL ?? registration.installing?.scriptURL
        if (
          script === new URL('/ngsw-worker.js', this.browser.location.origin).href &&
          registration.scope === new URL('/', this.browser.location.origin).href
        ) {
          await registration.update()
        }
      }
    } catch {
      /* Retry on the next page load; never fail application startup. */
    }
  }
}
