import { Clipboard } from '@angular/cdk/clipboard'
import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { booleanAttribute, ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { OverlayAnimations } from '@metad/core'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { QRCodeComponent } from 'apps/cloud/src/app/@shared/qrcode'
import { EMPTY, switchMap, tap } from 'rxjs'
import {
  getErrorMessage,
  injectApiBaseUrl,
  injectToastr,
  routeAnimations,
  TChatApp,
  XpertService
} from '../../../../@core'
import { EmojiAvatarComponent } from '../../../../@shared/avatar'
import { XpertDevelopAppComponent, XpertDevelopEmbeddedComponent } from '../develop'
import { XpertComponent } from '../xpert.component'

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
    QRCodeComponent,
  ],
  selector: 'xpert-app',
  templateUrl: './app.component.html',
  styleUrl: 'app.component.scss',
  animations: [routeAnimations, ...OverlayAnimations],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertAppComponent {
  readonly xpertService = inject(XpertService)
  readonly #toastr = injectToastr()
  readonly xpertComponent = inject(XpertComponent)
  readonly #router = inject(Router)
  readonly #route = inject(ActivatedRoute)
  readonly #clipboard = inject(Clipboard)
  readonly #dialog = inject(Dialog)
  readonly apiBaseUrl = injectApiBaseUrl()

  readonly small = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })

  readonly xpert = this.xpertComponent.latestXpert

  readonly avatar = computed(() => this.xpert()?.avatar)
  readonly appUrl = computed(() => window.location.origin + '/x/' + this.xpert()?.slug)
  readonly app = computed(() => this.xpert()?.app)
  readonly published = computed(() => !!this.xpert()?.publishAt)
  readonly enabledApp = computed(() => this.app()?.enabled)

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

  copy(content: string) {
    this.#clipboard.copy(content)
    this.#toastr.info({ code: 'PAC.Xpert.Copied', default: 'Copied' })
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
