import { Pipe, PipeTransform } from '@angular/core'
import { IUser } from '@metad/contracts'

/**
 * @deprecated 重复定义
 */
@Pipe({ name: 'createdBy' })
export class CreatedByUserPipe implements PipeTransform {
  transform(value: IUser): string {
    if (!value) {
      return ''
    }
    return value.fullName || ((value.firstName || '') + ' ' + (value.lastName || '')).trim() || value.email
  }
}
