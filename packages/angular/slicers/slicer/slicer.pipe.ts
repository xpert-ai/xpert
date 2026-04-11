import { Pipe, PipeTransform } from '@angular/core'
import { slicerAsString } from '@xpert-ai/ocap-core'

@Pipe({
  standalone: true,
  name: 'slicer'
})
export class NgmSlicerPipe implements PipeTransform {
  transform(value: any, ...args: any[]): any {
    const slicers = Array.isArray(value) ? value : value ? [value] : []

    return slicers.map((slicer) => slicerAsString(slicer)).join(';')
  }
}
