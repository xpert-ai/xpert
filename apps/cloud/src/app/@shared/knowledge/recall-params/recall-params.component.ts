import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, computed, inject, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatSliderModule } from '@angular/material/slider'
import { MatTooltipModule } from '@angular/material/tooltip'
import { TKBRecallParams } from '@metad/contracts'
import { NgmDensityDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'

/**
 *
 */
@Component({
  standalone: true,
  imports: [CommonModule, CdkMenuModule, FormsModule, TranslateModule, MatTooltipModule, MatSliderModule, NgmDensityDirective],
  selector: 'knowledge-recall-params',
  templateUrl: 'recall-params.component.html',
  styleUrls: ['recall-params.component.scss'],
  hostDirectives: [NgxControlValueAccessor]
})
export class KnowledgeRecallParamsComponent {
  protected cva = inject<NgxControlValueAccessor<TKBRecallParams>>(NgxControlValueAccessor)

  // Inputs
  readonly enableWeight = input<boolean>(false)

  // States
  readonly value$ = this.cva.value$

  readonly topK = computed(() => this.value$()?.topK)
  readonly score = computed(() => this.value$()?.score)
  readonly weight = computed(() => this.value$()?.weight)

  update(value: Partial<TKBRecallParams>) {
    this.value$.update((state) => ({
      ...(state ?? {}),
      ...value
    }))
  }
}
