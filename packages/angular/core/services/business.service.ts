import { Injectable, Optional } from '@angular/core'
import { SmartBusinessService } from '@xpert-ai/ocap-core'
import { NgmDSCoreService } from '../core.service'
import { NgmSmartFilterBarService } from './smart-filter-bar.service'

/**
 */
@Injectable()
export class NgmSmartBusinessService<T> extends SmartBusinessService<T> {
  constructor(dsCoreService: NgmDSCoreService, @Optional() smartFilterBar?: NgmSmartFilterBarService) {
    super(dsCoreService, smartFilterBar)
  }
}
