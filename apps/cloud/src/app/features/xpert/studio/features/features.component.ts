import { DialogRef } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, computed, inject, signal } from '@angular/core'
import { MatSlideToggleModule } from '@angular/material/slide-toggle'
import { MatTooltipModule } from '@angular/material/tooltip'
import { OverlayAnimations } from '@metad/core'
import { TranslateModule } from '@ngx-translate/core'
import { XpertStudioFeaturesSummaryComponent } from './summary/summary.component'
import { XpertStudioApiService } from '../domain'
import { FormsModule } from '@angular/forms'
import { XpertStudioFeaturesMemoryComponent } from './memory/memory.component'
import { NgmDensityDirective } from '@metad/ocap-angular/core'


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
    XpertStudioFeaturesMemoryComponent
  ],
  templateUrl: './features.component.html',
  styleUrl: './features.component.scss',
  animations: [...OverlayAnimations]
})
export class XpertStudioFeaturesComponent {
  readonly #dialogRef = inject(DialogRef)
  readonly apiService = inject(XpertStudioApiService)

  readonly view = signal<'summarize' | 'image_upload' | 'memory'>(null)
  readonly xpert = this.apiService.xpert
  readonly summarize = computed(() => this.xpert()?.summarize)
  readonly enabledSummarize = computed(() => this.summarize()?.enabled)
  readonly memory = computed(() => this.xpert()?.memory)
  readonly enabledMemory = computed(() => this.memory()?.enabled)

  close() {
    this.#dialogRef.close()
  }

  toggleView(view: 'summarize' | 'image_upload' | 'memory') {
    this.view.update((state) => state === view ? null : view)
  }

  toggleSummarize(enabled?: boolean) {
    this.apiService._updateXpert({
      summarize: {
        ...(this.summarize() ?? {}),
        enabled,
      }
    })
  }

  toggleMemory(enabled?: boolean) {
    this.apiService._updateXpert({
      memory: {
        ...(this.memory() ?? {}),
        enabled,
      }
    })
  }
}
