import { Pipe, PipeTransform } from '@angular/core'

@Pipe({
  standalone: false,
  name: 'replaceNullWithText'
})
export class ReplaceNullWithTextPipe implements PipeTransform {
  transform(value: any, repleceText: string = 'N/A'): any {
    if (typeof value === 'undefined' || value === null) {
      return repleceText
    }

    return value
  }
}
