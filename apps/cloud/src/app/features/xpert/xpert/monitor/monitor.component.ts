import { Clipboard } from '@angular/cdk/clipboard'
import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { OverlayAnimations } from '@metad/core'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { NgmTooltipDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { QRCodeComponent } from 'apps/cloud/src/app/@shared/qrcode'
import { InDevelopmentComponent } from 'apps/cloud/src/app/@theme'
import { EMPTY, switchMap, tap } from 'rxjs'
import {
  getErrorMessage,
  injectApiBaseUrl,
  injectToastr,
  routeAnimations,
  TChatApi,
  TChatApp,
  XpertService
} from '../../../../@core'
import { EmojiAvatarComponent } from '../../../../@shared/avatar'
import { XpertDevelopApiKeyComponent, XpertDevelopAppComponent, XpertDevelopEmbeddedComponent } from '../develop'
import { XpertComponent } from '../xpert.component'
import { XpertStatisticsComponent } from './statistics/statistics.component'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    RouterModule,
    CdkMenuModule,
    EmojiAvatarComponent,
    MatTooltipModule,
    NgmSpinComponent,
    NgmTooltipDirective,
    InDevelopmentComponent,
    QRCodeComponent,
    XpertStatisticsComponent
  ],
  selector: 'xpert-monitor',
  templateUrl: './monitor.component.html',
  styleUrl: 'monitor.component.scss',
  animations: [routeAnimations, ...OverlayAnimations],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertMonitorComponent {
  readonly xpertService = inject(XpertService)
  readonly #toastr = injectToastr()
  readonly xpertComponent = inject(XpertComponent)
  readonly #router = inject(Router)
  readonly #route = inject(ActivatedRoute)
  readonly #clipboard = inject(Clipboard)
  readonly #dialog = inject(Dialog)
  readonly apiBaseUrl = injectApiBaseUrl()

  readonly xpert = this.xpertComponent.latestXpert

  readonly avatar = computed(() => this.xpert()?.avatar)
  readonly appUrl = computed(() => window.location.origin + '/x/' + this.xpert()?.slug)
  readonly apiUrl = computed(() => this.apiBaseUrl + '/api/ai/')
  readonly app = computed(() => this.xpert()?.app)
  readonly enabledApp = computed(() => this.app()?.enabled)
  readonly api = computed(() => this.xpert()?.api)
  readonly enabledApi = computed(() => !this.api()?.disabled)

  readonly loading = signal(false)

  preview() {
    window.open(this.appUrl(), '_blank')
  }

  updateApp(value: Partial<TChatApp>) {
    this.loading.set(true)
    const app = { ...(this.app() ?? {}), ...value }
    this.xpertService.updateChatApp(this.xpert().id, app).subscribe({
      next: () => {
        this.loading.set(false)
        this.xpertComponent.latestXpert.update((state) => ({ ...state, app }))
      },
      error: (err) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }

  updateApi(value: Partial<TChatApi>) {
    this.loading.set(true)
    const api = { ...(this.api() ?? {}), ...value }
    this.xpertService.updateChatApi(this.xpert().id, api).subscribe({
      next: () => {
        this.loading.set(false)
        this.xpertComponent.latestXpert.update((state) => ({ ...state, api }))
      },
      error: (err) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }

  copy(content: string) {
    this.#clipboard.copy(content)
    this.#toastr.info({ code: 'PAC.Xpert.Copied', default: 'Copied' })
  }

  openApiReference() {
    this.#router.navigate(['..', 'develop'], { relativeTo: this.#route })
  }

  openApiKey() {
    this.#dialog
      .open(XpertDevelopApiKeyComponent, {
        data: {
          xpertId: this.xpert().id
        }
      })
      .closed.subscribe({
        next: () => {}
      })
  }

  openEmbedded() {
    this.#dialog
      .open(XpertDevelopEmbeddedComponent, {
        data: {
          xpert: this.xpert()
        }
      })
      .closed.subscribe({
        next: () => {}
      })
  }

  openChatApp() {
    this.loading.set(true)
    this.#dialog
      .open(XpertDevelopAppComponent, {
        data: {
          app: this.app()
        }
      })
      .closed.pipe(
        switchMap((app) =>
          app
            ? this.xpertService
                .updateChatApp(this.xpert().id, app)
                .pipe(tap(() => this.xpert.update((state) => ({ ...state, app }))))
            : EMPTY
        )
      )
      .subscribe({
        next: () => {},
        error: (err) => {
          this.loading.set(false)
          this.#toastr.error(getErrorMessage(err))
        },
        complete: () => {
          this.loading.set(false)
        }
      })
  }
}
