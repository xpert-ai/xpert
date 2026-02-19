export const DEFAULT_DIGIT_INFO = '0.2'
export function formatNumber(n: number, locale: string, digitsInfo?: string) {
  let [, fractionDigits] = (digitsInfo ?? DEFAULT_DIGIT_INFO).split('.')
  fractionDigits = fractionDigits.split('-')[1] ?? fractionDigits
  return Number(n.toFixed(Number(fractionDigits))).toLocaleString(locale)
}
