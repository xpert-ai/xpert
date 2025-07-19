import { computed, Directive, effect, inject, signal } from '@angular/core'
import { getErrorMessage, injectToastr } from '@cloud/app/@core'
import { extractSemanticModelDraft, SemanticModelServerService, TSemanticModelDraft } from '@metad/cloud/state'
import { linkedModel } from '@metad/ocap-angular/core'
import { isEqual, Schema } from '@metad/ocap-core'
import { derivedAsync } from 'ngxtension/derived-async'
import { ModelStudioService } from './studio/studio.service'

@Directive()
export class ModelDraftBaseComponent {
  readonly modelAPI = inject(SemanticModelServerService)
  readonly studioService = inject(ModelStudioService)
  readonly #toastr = injectToastr()

  // States
  readonly modelId = signal<string>(null)
  readonly cubeName = signal<string>(null)
  readonly semanticModel = derivedAsync(() => {
    return this.modelId()
      ? this.modelAPI.getOneById(this.modelId(), { relations: ['dataSource', 'dataSource.type'] })
      : null
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
  readonly cube = linkedModel({
    initialValue: null,
    compute: () =>
      this.draft()?.schema?.cubes?.find((cube) => cube.name === this.cubeName())
    ,
    update: (cube) => {
      this.draft.update((draft) => {
        if (draft.schema && cube) {
          const cubes = draft.schema.cubes ? [...draft.schema.cubes] : []
          const index = cubes.findIndex((c) => c.__id__ === cube.__id__)
          if (index > -1) {
            cubes[index] = cube
          } else {
            cubes.push(cube)
          }
          return {...draft, schema: { ...draft.schema, cubes } }
        }

        return draft
      })
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
