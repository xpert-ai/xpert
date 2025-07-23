import { Dialog } from '@angular/cdk/dialog'
import { CdkListboxModule } from '@angular/cdk/listbox'
import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject, model, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { uuid } from '@cloud/app/@core'
import { ISemanticModel, OrderTypeEnum, SemanticModelServerService } from '@metad/cloud/state'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { linkedModel, myRxResource } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { EMPTY } from 'rxjs'
import { map, switchMap } from 'rxjs/operators'
import { AbstractInterruptComponent } from '../../agent'
import { NgmSelectComponent } from '../../common'
import { ModelCreationComponent } from '../creation/creation.component'

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, CdkListboxModule, NgmSpinComponent, NgmSelectComponent],
  selector: 'model-init-model',
  templateUrl: 'init-model.component.html',
  styleUrls: ['init-model.component.scss']
})
export class InitModelComponent extends AbstractInterruptComponent<{name?: string}, {modelId?: string}> {
  readonly modelsAPI = inject(SemanticModelServerService)
  readonly #dialog = inject(Dialog)

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
              value: item.id
            }))
          )
        )
  })

  readonly types = model<Array<'Select' | 'New'>>(['Select'])

  readonly models = this.#models.value
  readonly loading = computed(() => this.#models.status() === 'loading')
  readonly createdModel = signal<ISemanticModel | null>(null)

  readonly modelId = linkedModel({
    initialValue: null,
    compute: () => this.value()?.modelId ?? null,
    update: (value) => {
      this.value.update((state) => ({ ...(state ?? {}), modelId: value }))
    }
  })
  readonly name = computed(() => this.data()?.name)

  readonly TYPES_OPTIONS = ['Select', 'New']

  constructor() {
    super()

    effect(() => {
      if (this.name()) {
        this.types.set(['New'])
      }
    }, { allowSignalWrites: true })
  }

  onNewModel() {
    this.#dialog
      .open<ISemanticModel>(ModelCreationComponent, {
        backdropClass: 'xp-overlay-share-sheet',
        panelClass: 'xp-overlay-pane-share-sheet',
        data: {
          name: this.data()?.name
        }
      })
      .closed.pipe(
        switchMap((model) => {
          if (model) {
            return this.modelsAPI.create({
              ...model,
              key: uuid()
            })
          }
          return EMPTY
        })
      )
      .subscribe((model) => {
        this.modelId.set(model.id)
        this.createdModel.set(model)
      })
  }
}
