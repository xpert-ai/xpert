import { Pipe, PipeTransform } from '@angular/core'
import { IUser } from '@xpert-ai/contracts'

@Pipe({
  standalone: true,
  name: 'createdBy'
})
export class CreatedByPipe implements PipeTransform {
  transform(value: IUser): string {
    if (!value) {
      return ''
    }
    return value.fullName || ((value.firstName || '') + ' ' + (value.lastName || '')).trim() || value.email
  }
}

@Pipe({ standalone: true, name: 'user' })
export class UserPipe implements PipeTransform {
  transform(value: IUser): string {
    return userLabel(value)
  }
}

export function userLabel(value: IUser) {
  if (!value) {
    return ''
  }
  return value.fullName || ((value.firstName || '') + ' ' + (value.lastName || '')).trim() || value.username || value.email
}
