import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  standalone: true,
  name: 'kebabToCamelCase'
})
export class KebabToCamelCasePipe implements PipeTransform {
  transform(value: string): string {
    if (!value) return value;
    return value
      .split('-')
      .map((word, index) => {
        if (index === 0) {
          // Capitalize the first letter of the first word.
          return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        }
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      })
      .join(' ');
  }
}