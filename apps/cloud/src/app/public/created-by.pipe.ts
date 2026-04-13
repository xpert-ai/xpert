import { Pipe, PipeTransform } from '@angular/core'
import { IUser } from '@xpert-ai/contracts'

/**
 * @deprecated 重复定义
 */
@Pipe({
  standalone: false, name: 'createdBy' })
export class CreatedByUserPipe implements PipeTransform {
  transform(value: IUser): string {
    if (!value) {
      return ''
    }
    return value.fullName || ((value.firstName || '') + ' ' + (value.lastName || '')).trim() || value.email
  }
}
