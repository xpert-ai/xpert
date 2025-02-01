import { effect, inject, Injectable, signal } from '@angular/core'
import { convertNewSemanticModelResult, NgmSemanticModel, SemanticModelServerService } from '@metad/cloud/state'
import { NgmDSCoreService } from '@metad/ocap-angular/core'
import { WasmAgentService } from '@metad/ocap-angular/wasm-agent'
import { Indicator } from '@metad/ocap-core'
import { derivedAsync } from 'ngxtension/derived-async'
import { combineLatest, Observable, of, shareReplay, tap } from 'rxjs'
import {
  ChatConversationService,
  getErrorMessage,
  IChatConversation,
  injectToastr,
  ISemanticModel,
  IXpert,
  registerModel,
  XpertService
} from '../@core'
import { AppService } from '../app.service'

/**
 * The overall context of the Xpert chat page, no switching between conversations.
 */
@Injectable()
export class XpertHomeService {
  readonly appService = inject(AppService)
  readonly xpertService = inject(XpertService)
  readonly conversationService = inject(ChatConversationService)
  readonly semanticModelService = inject(SemanticModelServerService)
  readonly #dsCoreService = inject(NgmDSCoreService)
  readonly #wasmAgent? = inject(WasmAgentService, {optional: true})
  readonly #toastr = injectToastr()
  readonly lang = this.appService.lang

  readonly conversations = signal<IChatConversation[]>([])
  readonly conversationId = signal<string>(null)

  // Xperts details
  readonly #xperts: Record<string, Observable<IXpert>> = {}

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
      return combineLatest(
        ids.map((id) =>
          this.semanticModelService.getById(id, {
            relations: ['indicators', 'createdBy', 'updatedBy', 'dataSource', 'dataSource.type']
          })
        )
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
        const models = Object.values(this.#semanticModels()).filter((model) => model.dirty && model.model)
        if (models.length) {
          models.forEach(({ model, indicators }) => {
            const _model = convertNewSemanticModelResult({
              ...model,
              key: model.id
            })

            this.registerModel({ ..._model, indicators: [..._model.indicators, ...(indicators ?? [])] })
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

  getXpert(slug: string) {
    if (!this.#xperts[slug]) {
      this.#xperts[slug] = this.xpertService.getBySlug(slug).pipe(
        shareReplay(1)
      )
    }
    return this.#xperts[slug]
  }

  deleteConversation(id: string) {
    this.conversations.update((items) => items.filter((item) => item.id !== id))
    this.conversationService.delete(id).subscribe({
      next: () => {}
    })
  }

  private registerModel(model: NgmSemanticModel) {
    registerModel(model, this.#dsCoreService, this.#wasmAgent)
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
  }
}
