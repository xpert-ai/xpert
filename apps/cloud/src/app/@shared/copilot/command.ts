import { inject } from '@angular/core'
import { TranslateService } from '@ngx-translate/core'
import { NGXLogger } from 'ngx-logger'

export function injectChatCommand() {
  const logger = inject(NGXLogger)
  const translate = inject(TranslateService)

  const commandName = 'chat'
  return null
}
