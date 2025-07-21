import { computed, Directive, effect, inject, signal } from '@angular/core'
import { getErrorMessage, injectToastr } from '@cloud/app/@core'
import { extractSemanticModelDraft, SemanticModelServerService, TSemanticModelDraft } from '@metad/cloud/state'
import { linkedModel, NgmDSCoreService } from '@metad/ocap-angular/core'
import { isEntitySet, Schema } from '@metad/ocap-core'
import { derivedAsync } from 'ngxtension/derived-async'
import { getSemanticModelKey } from '@metad/story/core'
import { ModelStudioService } from './model.service'
import { map } from 'rxjs/operators'

@Directive()
export class ModelDraftBaseComponent {
  readonly modelAPI = inject(SemanticModelServerService)
  readonly studioService = inject(ModelStudioService)
  readonly dsCoreService = inject(NgmDSCoreService)
  readonly #toastr = injectToastr()

  // States
  readonly modelId = signal<string>(null)
  readonly cubeName = signal<string>(null)
  readonly semanticModel = derivedAsync(() => {
    return this.modelId()
      ? this.modelAPI.getOneById(this.modelId(), { relations: ['dataSource', 'dataSource.type'] })
      : null
  })
  readonly checklist = this.studioService.checklist

  /**
   * After persistence draft
   */
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

  /**
   * Real-time changes draft
   */
  readonly draft = linkedModel<TSemanticModelDraft<Schema>>({
    initialValue: null,
    compute: () => {
      const model = this.semanticModel()
      return structuredClone(model ? (model.draft ?? extractSemanticModelDraft<Schema>(model)) : null)
    },
    update: (draft) => {
      //
    }
  })

  readonly dataSource = computed(() => getSemanticModelKey(this.semanticModel()))
  readonly dirty = computed(() => JSON.stringify(this.#draft()) !== JSON.stringify(this.draft()))
  readonly saving = signal(false)

  readonly dataSettings = computed(() => ({
    dataSource: this.dataSource(),
    entitySet: this.cubeName()
  }))
  readonly #entityType = derivedAsync(() => {
    const request = this.dataSettings()
    return this.dsCoreService.selectEntitySetOrFail(request.dataSource, request.entitySet).pipe(
        map((entitySet) => {
          if (isEntitySet(entitySet)) {
            return {...entitySet, error: null}
          }
          return {error: entitySet, entityType: null}
        }),
      )
  })
  
  readonly entityType = computed(() => this.#entityType()?.entityType)
  readonly error = computed(() => this.#entityType()?.error)

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
        this.studioService.store.update((state) => ({
          ...state,
          draft: {...structuredClone(draft), ...res}
        }))
      },
      error: (err) => {
        this.saving.set(false)
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }
}
