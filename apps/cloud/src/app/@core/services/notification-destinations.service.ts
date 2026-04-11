import { HttpClient } from '@angular/common/http'
import { Injectable } from '@angular/core'
import { API_NOTIFICATION_DESTINATION } from '@xpert-ai/cloud/state'
import { INotificationDestination } from '../types'

export const IMG_ROOT = 'assets/images/destinations'

@Injectable({
  providedIn: 'root'
})
export class PACNotificationDestinationsService {
  // types$ = this.select((state) => {
  //   if (isNil(state.types)) {
  //     this.getTypes()
  //   }
  //   return state.types
  // })

  constructor(public httpClient: HttpClient) {}

  // getTypes = this.effect((origin$: Observable<void>) => {
  //   return origin$.pipe(
  //     switchMap(() => this.httpClient.get(`${API_NOTIFICATION_DESTINATION}/types`)),
  //     tap((types: INotificationDestinationType[]) => this.patchState({ types }))
  //   )
  // })

  getAll() {
    return this.httpClient.get<any[]>(API_NOTIFICATION_DESTINATION)
  }

  getGroups(id) {
    return this.httpClient.get<any[]>(`${API_NOTIFICATION_DESTINATION}/${id}/groups`)
  }

  getTypes() {
    return this.httpClient.get<any[]>(`${API_NOTIFICATION_DESTINATION}/types`)
  }

  getOne(id: string) {
    return this.httpClient.get<INotificationDestination>(API_NOTIFICATION_DESTINATION + '/' + id)
  }

  create(input: Partial<INotificationDestination>) {
    return this.httpClient.post(API_NOTIFICATION_DESTINATION, input)
  }

  delete(id: string) {
    return this.httpClient.delete(id)
  }
}
