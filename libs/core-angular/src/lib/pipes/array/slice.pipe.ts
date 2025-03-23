import { Pipe, PipeTransform } from '@angular/core'
import { isArray } from '../utils/utils'

@Pipe({
  standalone: true,
  name: 'slice'
})
export class ArraySlicePipe implements PipeTransform {
  transform<T>(input: Array<T>, start: number, end: number): Array<T> {
    if (!isArray(input)) {
      return input
    }

    return input.slice(start, end)
  }
}
