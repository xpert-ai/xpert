import { Injectable } from '@angular/core'
import { API_PREFIX, OrganizationBaseCrudService } from '@metad/cloud/state'
import { IEnvironment } from '../types'


export const API_ENVIRONMENT = API_PREFIX + '/environment'

@Injectable({
  providedIn: 'root'
})
export class EnvironmentService extends OrganizationBaseCrudService<IEnvironment> {
  constructor() {
    super(API_ENVIRONMENT)
  }


}
