import { inject } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { TranslateService } from '@ngx-translate/core'

export function injectTranslate(key?: string) {
  const translate = inject(TranslateService)

  return toSignal(translate.stream(key))
}
