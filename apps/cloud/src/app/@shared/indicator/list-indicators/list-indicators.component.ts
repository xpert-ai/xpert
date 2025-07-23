import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, computed, inject, input, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { DateRelativePipe, getErrorMessage, injectToastr } from '@cloud/app/@core'
import { EmbeddingStatusEnum, IndicatorsService, IndicatorStatusEnum } from '@metad/cloud/state'
import { IfAnimation } from '@metad/core'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { linkedModel, myRxResource } from '@metad/ocap-angular/core'
import { WaIntersectionObserver } from '@ng-web-apis/intersection-observer'
import { TranslateModule } from '@ngx-translate/core'
import { of } from 'rxjs'
import { XpIndicatorFormComponent } from '../indicator-form/indicator-form.component'

@Component({
  standalone: true,
  selector: 'xp-list-indicators',
  templateUrl: 'list-indicators.component.html',
  styleUrls: ['list-indicators.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    CdkMenuModule,
    MatTooltipModule,
    WaIntersectionObserver,
    NgmSpinComponent,
    DateRelativePipe,
    XpIndicatorFormComponent
  ],
  animations: [IfAnimation]
})
export class XpListIndicatorsComponent {
  eIndicatorStatusEnum = IndicatorStatusEnum
  eEmbeddingStatusEnum = EmbeddingStatusEnum

  readonly indicatorAPI = inject(IndicatorsService)
  readonly #toastr = injectToastr()

  // Inputs
  readonly data = input<{ data: string[] }>()

  // States
  readonly ids = computed(() => this.data()?.data)
  readonly #indicators = myRxResource({
    request: () => this.ids(),
    loader: ({ request }) => {
      return request?.length
        ? this.indicatorAPI.getAll({ where: { id: { $in: request } } })
        : of({ items: [], total: 0 })
    }
  })

  readonly loading = linkedModel({
    initialValue: false,
    compute: () => this.#indicators.status() === 'loading',
    update: (val) => {}
  })

  readonly indicators = linkedModel({
    initialValue: [],
    compute: () => this.#indicators.value()?.items,
    update: (value) => {
      //
    }
  })

  readonly editingIndicatorId = signal<string | null>(null)

  readonly embeddingIndicators = signal<Record<string, boolean>>({})

  editIndicator(id: string) {
    this.editingIndicatorId.set(id)
  }

  exitEdit() {
    this.editingIndicatorId.set(null)
  }

  embedding(id: string) {
    this.embeddingIndicators.update((prev) => ({ ...prev, [id]: true }))
    this.indicatorAPI.embedding(id).subscribe({
      next: (indicator) => {
        this.embeddingIndicators.update((prev) => ({ ...prev, [id]: false }))
        this.indicators.update((items) => {
          const index = items.findIndex((item) => item.id === id)
          if (index > -1) {
            items[index] = {
              ...items[index],
              embeddingStatus: indicator.embeddingStatus
            }
          }
          return [...items]
        })
      },
      error: (error) => {
        this.embeddingIndicators.update((prev) => ({ ...prev, [id]: false }))
        this.#toastr.error(getErrorMessage(error))
      }
    })
  }
}
