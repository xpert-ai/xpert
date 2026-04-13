import { Injectable, OnDestroy, Optional } from '@angular/core'
import { NgmDSCoreService, NgmSmartFilterBarService } from '@xpert-ai/ocap-angular/core'
import { SmartFilterService } from '@xpert-ai/ocap-core'

@Injectable()
export class NgmSmartFilterService extends SmartFilterService implements OnDestroy {
  constructor(dsCoreService: NgmDSCoreService, @Optional() ngmFilterBarService?: NgmSmartFilterBarService) {
    super(dsCoreService, ngmFilterBarService)
  }

  ngOnDestroy(): void {
    super.onDestroy()
  }
}
