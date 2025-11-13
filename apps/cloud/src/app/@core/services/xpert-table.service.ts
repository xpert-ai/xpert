import { inject, Injectable } from '@angular/core'
import { API_PREFIX, IDataSource, IDSSchema, IXpertTable, OrganizationBaseCrudService } from '@metad/cloud/state'
import { NGXLogger } from 'ngx-logger'

@Injectable({ providedIn: 'root' })
export class XpertTableService extends OrganizationBaseCrudService<IXpertTable> {
  readonly #logger = inject(NGXLogger)

  constructor() {
    super(API_PREFIX + `/xpert-table`)
  }

  getDatabases() {
    return this.httpClient.get<Partial<IDataSource>[]>(`${this.apiBaseUrl}/databases`)
  }

  getDatabaseSchemas(databaseId: string) {
    return this.httpClient.get<IDSSchema[]>(`${this.apiBaseUrl}/schemas`, {
      params: { databaseId }
    })
  }

  activateTable(tableId: string) {
    return this.httpClient.post<IXpertTable>(`${this.apiBaseUrl}/${tableId}/activate`, {})
  }
}

export function injectXpertTableAPI() {
  return inject(XpertTableService)
}
