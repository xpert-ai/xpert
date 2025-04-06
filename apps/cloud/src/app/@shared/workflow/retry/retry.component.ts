import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatSliderModule } from '@angular/material/slider'
import { MatTooltipModule } from '@angular/material/tooltip'
import { linkedModel } from '@metad/core'
import { NgmSlideToggleComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { injectHelpWebsite } from 'apps/cloud/src/app/@core'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { TWorkflowRetry } from '../../../@core/types'

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
    MatTooltipModule,
    MatSliderModule,
    NgmSlideToggleComponent
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
}
