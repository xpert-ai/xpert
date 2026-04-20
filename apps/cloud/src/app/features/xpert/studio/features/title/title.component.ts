import { CdkMenuModule } from '@angular/cdk/menu'
import { Component, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { attrModel, IfAnimations, linkedModel } from '@xpert-ai/core'
import { TranslateModule } from '@ngx-translate/core'
import { NgmDensityDirective } from '@xpert-ai/ocap-angular/core'
import { ZardSwitchComponent, ZardTooltipImports } from '@xpert-ai/headless-ui'
import { CopilotPromptEditorComponent } from '../../../../../@shared/copilot'
import { XpertStudioApiService } from '../../domain'
import { XpertStudioFeaturesComponent } from '../features.component'
import { linkedXpertFeaturesModel } from '../types'

@Component({
  selector: 'xpert-studio-features-title',
  standalone: true,
  imports: [
    FormsModule,
    CdkMenuModule,
    TranslateModule,
    ...ZardTooltipImports,
    NgmDensityDirective,
    CopilotPromptEditorComponent,
    ZardSwitchComponent
  ],
  templateUrl: './title.component.html',
  styleUrl: './title.component.scss',
  animations: [...IfAnimations]
})
export class XpertStudioFeaturesTitleComponent {
  readonly apiService = inject(XpertStudioApiService)
  readonly featuresComponent = inject(XpertStudioFeaturesComponent)

  // Inputs
  readonly view = this.featuresComponent.view
  readonly toggleView = this.featuresComponent.toggleView

  readonly features = linkedXpertFeaturesModel(this.apiService)
  readonly titleFeature = attrModel(this.features, 'title')
  readonly enabled = attrModel(this.titleFeature, 'enabled')
  readonly enableTitle = linkedModel({
    initialValue: false,
    compute: () => this.enabled() ?? false,
    update: (value) => {
      this.enabled.set(value ?? false)
    }
  })
  readonly instruction = attrModel(this.titleFeature, 'instruction')
}
