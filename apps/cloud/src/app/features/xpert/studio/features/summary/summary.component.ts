import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, computed, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatSliderModule } from '@angular/material/slider'
import { MatTooltipModule } from '@angular/material/tooltip'
import { TSummarize } from '@metad/contracts'
import { OverlayAnimations } from '@metad/core'
import { NgmDensityDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { XpertStudioApiService } from '../../domain'
import { CopilotPromptEditorComponent } from '../../../../../@shared/copilot'

@Component({
  selector: 'xpert-studio-features-summary',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    CdkMenuModule,
    TranslateModule,
    MatSliderModule,
    MatTooltipModule,
    NgmDensityDirective,

    CopilotPromptEditorComponent
  ],
  templateUrl: './summary.component.html',
  styleUrl: './summary.component.scss',
  animations: [...OverlayAnimations]
})
export class XpertStudioFeaturesSummaryComponent {
  readonly apiService = inject(XpertStudioApiService)

  readonly xpert = this.apiService.xpert
  readonly summarize = computed(() => this.xpert()?.summarize)
  readonly retainMessages = computed(() => this.summarize()?.retainMessages)

  get maxMessages() {
    return this.summarize()?.maxMessages ?? 100
  }
  set maxMessages(value) {
    this.updateSummarize({ maxMessages: value })
  }
  get summarizeMessages() {
    return Math.max(this.maxMessages - (this.summarize()?.retainMessages ?? this.maxMessages), 0)
  }
  set summarizeMessages(value) {
    this.updateSummarize({ retainMessages: this.maxMessages - value })
  }

  get prompt() {
    return this.summarize()?.prompt
  }
  set prompt(value) {
    this.updateSummarize({ prompt: value })
  }
  

  updateSummarize(summarize: Partial<TSummarize>) {
    this.apiService.updateXpert((xpert) => {
      return {
        ...xpert,
        summarize: {
          ...(xpert.summarize ?? {}),
          ...summarize
        }
      }
    })
  }
}
