import { Injectable, OnDestroy, Optional } from '@angular/core'
import { NgmDSCoreService, NgmSmartFilterBarService } from '@xpert-ai/ocap-angular/core'
import { ChartBusinessService } from '@xpert-ai/ocap-core'

@Injectable()
export class AnalyticalCardService<T> extends ChartBusinessService<T> implements OnDestroy {
  
  constructor(dsCoreService: NgmDSCoreService, @Optional() filterBarService: NgmSmartFilterBarService) {
    super(dsCoreService, filterBarService)
  }

  ngOnDestroy(): void {
    super.onDestroy()
  }
}
