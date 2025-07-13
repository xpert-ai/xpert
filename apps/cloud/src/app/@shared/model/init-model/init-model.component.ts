import { CommonModule } from '@angular/common'
import { Component, computed, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { OrderTypeEnum, SemanticModelServerService } from '@metad/cloud/state'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { linkedModel, myRxResource } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { map } from 'rxjs/operators'
import { AbstractInterruptComponent } from '../../agent'
import { NgmSelectComponent } from '../../common'

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, NgmSpinComponent, NgmSelectComponent],
  selector: 'model-init-model',
  templateUrl: 'init-model.component.html',
  styleUrls: ['init-model.component.scss']
})
export class InitModelComponent extends AbstractInterruptComponent {
  readonly modelsAPI = inject(SemanticModelServerService)

  readonly #models = myRxResource({
    request: () => ({}),
    loader: () =>
      this.modelsAPI
        .getMyModels({
          select: ['id', 'name', 'description'],
          order: {
            updatedAt: OrderTypeEnum.DESC
          }
        })
        .pipe(
          map((models) =>
            models.map((item) => ({
              label: item.name,
              description: item.description,
              value: item.id,
            }))
          )
        )
  })

  readonly models = this.#models.value
  readonly loading = computed(() => this.#models.status() === 'loading')

  readonly modelId = linkedModel({
    initialValue: null,
    compute: () => this.value()?.modelId ?? null,
    update: (value) => {
      this.value.update((state) => ({ ...(state ?? {}), modelId: value }))
    }
  })
}
