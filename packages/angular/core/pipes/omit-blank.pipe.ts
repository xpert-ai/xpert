import { Pipe, PipeTransform } from '@angular/core'
import { JSONValue, omitBlank } from '@xpert-ai/ocap-core'

@Pipe({
  standalone: true,
  name: 'omitBlank'
})
export class OmitBlankPipe implements PipeTransform {
  transform(value: undefined): JSONValue {
    if (value === null || value === undefined) {
      return null
    }
    return omitBlank(value)
  }
}
