import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, computed, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatSliderModule } from '@angular/material/slider'
import { MatTooltipModule } from '@angular/material/tooltip'
import { LongTermMemoryTypeEnum, TLongTermMemory, TLongTermMemoryConfig } from '@metad/contracts'
import { IfAnimations, OverlayAnimations } from '@metad/core'
import { TranslateModule } from '@ngx-translate/core'
import { CopilotPromptEditorComponent } from '../../../../../@shared/copilot'
import { XpertStudioApiService } from '../../domain'
import { injectTranslate } from 'apps/cloud/src/app/@core'
import { MatCheckboxModule } from '@angular/material/checkbox'
import { InDevelopmentComponent } from 'apps/cloud/src/app/@theme'
import { NgmTooltipDirective } from '@metad/ocap-angular/core'

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
    MatCheckboxModule,

    NgmTooltipDirective,
    CopilotPromptEditorComponent,
    InDevelopmentComponent
  ],
  templateUrl: './memory.component.html',
  styleUrl: './memory.component.scss',
  animations: [...IfAnimations, ...OverlayAnimations]
})
export class XpertStudioFeaturesMemoryComponent {
  eLongTermMemoryTypeEnum = LongTermMemoryTypeEnum

  readonly apiService = inject(XpertStudioApiService)
  readonly i18n = injectTranslate('PAC.Xpert.LongTermMemoryTypeEnum')

  readonly xpert = this.apiService.xpert
  readonly memory = computed(() => this.xpert()?.memory)

  readonly profile = computed(() => this.memory()?.profile)
  readonly qa = computed(() => this.memory()?.qa)

  get profileEnabled() {
    return this.profile()?.enabled
  }
  set profileEnabled(enabled: boolean) {
    this.updateProfile({ enabled })
  }

  get qaEnabled() {
    return this.qa()?.enabled
  }
  set qaEnabled(enabled: boolean) {
    this.updateQA({ enabled })
  }

  get profilePrompt() {
    return this.profile()?.prompt
  }
  set profilePrompt(value: string) {
    this.updateProfile({ prompt: value })
  }

  get afterSeconds() {
    return this.profile()?.afterSeconds
  }
  set afterSeconds(value: number) {
    this.updateProfile({ afterSeconds: value })
  }

  get qaPrompt() {
    return this.qa()?.prompt
  }
  set qaPrompt(value: string) {
    this.updateQA({ prompt: value })
  }

  // readonly options = computed(() => {
  //   const i18n = this.i18n()
  //   return [
  //     {
  //       key: LongTermMemoryTypeEnum.PROFILE,
  //       caption: i18n.Profile || 'Profile'
  //     },
  //     {
  //       key: LongTermMemoryTypeEnum.QA,
  //       caption: i18n.QuestionAnswer || 'Question/Answer'
  //     }
  //   ]
  // })

  formatLabel(value: number): string {
    return `${value}s`;
  }

  updateMemory(memory: Partial<TLongTermMemory>) {
    this.apiService.updateXpertTeam((xpert) => {
      return {
        ...xpert,
        memory: {
          ...(xpert.memory ?? {}),
          ...memory,
        }
      }
    })
  }

  updateProfile(value: Partial<TLongTermMemoryConfig> & {afterSeconds?: number}) {
    this.updateMemory({
      profile: {
        ...(this.profile() ?? {}),
        ...value
      }
    })
  }

  updateQA(value: Partial<TLongTermMemoryConfig>) {
    this.updateMemory({
      qa: {
        ...(this.qa() ?? {}),
        ...value
      }
    })
  }
}
