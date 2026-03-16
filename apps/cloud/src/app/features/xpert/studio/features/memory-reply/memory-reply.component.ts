
import { Component, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { attrModel, OverlayAnimations } from '@metad/core'
import { TranslateModule } from '@ngx-translate/core'
import { XpertStudioApiService } from '../../domain'
import { AiModelTypeEnum } from '@cloud/app/@core'
import { linkedXpertFeaturesModel } from '../types'
import { ZardSliderComponent, ZardTooltipImports } from '@xpert-ai/headless-ui'
@Component({
  selector: 'xpert-studio-features-memory-reply',
  standalone: true,
  imports: [FormsModule, TranslateModule, ...ZardTooltipImports, ZardSliderComponent],
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
