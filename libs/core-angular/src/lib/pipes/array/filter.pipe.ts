import { NgModule, Pipe, PipeTransform } from '@angular/core'
import { isArray } from '../utils/utils'

@Pipe({
  name: 'filter',
  standalone: false
})
export class FilterPipe implements PipeTransform {
  transform(input: any, fn: (item: any) => any): any {
    if (!isArray(input) || !fn) {
      return input
    }

    return input.filter(fn)
  }
}

@NgModule({
  declarations: [FilterPipe],
  exports: [FilterPipe]
})
export class NgFilterPipeModule {}
