import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, computed, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { attrModel, IfAnimations, linkedModel, OverlayAnimations } from '@metad/core'
import { TranslateModule } from '@ngx-translate/core'
import { XpertStudioApiService } from '../../domain'
import { CopilotPromptEditorComponent } from '../../../../../@shared/copilot'
import { XpertStudioFeaturesComponent } from '../features.component'
import { MatSlideToggleModule } from '@angular/material/slide-toggle'
import { NgmDensityDirective } from '@metad/ocap-angular/core'

@Component({
  selector: 'xpert-studio-features-title',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    CdkMenuModule,
    TranslateModule,
    MatTooltipModule,
    MatSlideToggleModule,
    NgmDensityDirective,

    CopilotPromptEditorComponent,
  ],
  templateUrl: './title.component.html',
  styleUrl: './title.component.scss',
  animations: [...IfAnimations]
})
export class XpertStudioFeaturesTitleComponent {
  readonly studioService = inject(XpertStudioApiService)
  readonly featuresComponent = inject(XpertStudioFeaturesComponent)

  readonly xpert = this.studioService.xpert

  // Inputs
  readonly view = this.featuresComponent.view
  readonly toggleView = this.featuresComponent.toggleView
  
  readonly agentConfig = linkedModel({
    initialValue: null,
    compute: () => this.xpert()?.agentConfig,
    update: (value) => {
      this.studioService.updateXpertAgentConfig(value)
    }
  })
  readonly summarizeTitle = attrModel(this.agentConfig, 'summarizeTitle')
  readonly disableSummarizeTitle = attrModel(this.summarizeTitle, 'disable')
  readonly enableSummarizeTitle = linkedModel({
    initialValue: null,
    compute: () => !this.disableSummarizeTitle(),
    update: (value) => {
      this.disableSummarizeTitle.set(!value)
    }
  })
  readonly instruction = attrModel(this.summarizeTitle, 'instruction')

}
