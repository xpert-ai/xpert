import { inject, Pipe, PipeTransform } from '@angular/core'
import { TranslateService } from '@ngx-translate/core'
import { NgmLanguageEnum } from '../models'

@Pipe({
  standalone: true,
  name: 'i18n'
})
export class NgmI18nPipe implements PipeTransform {
  private readonly translate = inject(TranslateService)

  transform(value: unknown): string {
    if (typeof value === 'string') {
      return value
    } else if (typeof value === 'object' && value !== null) {
      return value[mapLanguage(this.translate.currentLang as NgmLanguageEnum)] ?? value['en_US']
    } else {
      return (value ?? '') as string 
    }
  }
}

function mapLanguage(l: NgmLanguageEnum) {
  switch (l) {
    case NgmLanguageEnum.Chinese:
    case NgmLanguageEnum.SimplifiedChinese:
    case NgmLanguageEnum.TraditionalChinese:
      return 'zh_Hans'
    default:
      return 'en_US'
  }
}
