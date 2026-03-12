import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, effect, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { attrModel, linkedModel, OverlayAnimations } from '@metad/core'
import { TranslateModule } from '@ngx-translate/core'
import { XpertStudioApiService } from '../../domain'
import { CopilotPromptEditorComponent } from '../../../../../@shared/copilot'
import { ZardSliderComponent, type ZardSliderValue, ZardTooltipImports } from '@xpert-ai/headless-ui'
@Component({
  selector: 'xpert-studio-features-summary',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    CdkMenuModule,
    TranslateModule,
    ZardSliderComponent,
    ...ZardTooltipImports,
    CopilotPromptEditorComponent
  ],
  templateUrl: './summary.component.html',
  styleUrl: './summary.component.scss',
  animations: [...OverlayAnimations]
})
export class XpertStudioFeaturesSummaryComponent {
  readonly MinSummarizeMessages = 4
  readonly studioService = inject(XpertStudioApiService)

  readonly xpert = this.studioService.xpert
  readonly summarize = linkedModel({
    initialValue: null,
    compute: () => this.xpert()?.summarize,
    update: (value) => {
      this.studioService.updateXpertTeam((xpert) => {
        return {
          ...xpert,
          summarize: value
        }
      })
    }
  })

  readonly retainMessages = attrModel(this.summarize, 'retainMessages')
  readonly prompt = attrModel(this.summarize, 'prompt')

  readonly maxMessages = linkedModel({
    initialValue: null,
    compute: () => this.summarize()?.maxMessages ?? 100,
    update: (value) => {
      this.summarize.update((state) => {
        return {
          ...(state ?? {}),
          maxMessages: value
          // retainMessages: Math.min(state?.retainMessages, value) +value - (state?.maxMessages ?? 100)
        }
      })
    }
  })

  readonly summarizeMessages = linkedModel({
    initialValue: null,
    compute: () => Math.max(this.maxMessages() - (this.summarize()?.retainMessages ?? this.maxMessages()), 0),
    update: (value) => {
      this.summarize.update((state) => ({
        ...(state ?? {}),
        retainMessages: state.maxMessages - (value ?? this.MinSummarizeMessages)
      }))
    }
  })

  updateRange(value: ZardSliderValue) {
    const [summarizeMessages, maxMessages] = value as readonly [number, number]
    this.summarizeMessages.set(summarizeMessages)
    this.maxMessages.set(maxMessages)
  }
}
