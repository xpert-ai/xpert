import { inject, Pipe, PipeTransform } from '@angular/core'
import { TranslateService } from '@ngx-translate/core'
import i18next from 'i18next'

/**
 * Compatible with both `i18next` and `@ngx-translate` frameworks, distinguished by whether there is a `namespace` in key or params.
 * 
 * ```html
 * <!-- i18next -->
 * <div>{{'ns:key' | translate: {Default: 'default value'} }}</div>
 * <div>{{'key' | translate: {ns: 'name', Default: 'default value'} }}</div>
 * <!-- @ngx-translate -->
 * <div>{{'pac.key' | translate: {Default: 'default value'} }}</div>
 * ```
 */
@Pipe({
  standalone: true,
  name: 'translate'
})
export class TranslatePipe implements PipeTransform {
  readonly translate = inject(TranslateService)

  transform(key: string, options?: {ns?: string; Default?: string;} & Record<string, string>): string {
    if (!key) {
      return ''
    }

    if (!key.includes(':') && !options?.ns) {
      return this.translate.instant(key, options)
    }

    return i18next.t(key, options) as string || options?.Default
  }
}
