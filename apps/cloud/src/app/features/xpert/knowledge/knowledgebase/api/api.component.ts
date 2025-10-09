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
  XpertAPIService
} from '../../../../../@core'
import { XpertDevelopApiKeyComponent } from '../../../xpert/develop'

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
  selector: 'xpert-knowledgebase-api',
  templateUrl: './api.component.html',
  styleUrl: 'api.component.scss',
  animations: [routeAnimations, ...OverlayAnimations],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertKBAPIComponent {
  readonly xpertService = inject(XpertAPIService)
  readonly #toastr = injectToastr()
  readonly #router = inject(Router)
  readonly #route = inject(ActivatedRoute)
  readonly #clipboard = inject(Clipboard)
  readonly #dialog = inject(Dialog)
  readonly apiBaseUrl = injectApiBaseUrl()

  // Inputs
  readonly id = input<string>('')

  readonly apiUrl = computed(() => this.apiBaseUrl + '/api/ai/')
  readonly small = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })

  readonly loading = signal(false)

  

  copy(content: string) {
    this.#clipboard.copy(content)
    this.#toastr.info({ code: 'PAC.Xpert.Copied', default: 'Copied' })
  }

  openApiReference() {
    window.open(this.apiBaseUrl + '/swg', '_blank')
  }

  openApiKey() {
    this.#dialog
      .open(XpertDevelopApiKeyComponent, {
        data: {
          id: this.id(),
          type: 'knowledgebase'
        }
      })
      .closed.subscribe({
        next: () => {}
      })
  }
}
