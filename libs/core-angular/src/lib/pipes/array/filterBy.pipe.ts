import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  standalone: true,
  name: 'filterBy',
  pure: true
})
export class FilterByPipe implements PipeTransform {
  transform<T>(items: T[], predicate: (item: T, ...args: any[]) => boolean, ...args: any[]): T[] {
    return Array.isArray(items) && typeof predicate === 'function'
      ? items.filter(item => predicate(item, ...args))
      : items;
  }
}
