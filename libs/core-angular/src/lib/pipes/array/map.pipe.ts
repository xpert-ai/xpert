import { NgModule, Pipe, PipeTransform } from '@angular/core'
import { isArray } from '../utils/utils'

@Pipe({
  name: 'map',
  standalone: false
})
export class MapPipe implements PipeTransform {
  transform(input: any, fn: (item: any) => any): any {
    if (!isArray(input) || !fn) {
      return input
    }

    return input.map(fn)
  }
}

@NgModule({
  declarations: [MapPipe],
  exports: [MapPipe]
})
export class NgMapPipeModule {}
