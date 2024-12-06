import { Injectable } from '@angular/core'
import { API_PREFIX, OrganizationBaseCrudService } from '@metad/cloud/state'
import { IApiKey } from '../types'

@Injectable({ providedIn: 'root' })
export class ApiKeyService extends OrganizationBaseCrudService<IApiKey> {
  constructor() {
    super(API_PREFIX + '/api-key')
  }
}
