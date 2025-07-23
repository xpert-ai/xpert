import { computed, effect, inject, Injectable, signal } from '@angular/core'
import { convertNewSemanticModelResult, NgmSemanticModel } from '@metad/cloud/state'
import { NgmDSCoreService } from '@metad/ocap-angular/core'
import { WasmAgentService } from '@metad/ocap-angular/wasm-agent'
import { derivedAsync } from 'ngxtension/derived-async'
import { combineLatest, of, tap } from 'rxjs'
import { injectToastr, registerModel, ServerSocketAgent } from '../@core'
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
        indicators?: IIndicator[] // Runtime indicators to be registered
        isDraft?: boolean // Whether use the model draft
        dirty?: boolean // Whether the model or indicators is dirty and needs to be registered
        isDraftIndicators?: string[] // Indicate which indicators use draft
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
          models.forEach(({ model, isDraft, indicators, isDraftIndicators }) => {
            // Use the draft indicator
            model.indicators = model.indicators?.map((_) => {
              if (isDraftIndicators?.includes(_.code) && _.draft) {
                return {
                  ..._,
                  ..._.draft
                }
              }
              return _
            })

            const _model = convertNewSemanticModelResult({
              ...model,
              key: model.id
            })

            this.registerModel(_model, isDraft, indicators, isDraftIndicators)
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

  private registerModel(model: NgmSemanticModel, isDraft: boolean, indicators: IIndicator[], isDraftIndicators?: string[]) {
    console.log(`Step 3.`, model, indicators)
    registerModel({...model, isDraftIndicators}, isDraft, this.#dsCoreService, this.#wasmAgent, indicators)
  }

  /**
   * Collect the semantic models and the corresponding runtime indicators to be registered.
   *
   * @param models Model id and runtime indicators
   */
  registerSemanticModel(models: { id: string; isDraft: boolean; indicators?: IIndicator[]; isDraftIndicators?: string[] }[]) {
    this.#semanticModels.update((state) => {
      models.forEach(({ id, isDraft, indicators, isDraftIndicators }) => {
        state[id] ??= {}
        if (indicators) {
          state[id].indicators ??= []
          state[id].indicators = [
            ...state[id].indicators.filter((_) => !indicators.some((i) => i.code === _.code)),
            ...indicators
          ]
        }
        if (isDraft != null) {
          state[id].isDraft = isDraft
        }

        state[id] = {
          ...state[id],
          dirty: true,
          isDraftIndicators
        }
      })
      return { ...state }
    })

    console.log(`Step 1.`, models)
  }
}
