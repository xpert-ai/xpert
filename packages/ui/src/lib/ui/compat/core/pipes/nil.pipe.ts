import { Pipe, PipeTransform } from '@angular/core'

@Pipe({
  standalone: true,
  name: 'isNil'
})
export class NgmIsNilPipe implements PipeTransform {
  transform(value: unknown, text: string): unknown {
    return value == null || value == undefined ? (text ?? value) : value
  }
}
