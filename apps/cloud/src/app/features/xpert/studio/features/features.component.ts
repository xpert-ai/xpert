import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, computed, inject, output, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatSlideToggleModule } from '@angular/material/slide-toggle'
import { MatTooltipModule } from '@angular/material/tooltip'
import { IfAnimations } from '@metad/core'
import { attrModel, linkedModel, NgmDensityDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { XpertStudioApiService } from '../domain'
import { XpertStudioFeaturesMemoryComponent } from './memory/memory.component'
import { XpertStudioFeaturesSummaryComponent } from './summary/summary.component'
import { XpertStudioFeaturesTitleComponent } from './title/title.component'
import { XpertStudioFeaturesAttachmentComponent } from './attachment/attachment.component'
import { XpertStudioFeaturesOpenerComponent } from './opener/opener.component'
import { XpertStudioFeaturesSuggestionComponent } from './suggestion/suggestion.component'
import { XpertStudioFeaturesTTSComponent } from './tts/tts.component'
import { XpertStudioFeaturesSTTComponent } from './stt/stt.component'

@Component({
  selector: 'xpert-studio-features',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    CdkMenuModule,
    TranslateModule,
    MatSlideToggleModule,
    MatTooltipModule,
    NgmDensityDirective,
    XpertStudioFeaturesSummaryComponent,
    XpertStudioFeaturesMemoryComponent,
    XpertStudioFeaturesTitleComponent,
    XpertStudioFeaturesAttachmentComponent,
    XpertStudioFeaturesOpenerComponent,
    XpertStudioFeaturesSuggestionComponent,
    XpertStudioFeaturesTTSComponent,
    XpertStudioFeaturesSTTComponent
  ],
  templateUrl: './features.component.html',
  styleUrl: './features.component.scss',
  animations: [...IfAnimations]
})
export class XpertStudioFeaturesComponent {
  // readonly #dialogRef = inject(DialogRef)
  readonly apiService = inject(XpertStudioApiService)

  // Outputs
  readonly close = output()

  readonly view = signal<'summarize' | 'attachment' | 'memory' | 'title' | 'opener' | 'suggestion' | 'tts' | 'stt'>(null)
  readonly xpert = this.apiService.xpert

  readonly summarize = computed(() => this.xpert()?.summarize)
  readonly enabledSummarize = computed(() => this.summarize()?.enabled)
  readonly memory = computed(() => this.xpert()?.memory)
  readonly enabledMemory = computed(() => this.memory()?.enabled)
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
  readonly attachment = attrModel(this.features, 'attachment')
  readonly opener = attrModel(this.features, 'opener')
  readonly suggestion = attrModel(this.features, 'suggestion')
  readonly textToSpeech = attrModel(this.features, 'textToSpeech')
  readonly speechToText = attrModel(this.features, 'speechToText')
  readonly enabledAttachment = computed(() => this.attachment()?.enabled)
  readonly fileTypes = computed(() => this.attachment()?.fileTypes)
  readonly maxNum = computed(() => this.attachment()?.maxNum)

  readonly opener_enabled = attrModel(this.opener, 'enabled')
  readonly suggestion_enabled = attrModel(this.suggestion, 'enabled')
  readonly textToSpeech_enabled = attrModel(this.textToSpeech, 'enabled')
  readonly speechToText_enabled = attrModel(this.speechToText, 'enabled')

  toggleView(view: 'summarize' | 'attachment' | 'memory' | 'title' | 'opener' | 'suggestion' | 'tts' | 'stt') {
    this.view.update((state) => (state === view ? null : view))
  }

  toggleSummarize(enabled?: boolean) {
    this.apiService.updateXpertTeam((xpert) => {
      return {
        ...xpert,
        summarize: {
          ...(xpert.summarize ?? {}),
          enabled
        }
      }
    })
  }

  toggleMemory(enabled?: boolean) {
    this.apiService.updateXpertTeam((xpert) => {
      return {
        ...xpert,
        memory: {
          ...(xpert.memory ?? {}),
          enabled
        }
      }
    })
  }

  toggleAttachment(enabled?: boolean) {
    this.attachment.update((state) => ({
      ...(state ?? {}),
      enabled
    }))
  }
}
