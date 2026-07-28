import { MissingTranslationHandler, MissingTranslationHandlerParams } from '@ngx-translate/core'

export class NgmMissingTranslationHandler implements MissingTranslationHandler {
  handle(params: MissingTranslationHandlerParams) {
    if (params.interpolateParams) {
      return params.interpolateParams['Default'] || params.key
    }
    return params.key
  }
}
