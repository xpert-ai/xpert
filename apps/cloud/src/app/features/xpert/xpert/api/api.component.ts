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
import {
  getErrorMessage,
  injectApiBaseUrl,
  injectToastr,
  routeAnimations,
  TChatApi,
  XpertService
} from '../../../../@core'
import { XpertDevelopApiKeyComponent } from '../develop'
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
    MatTooltipModule,
    NgmSpinComponent
  ],
  selector: 'xpert-api',
  templateUrl: './api.component.html',
  styleUrl: 'api.component.scss',
  animations: [routeAnimations, ...OverlayAnimations],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertAPIComponent {
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
  readonly apiUrl = computed(() => this.apiBaseUrl + '/api/ai/')
  readonly api = computed(() => this.xpert()?.api)
  readonly enabledApi = computed(() => !this.api()?.disabled)
  readonly small = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })

  readonly loading = signal(false)

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
    this.#router.navigate(['xpert', this.xpert().id, 'develop'])
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
}
