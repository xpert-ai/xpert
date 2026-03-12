import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, computed, inject, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TKBRecallParams } from '@metad/contracts'
import { TranslateModule } from '@ngx-translate/core'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { ZardSliderComponent, ZardTooltipImports } from '@xpert-ai/headless-ui'
import type { ZardSliderValue } from '@xpert-ai/headless-ui'
/**
 *
 */
@Component({
  standalone: true,
  imports: [
    CommonModule,
    CdkMenuModule,
    FormsModule,
    TranslateModule,
    ...ZardTooltipImports,
    ZardSliderComponent
  ],
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

  sliderValue(value: ZardSliderValue) {
    return typeof value === 'number' ? value : value[0]
  }
}
