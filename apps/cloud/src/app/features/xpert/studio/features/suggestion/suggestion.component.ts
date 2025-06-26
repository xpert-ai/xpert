import { CommonModule } from '@angular/common'
import { Component, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { attrModel, linkedModel, OverlayAnimations } from '@metad/core'
import { TranslateModule } from '@ngx-translate/core'
import { XpertStudioApiService } from '../../domain'
import { CopilotPromptEditorComponent } from '@cloud/app/@shared/copilot'

@Component({
  selector: 'xpert-studio-features-suggestion',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, CopilotPromptEditorComponent],
  templateUrl: './suggestion.component.html',
  styleUrl: './suggestion.component.scss',
  animations: [...OverlayAnimations]
})
export class XpertStudioFeaturesSuggestionComponent {
  readonly apiService = inject(XpertStudioApiService)

  readonly features = linkedModel({
    initialValue: null,
    compute: () => this.apiService.xpert()?.features,
    update: (features) => {
      this.apiService.updateXpertTeam((xpert) => {
        return {
          ...xpert,
          features: {
            ...(xpert.features ?? {}),
            ...features
          }
        }
      })
    }
  })

  readonly suggestion = attrModel(this.features, 'suggestion')
  readonly prompt = attrModel(this.suggestion, 'prompt')
}
