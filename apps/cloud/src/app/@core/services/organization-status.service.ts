import { HttpClient } from '@angular/common/http'
import { Injectable } from '@angular/core'
import { API_ORGANIZATION_STATUS } from '../../../../../../libs/apps/state/src/lib/constants'
import { ComponentStore } from '@xpert-ai/store'
import { assign } from 'lodash-es'
import { Observable } from 'rxjs'
import { shareReplay, switchMap, tap } from 'rxjs/operators'

export interface OrganizationStatusState {
  initial: boolean
  alerts: number
  dashboards: number
  data_sources: number
  queries: number
  users: number
}

@Injectable({
  providedIn: 'root',
})
export class OrganizationStatusService extends ComponentStore<OrganizationStatusState> {
  get _className_() {
    return OrganizationStatusService.name
  }
  readonly state$ = this.select((state) => {
    if (state.initial) {
      this.refresh()
    }
    return state
  }).pipe(shareReplay())

  public orgStatus$ = this.state$
  constructor(private httpClient: HttpClient) {
    super({} as OrganizationStatusState)
  }

  readonly refresh = this.effect((origin$: Observable<void>) => {
    return origin$.pipe(
      switchMap(() => this.httpClient.get<any>(API_ORGANIZATION_STATUS)),
      tap(({ object_counters }) => this.setAll(object_counters))
    )
  })

  readonly setAll = this.updater((state, organizationStatus: Partial<OrganizationStatusState>) => {
    assign(state, organizationStatus, { initial: true })
  })
}
