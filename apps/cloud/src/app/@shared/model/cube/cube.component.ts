import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { getErrorMessage, injectToastr, TMessageContentCube } from '@cloud/app/@core'
import { extractSemanticModelDraft, SemanticModelServerService } from '@metad/cloud/state'
import { linkedModel, NgmDSCoreService } from '@metad/ocap-angular/core'
import { isEqual, Schema } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { derivedAsync } from 'ngxtension/derived-async'
import { CubeStudioComponent } from '../studio/studio.component'
import { ModelStudioService } from '../studio/studio.service'

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'xp-model-cube',
  templateUrl: 'cube.component.html',
  styleUrls: ['cube.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    TranslateModule,
    DragDropModule,
    CubeStudioComponent
  ],
  host: {
    class: 'xp-model-cube'
  },
  providers: [NgmDSCoreService, ModelStudioService]
})
export class ModelCubeComponent {
  readonly modelAPI = inject(SemanticModelServerService)
  readonly studioService = inject(ModelStudioService)
  readonly #toastr = injectToastr()

  // Inputs
  readonly data = input<TMessageContentCube>()

  // States
  readonly modelId = computed(() => this.data()?.data?.modelId)
  readonly cubeName = computed(() => this.data()?.data?.cubeName)
  readonly semanticModel = derivedAsync(() => {
    return this.modelId() ? this.modelAPI.getOneById(this.modelId(), { relations: ['dataSource', 'dataSource.type'] }) : null
  })

  readonly #draft = linkedModel({
    initialValue: null,
    compute: () => {
      const model = this.semanticModel()
      return model ? (model.draft ?? extractSemanticModelDraft<Schema>(model)) : null
    },
    update: (draft) => {
      //
    }
  })

  readonly draft = linkedModel({
    initialValue: null,
    compute: () => {
      const model = this.semanticModel()
      return structuredClone(model ? (model.draft ?? extractSemanticModelDraft<Schema>(model)) : null)
    },
    update: (draft) => {
      //
    }
  })
  readonly dirty = computed(() => !isEqual(this.#draft(), this.draft()))

  readonly saving = signal(false)

  constructor() {
    effect(() => {
      if (this.semanticModel()) {
        this.studioService.initModel(this.semanticModel())
      }
    }, { allowSignalWrites: true })
  }

  save() {
    this.saving.set(true)
    const draft = this.draft()
    this.modelAPI.saveDraft(this.modelId(), draft).subscribe({
      next: (res) => {
        this.saving.set(false)
        this.#draft.set(structuredClone(draft))
      },
      error: (err) => {
        this.saving.set(false)
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }
}
