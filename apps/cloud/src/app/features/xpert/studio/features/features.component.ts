import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, computed, inject, output, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatSlideToggleModule } from '@angular/material/slide-toggle'
import { MatTooltipModule } from '@angular/material/tooltip'
import { attrModel, IfAnimations } from '@metad/core'
import { NgmDensityDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { XpertStudioApiService } from '../domain'
import { XpertStudioFeaturesMemoryComponent } from './memory/memory.component'
import { XpertStudioFeaturesSummaryComponent } from './summary/summary.component'
import { XpertStudioFeaturesAttachmentComponent } from './attachment/attachment.component'

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
    XpertStudioFeaturesAttachmentComponent
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

  readonly view = signal<'summarize' | 'attachment' | 'memory'>(null)
  readonly xpert = this.apiService.xpert
  readonly summarize = computed(() => this.xpert()?.summarize)
  readonly enabledSummarize = computed(() => this.summarize()?.enabled)
  readonly memory = computed(() => this.xpert()?.memory)
  readonly enabledMemory = computed(() => this.memory()?.enabled)
  readonly attachment = computed(() => this.xpert()?.attachment)
  readonly enabledAttachment = computed(() => this.attachment()?.enabled)
  readonly fileTypes = computed(() => this.attachment()?.fileTypes)
  readonly maxNum = computed(() => this.attachment()?.maxNum)

  toggleView(view: 'summarize' | 'attachment' | 'memory') {
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
    this.apiService.updateXpertTeam((xpert) => {
      return {
        ...xpert,
        attachment: {
          ...(xpert.attachment ?? {}),
          enabled
        }
      }
    })
  }
}
