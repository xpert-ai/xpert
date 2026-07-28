import { inject, Pipe, PipeTransform } from '@angular/core'
import { TranslateService } from '@ngx-translate/core'
import { XpLanguageEnum } from '../models'

@Pipe({
  standalone: true,
  name: 'i18n',
  pure: false
})
export class XpI18nPipe implements PipeTransform {
  private readonly translate = inject(TranslateService)

  transform(value: unknown): string {
    if (typeof value === 'string') {
      return value
    } else if (typeof value === 'object' && value !== null) {
      return value[mapLanguage(this.translate.currentLang as XpLanguageEnum)] ?? value['en_US']
    } else {
      return (value ?? '') as string
    }
  }
}

function mapLanguage(l: XpLanguageEnum) {
  switch (l) {
    case XpLanguageEnum.Chinese:
    case XpLanguageEnum.SimplifiedChinese:
    case XpLanguageEnum.TraditionalChinese:
      return 'zh_Hans'
    default:
      return 'en_US'
  }
}
