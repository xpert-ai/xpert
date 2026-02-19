import { Provider } from '@angular/core'
import { ICopilot } from '@metad/copilot'
import { NgmCopilotEngineService } from './engine.service'

export function provideClientCopilot(factory: () => Promise<ICopilot>) {
  return [
    NgmCopilotEngineService
  ] as Provider[]
}
