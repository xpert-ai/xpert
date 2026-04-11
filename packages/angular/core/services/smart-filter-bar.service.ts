import { Injectable, OnDestroy, Optional, SkipSelf } from '@angular/core'
import { SmartFilterBarService } from '@xpert-ai/ocap-core'

@Injectable()
export class NgmSmartFilterBarService extends SmartFilterBarService implements OnDestroy {
  constructor(
    @Optional()
    @SkipSelf()
    parent?: NgmSmartFilterBarService
  ) {
    super(parent)
  }

  ngOnDestroy(): void {
    super.onDestroy()
  }
}
