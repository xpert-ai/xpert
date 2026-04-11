import { CdkMenuModule } from '@angular/cdk/menu'

import { Component, computed, effect, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { LongTermMemoryTypeEnum, TLongTermMemory, TLongTermMemoryConfig } from '@xpert-ai/contracts'
import { IfAnimations, OverlayAnimations } from '@xpert-ai/core'
import { TranslateModule } from '@ngx-translate/core'
import { CopilotPromptEditorComponent } from '../../../../../@shared/copilot'
import { XpertStudioApiService } from '../../domain'
import { injectTranslate } from 'apps/cloud/src/app/@core'
import { InDevelopmentComponent } from 'apps/cloud/src/app/@theme'
import { NgmTooltipDirective } from '@xpert-ai/ocap-angular/core'
import { isNil } from '@xpert-ai/copilot'
import { ZardCheckboxComponent, ZardSliderComponent, ZardTooltipImports } from '@xpert-ai/headless-ui'
@Component({
  selector: 'xpert-studio-features-memory',
  standalone: true,
  imports: [
    FormsModule,
    CdkMenuModule,
    TranslateModule,
    ZardSliderComponent,
    ...ZardTooltipImports,
    ZardCheckboxComponent,
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

  constructor() {
    effect(
      () => {
        if (this.profile()?.enabled && isNil(this.profile().afterSeconds)) {
          this.afterSeconds = 10
        }
      }
    )
  }

  formatLabel(value: number): string {
    return `${value}s`
  }

  updateMemory(memory: Partial<TLongTermMemory>) {
    this.apiService.updateXpertTeam((xpert) => {
      return {
        ...xpert,
        memory: {
          ...(xpert.memory ?? {}),
          ...memory
        }
      }
    })
  }

  updateProfile(value: Partial<TLongTermMemoryConfig> & { afterSeconds?: number }) {
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
