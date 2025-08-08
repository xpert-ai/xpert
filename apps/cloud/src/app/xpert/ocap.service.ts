import { computed, effect, inject, Injectable, signal } from '@angular/core'
import { convertNewSemanticModelResult, NgmSemanticModel } from '@metad/cloud/state'
import { NgmDSCoreService } from '@metad/ocap-angular/core'
import { WasmAgentService } from '@metad/ocap-angular/wasm-agent'
import { PropertyMeasure } from '@metad/ocap-core'
import { derivedAsync } from 'ngxtension/derived-async'
import { combineLatest, of, tap } from 'rxjs'
import { injectToastr, registerModel, ServerSocketAgent } from '../@core'
import { getErrorMessage, ISemanticModel } from '../@core/types'
import { XpertHomeService } from './home.service'
import { ChatService } from './chat.service'

/**
 * State service for ocap framework
 */
@Injectable()
export class XpertOcapService {
  readonly homeService = inject(XpertHomeService)
  readonly #toastr = injectToastr()
  readonly #wasmAgent? = inject(WasmAgentService, { optional: true })
  readonly #serverAgent = inject(ServerSocketAgent)
  readonly #dsCoreService = inject(NgmDSCoreService)
  readonly chatService = inject(ChatService)

  readonly xpert = this.chatService.xpert
  readonly isPublic = computed(() => this.xpert()?.app?.public)

  // SemanticModels
  readonly #semanticModels = signal<
    Record<
      string,
      {
        model?: ISemanticModel // Semantic model details from the server
        // indicators?: IIndicator[] // Runtime indicators to be registered
        isDraft?: boolean // Whether use the model draft
        isIndicatorsDraft?: boolean // Whether use the indicators draft
        dirty?: boolean // Whether the model or indicators is dirty and needs to be registered
        isDraftIndicators?: string[] // Indicate which indicators use draft
        calculatedMeasures?: Record<string, PropertyMeasure[]> // Runtime calculated measures to be registered
      }
    >
  >({})

  /**
   * Fetch semantic models details
   */
  readonly _semanticModels = derivedAsync(() => {
    const ids = Object.keys(this.#semanticModels()).filter((id) => !this.#semanticModels()[id].model)
    if (ids.length) {
      return combineLatest(ids.map((id) => 
        this.isPublic() ? this.homeService.selectPublicSemanticModel(id) : this.homeService.selectSemanticModel(id))
      ).pipe(
        tap({
          error: (err) => {
            this.#toastr.error(getErrorMessage(err))
          }
        })
      )
    } else {
      return of(null)
    }
  })

  constructor() {
    effect(() => {
      if (this.isPublic()) {
        this.#serverAgent.setServerOptions({ modelEnv: 'public' })
      }
    })
    // Got model details
    effect(
      () => {
        const models = this._semanticModels()
        if (models) {
          this.#semanticModels.update((state) => {
            models.forEach((model) => {
              state[model.id] = {
                ...state[model.id],
                model,
                dirty: true
              }
            })

            return {
              ...state
            }
          })
        }
      },
      { allowSignalWrites: true }
    )

    // Register the model when all conditions are ready
    effect(
      () => {
        const semanticModels = this.#semanticModels() ?? {}

        const models = Object.values(semanticModels).filter((model) => model.dirty && model.model)
        if (models.length) {
          console.log(`Step 2.`, models)
          models.forEach(({ model, isDraft, isIndicatorsDraft, isDraftIndicators, calculatedMeasures }) => {
            // Use the draft indicator
            model.indicators = model.indicators?.map((_) => {
              if (isIndicatorsDraft || isDraftIndicators?.includes(_.code) && _.draft) {
                return {
                  ..._,
                  ..._.draft,
                  status: null
                }
              }
              return _
            })

            const _model = convertNewSemanticModelResult({
              ...model,
              key: model.id
            })

            this.registerModel({..._model}, isDraft, isIndicatorsDraft, calculatedMeasures)
          })

          this.#semanticModels.update((state) => {
            return Object.keys(state).reduce((acc, key) => {
              acc[key] = { ...state[key], dirty: state[key].model ? false : state[key].dirty }
              return acc
            }, {})
          })
        }
      },
      { allowSignalWrites: true }
    )
  }

  private registerModel(model: NgmSemanticModel, isDraft: boolean, isIndicatorsDraft?: boolean, calculatedMeasures?: Record<string, PropertyMeasure[]>) {
    console.log(`Step 3.`, model, calculatedMeasures)

    registerModel({...model, isIndicatorsDraft}, isDraft, this.#dsCoreService, this.#wasmAgent, calculatedMeasures)
  }

  /**
   * Collect the semantic models and the corresponding runtime indicators to be registered.
   *
   * @param models Model id and runtime indicators
   */
  registerSemanticModel(models: { id: string; isDraft: boolean; isDraftIndicators?: string[];
    calculatedMeasures?: Record<string, PropertyMeasure[]>
   }[]) {
    this.#semanticModels.update((state) => {
      models.forEach(({ id, isDraft, isDraftIndicators, calculatedMeasures }) => {
        state[id] ??= {}

        if (isDraft != null) {
          state[id].isDraft = isDraft
        }

        state[id] = {
          ...state[id],
          dirty: true,
          isDraftIndicators,
          calculatedMeasures: mergeCalculatedMeasures(state[id].calculatedMeasures ?? {}, calculatedMeasures ?? {}),
        }
      })
      return { ...state }
    })

    console.log(`Step 1.`, models)
  }

  refreshModel(id: string, isIndicatorsDraft?: boolean) {
    this.#semanticModels.update((state) => {
      return { 
        ...state,
        [id]: {
          ...state[id],
          model: null, // Reset the model to fetch again
          dirty: true,
          isIndicatorsDraft
        }
      }
    })
  }
}

// Create a function to merege two calculatedMeasures by name
export function mergeCalculatedMeasures(
  measures1: Record<string, PropertyMeasure[]>,
  measures2: Record<string, PropertyMeasure[]>
): Record<string, PropertyMeasure[]> {
  const merged: Record<string, PropertyMeasure[]> = { ...measures1 }

  Object.keys(measures2).forEach((entity) => {
    merged[entity] = merged[entity] ? [...merged[entity]] : []
    measures2[entity].forEach((measure) => {
      const existingIndex = merged[entity].findIndex((m) => m.name === measure.name)
      if (existingIndex > -1) {
        merged[entity][existingIndex] = { ...merged[entity][existingIndex], ...measure }
      } else {
        merged[entity].push(measure)
      }
    })
  })

  return merged
}