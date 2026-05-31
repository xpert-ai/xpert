import { Injectable } from '@angular/core'
import { XpertExtensionViewManifest } from '@xpert-ai/contracts'

export type ViewClientCommandContext = {
  hostType: string
  hostId: string
  viewKey: string
  manifest: XpertExtensionViewManifest
}

export type ViewClientCommandHandler = (
  payload: unknown,
  context: ViewClientCommandContext
) => Promise<unknown> | unknown

@Injectable({ providedIn: 'root' })
export class ViewClientCommandRegistry {
  readonly #handlers = new Map<string, ViewClientCommandHandler[]>()

  register(commandKey: string, handler: ViewClientCommandHandler) {
    const handlers = this.#handlers.get(commandKey) ?? []
    handlers.push(handler)
    this.#handlers.set(commandKey, handlers)

    return () => {
      const current = this.#handlers.get(commandKey) ?? []
      const next = current.filter((item) => item !== handler)
      if (next.length) {
        this.#handlers.set(commandKey, next)
      } else {
        this.#handlers.delete(commandKey)
      }
    }
  }

  async execute(commandKey: string, payload: unknown, context: ViewClientCommandContext) {
    const handler = this.#handlers.get(commandKey)?.at(-1)
    if (!handler) {
      return {
        success: false,
        code: 'unsupported',
        message: `Client command '${commandKey}' is not available in this host.`
      }
    }

    return handler(payload, context)
  }
}
