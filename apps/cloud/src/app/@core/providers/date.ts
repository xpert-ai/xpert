import { Pipe, PipeTransform } from '@angular/core'
import { format } from 'date-fns/format'
import { formatRelative } from 'date-fns/formatRelative'
import { getDateLocale } from '../types'
import { injectLanguage } from './translate'

export function injectFormatRelative() {
  const lang = injectLanguage()

  return (d: Date | string) => {
    return formatRelative(new Date(d), new Date(), {
      locale: getDateLocale(lang())
    })
  }
}

@Pipe({ name: 'format', standalone: true })
export class DateFormatPipe implements PipeTransform {
  readonly lang = injectLanguage()

  transform(value: any, pattern?: string): string | null {
    return format(value, pattern || 'yyyy-MM-dd', {
      locale: getDateLocale(this.lang())
    })
  }
}

@Pipe({ name: 'relative', standalone: true })
export class DateRelativePipe implements PipeTransform {
  readonly _formatRelative = injectFormatRelative()

  transform(value: Date | string): string | null {
    return this._formatRelative(value)
  }
}