import { Injectable, OnDestroy, Optional } from '@angular/core'
import { NgmDSCoreService, NgmSmartFilterBarService } from '@xpert-ai/ocap-angular/core'
import { AnalyticsBusinessService } from '@xpert-ai/ocap-core'

/**
 * 在 Angular 的销毁生命周期 `ngOnDestroy` 中显示调用 ocap-core service 的销毁方法 `onDestroy` 对资源和订阅链进行销毁
 */
@Injectable()
export class NgmAnalyticsBusinessService<T> extends AnalyticsBusinessService<T> implements OnDestroy {
  constructor(override readonly dsCoreService: NgmDSCoreService, @Optional() smartFilterbar: NgmSmartFilterBarService) {
    super(dsCoreService, smartFilterbar)
  }

  ngOnDestroy(): void {
    super.onDestroy()
  }
  
}
