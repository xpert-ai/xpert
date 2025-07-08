import { inject } from '@angular/core'
import { TranslateService } from '@ngx-translate/core'

/**
 * Extends this class to use the getTranslation method
 * @deprecated Use `I18nService` instead
 */
export abstract class TranslationBaseComponent {
  public readonly translateService = inject(TranslateService)

  getTranslation(prefix: string, params?: Object) {
    let result: any
    this.translateService.get(prefix, params).subscribe((res) => {
      result = res
    })

    return result
  }
}
