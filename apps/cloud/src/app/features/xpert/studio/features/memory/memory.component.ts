import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, computed, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatSliderModule } from '@angular/material/slider'
import { MatTooltipModule } from '@angular/material/tooltip'
import { LongTermMemoryTypeEnum, TLongTermMemory } from '@metad/contracts'
import { OverlayAnimations } from '@metad/core'
import { NgmRadioSelectComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { CopilotPromptEditorComponent } from '../../../../../@shared/copilot'
import { XpertStudioApiService } from '../../domain'
import { injectTranslate } from 'apps/cloud/src/app/@core'

@Component({
  selector: 'xpert-studio-features-memory',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    CdkMenuModule,
    TranslateModule,
    MatSliderModule,
    MatTooltipModule,
    NgmRadioSelectComponent,

    CopilotPromptEditorComponent
  ],
  templateUrl: './memory.component.html',
  styleUrl: './memory.component.scss',
  animations: [...OverlayAnimations]
})
export class XpertStudioFeaturesMemoryComponent {
  eLongTermMemoryTypeEnum = LongTermMemoryTypeEnum

  readonly apiService = inject(XpertStudioApiService)
  readonly i18n = injectTranslate('PAC.Xpert.LongTermMemoryTypeEnum')

  readonly xpert = this.apiService.xpert
  readonly memory = computed(() => this.xpert()?.memory)

  get prompt() {
    return this.memory()?.prompt
  }
  set prompt(value) {
    this.updateMemory({ prompt: value })
  }

  get type() {
    return this.memory()?.type
  }
  set type(value) {
    this.updateMemory({ type: value })
  }

  readonly options = computed(() => {
    const i18n = this.i18n()
    return [
      {
        key: LongTermMemoryTypeEnum.PROFILE,
        caption: i18n.Profile || 'Profile'
      },
      {
        key: LongTermMemoryTypeEnum.QA,
        caption: i18n.QuestionAnswer || 'Question/Answer'
      }
    ]
  })

  updateMemory(memory: Partial<TLongTermMemory>) {
    this.apiService.updateXpert((xpert) => {
      return {
        ...xpert,
        memory: {
          ...(xpert.memory ?? {}),
          type: xpert.memory?.type ?? LongTermMemoryTypeEnum.PROFILE,
          ...memory,
        }
      }
    })
  }
}
