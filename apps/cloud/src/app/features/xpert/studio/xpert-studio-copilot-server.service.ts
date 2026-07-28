import { computed, inject, Injectable } from '@angular/core'
import { toObservable } from '@angular/core/rxjs-interop'
import { CopilotServerService } from '@cloud/app/@core'
import { AiModelTypeEnum } from '@xpert-ai/contracts'
import { distinctUntilChanged, of, switchMap } from 'rxjs'
import { XpertStudioApiService } from './domain'

@Injectable()
export class XpertStudioCopilotServerService extends CopilotServerService {
  readonly #studio = inject(XpertStudioApiService)
  readonly #xpertId$ = toObservable(computed(() => this.#studio.xpert()?.id ?? null))

  override getCopilotModels(type: AiModelTypeEnum) {
    return this.#xpertId$.pipe(
      distinctUntilChanged(),
      switchMap((xpertId) => (xpertId ? this.getXpertCopilotModels(xpertId, type) : of([])))
    )
  }
}
