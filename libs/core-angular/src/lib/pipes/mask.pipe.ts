import { Pipe, PipeTransform } from '@angular/core'

@Pipe({
  standalone: true,
  name: 'mask'
})
export class MaskPipe implements PipeTransform {
  transform(value: string, visibleStart = 4, visibleEnd = 4): string {
    if (!value) return value

    const length = value.length

    if (length <= visibleStart + visibleEnd) {
      return value // 如果长度小于等于可见部分，直接返回原值
    }

    const start = value.substring(0, visibleStart)
    const end = value.substring(length - visibleEnd)
    const maskedPart = '...'

    return `${start}${maskedPart}${end}`
  }
}
