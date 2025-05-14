import { computed, effect, inject, Injectable, signal } from '@angular/core'
import { convertNewSemanticModelResult, NgmSemanticModel } from '@metad/cloud/state'
import { NgmDSCoreService } from '@metad/ocap-angular/core'
import { WasmAgentService } from '@metad/ocap-angular/wasm-agent'
import { Indicator } from '@metad/ocap-core'
import { derivedAsync } from 'ngxtension/derived-async'
import { combineLatest, of, tap } from 'rxjs'
import { injectToastr, registerModel } from '../@core'
import { getErrorMessage, IIndicator, ISemanticModel } from '../@core/types'
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
  readonly #dsCoreService = inject(NgmDSCoreService)
  readonly chatService = inject(ChatService)

  readonly xpert = this.chatService.xpert
  readonly isPublic = computed(() => this.xpert()?.app?.public)

  // SemanticModels
  readonly #semanticModels = signal<
    Record<
      string,
      {
        model?: ISemanticModel
        indicators?: Indicator[]
        dirty?: boolean
      }
    >
  >({})

  // Fetch semantic models details
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
          models.forEach(({ model, indicators }) => {
            const _model = convertNewSemanticModelResult({
              ...model,
              key: model.id
            })

            this.registerModel(_model, indicators)
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

  private registerModel(model: NgmSemanticModel, indicators: IIndicator[]) {
    console.log(`Step 3.`, model, indicators)
    registerModel(model, false, this.#dsCoreService, this.#wasmAgent, indicators)
  }

  /**
   * Collect the semantic models and the corresponding runtime indicators to be registered.
   *
   * @param models Model id and runtime indicators
   */
  registerSemanticModel(models: { id: string; indicators?: Indicator[] }[]) {
    this.#semanticModels.update((state) => {
      models.forEach(({ id, indicators }) => {
        state[id] ??= {}
        if (indicators) {
          state[id].indicators ??= []
          state[id].indicators = [
            ...state[id].indicators.filter((_) => !indicators.some((i) => i.code === _.code)),
            ...indicators
          ]
        }
      })
      return { ...state }
    })

    console.log(`Step 1.`, models)
  }
}
