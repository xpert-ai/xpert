import { HttpClient } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import { shareReplay } from 'rxjs'
import { API_PREFIX } from './constants'

@Injectable({
  providedIn: 'root'
})
export class APIService {
  readonly httpClient = inject(HttpClient)

  readonly app$ = this.app().pipe(shareReplay(1))

  app() {
    return this.httpClient.get(API_PREFIX + '/')
  }

}
