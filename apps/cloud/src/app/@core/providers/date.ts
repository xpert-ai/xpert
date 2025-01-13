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
