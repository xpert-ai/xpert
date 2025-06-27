import { CommonModule } from '@angular/common'
import { Component, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { attrModel, linkedModel, OverlayAnimations } from '@metad/core'
import { TranslateModule } from '@ngx-translate/core'
import { XpertStudioApiService } from '../../domain'
import { CopilotModelSelectComponent } from '@cloud/app/@shared/copilot'
import { AiModelTypeEnum } from '@cloud/app/@core'

@Component({
  selector: 'xpert-studio-features-stt',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, CopilotModelSelectComponent],
  templateUrl: './stt.component.html',
  styleUrl: './stt.component.scss',
  animations: [...OverlayAnimations]
})
export class XpertStudioFeaturesSTTComponent {
  eAiModelType = AiModelTypeEnum
  
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

  readonly speechToText = attrModel(this.features, 'speechToText')
  readonly copilotModel = attrModel(this.speechToText, 'copilotModel')
}
