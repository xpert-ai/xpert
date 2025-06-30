import { CommonModule } from '@angular/common'
import { Component, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { attrModel, linkedModel, OverlayAnimations } from '@metad/core'
import { TranslateModule } from '@ngx-translate/core'
import { XpertStudioApiService } from '../../domain'
import { CopilotModelSelectComponent } from '@cloud/app/@shared/copilot'
import { AiModelTypeEnum } from '@cloud/app/@core'
import { linkedXpertFeaturesModel } from '../types'

@Component({
  selector: 'xpert-studio-features-tts',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, CopilotModelSelectComponent],
  templateUrl: './tts.component.html',
  styleUrl: './tts.component.scss',
  animations: [...OverlayAnimations]
})
export class XpertStudioFeaturesTTSComponent {
  eAiModelType = AiModelTypeEnum
  
  readonly apiService = inject(XpertStudioApiService)

  readonly features = linkedXpertFeaturesModel(this.apiService)

  readonly textToSpeech = attrModel(this.features, 'textToSpeech')
  readonly copilotModel = attrModel(this.textToSpeech, 'copilotModel')
}
