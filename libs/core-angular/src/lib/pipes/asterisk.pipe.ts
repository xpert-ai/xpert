import { Pipe, PipeTransform } from '@angular/core'

@Pipe({
  standalone: true,
  name: 'asterisk'
})
export class AsteriskPipe implements PipeTransform {
  transform(value: string): string {
    if (!value) return value

    const length = value.length

    return '*'.repeat(length)
  }
}
