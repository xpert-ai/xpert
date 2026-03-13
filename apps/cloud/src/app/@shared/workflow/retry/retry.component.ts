import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { linkedModel } from '@metad/core'
import { TranslateModule } from '@ngx-translate/core'
import { injectHelpWebsite } from 'apps/cloud/src/app/@core'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { TWorkflowRetry } from '../../../@core/types'
import { ZardSliderComponent, ZardSwitchComponent, ZardTooltipImports } from '@xpert-ai/headless-ui'
import type { ZardSliderValue } from '@xpert-ai/headless-ui'
@Component({
  selector: 'xpert-workflow-retry',
  templateUrl: './retry.component.html',
  styleUrls: ['./retry.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    CdkMenuModule,
    TranslateModule,
    ...ZardTooltipImports,
    ZardSliderComponent,
    ZardSwitchComponent
  ],
  hostDirectives: [NgxControlValueAccessor]
})
export class XpertWorkflowRetryComponent {
  readonly helpWebsite = injectHelpWebsite()
  protected cva = inject<NgxControlValueAccessor<TWorkflowRetry>>(NgxControlValueAccessor)

  // States
  readonly value$ = this.cva.value$
  readonly retry = this.cva.value$

  readonly enabledRetry = linkedModel({
    initialValue: null,
    compute: () => this.retry()?.enabled,
    update: (enabled) => {
      this.cva.value$.update((state) => ({ ...state, enabled }))
    }
  })

  readonly stopAfterAttempt = linkedModel({
    initialValue: null,
    compute: () => this.retry()?.stopAfterAttempt,
    update: (stopAfterAttempt) => {
      this.cva.value$.update((state) => ({ ...state, stopAfterAttempt }))
    }
  })

  readonly retryInterval = linkedModel({
    initialValue: null,
    compute: () => this.retry()?.retryInterval,
    update: (retryInterval) => {
      this.cva.value$.update((state) => ({ ...state, retryInterval }))
    }
  })

  setStopAfterAttempt(value: ZardSliderValue) {
    this.stopAfterAttempt.set(this.sliderValue(value))
  }

  setRetryInterval(value: ZardSliderValue) {
    this.retryInterval.set(this.sliderValue(value))
  }

  private sliderValue(value: ZardSliderValue) {
    return typeof value === 'number' ? value : value[0]
  }
}
