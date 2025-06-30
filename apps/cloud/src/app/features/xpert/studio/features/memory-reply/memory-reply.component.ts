import { CommonModule } from '@angular/common'
import { Component, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { attrModel, OverlayAnimations } from '@metad/core'
import { TranslateModule } from '@ngx-translate/core'
import { XpertStudioApiService } from '../../domain'
import { AiModelTypeEnum } from '@cloud/app/@core'
import { linkedXpertFeaturesModel } from '../types'
import { MatTooltipModule } from '@angular/material/tooltip'
import { MatSliderModule } from '@angular/material/slider'

@Component({
  selector: 'xpert-studio-features-memory-reply',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, MatTooltipModule, MatSliderModule],
  templateUrl: './memory-reply.component.html',
  styleUrl: './memory-reply.component.scss',
  animations: [...OverlayAnimations]
})
export class XpertStudioFeaturesMemoryReplyComponent {
  eAiModelType = AiModelTypeEnum
  
  readonly apiService = inject(XpertStudioApiService)

  readonly features = linkedXpertFeaturesModel(this.apiService)

  readonly memoryReply = attrModel(this.features, 'memoryReply')
  readonly scoreThreshold = attrModel(this.memoryReply, 'scoreThreshold')
}
