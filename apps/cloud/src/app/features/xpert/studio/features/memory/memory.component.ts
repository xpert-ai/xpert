import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, computed, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatSliderModule } from '@angular/material/slider'
import { MatTooltipModule } from '@angular/material/tooltip'
import { TLongTermMemory } from '@metad/contracts'
import { OverlayAnimations } from '@metad/core'
import { NgmDensityDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { XpertStudioApiService } from '../../domain'
import { CopilotPromptEditorComponent } from '../../../../../@shared/copilot'

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
    NgmDensityDirective,

    CopilotPromptEditorComponent
  ],
  templateUrl: './memory.component.html',
  styleUrl: './memory.component.scss',
  animations: [...OverlayAnimations]
})
export class XpertStudioFeaturesMemoryComponent {
  readonly apiService = inject(XpertStudioApiService)

  readonly xpert = this.apiService.xpert
  readonly memory = computed(() => this.xpert()?.memory)

  get prompt() {
    return this.memory()?.prompt
  }
  set prompt(value) {
    this.updateMemory({ prompt: value })
  }

  updateMemory(memory: Partial<TLongTermMemory>) {
    this.apiService.updateXpert((xpert) => {
      return {
        ...xpert,
        memory: {
          ...(xpert.memory ?? {}),
          ...memory
        }
      }
    })
  }
}
