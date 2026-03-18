
import { Component, effect, forwardRef, inject, input, model, signal } from '@angular/core'
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms'
import { ChartType } from '@metad/ocap-core'
import { NgmSchemaFormComponent, NxDesignerModule, STORY_DESIGNER_SCHEMA } from '@metad/story/designer'
import { TranslateModule } from '@ngx-translate/core'
import { ChartOptionsSchemaService } from '../../analytical-card.schema'

@Component({
  standalone: true,
  imports: [FormsModule, TranslateModule, NxDesignerModule, NgmSchemaFormComponent],
  selector: 'ngm-chart-type-form',
  template: `<ngm-schema-form class="w-full" [(ngModel)]="model" [disabled]="isDisabled()" />`,
  styles: [
    `
      :host {
        padding: 0;
      }
    `
  ],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      multi: true,
      useExisting: forwardRef(() => NgmSchemaChartTypeComponent)
    },
    {
      provide: STORY_DESIGNER_SCHEMA,
      useClass: ChartOptionsSchemaService
    }
  ]
})
export class NgmSchemaChartTypeComponent implements ControlValueAccessor {
  private readonly schema = inject<ChartOptionsSchemaService>(STORY_DESIGNER_SCHEMA)

  readonly chartType = input<ChartType>(null)

  readonly model = model()

  readonly isDisabled = signal(false)

  onChange: (input: any) => void
  onTouched: () => void

  constructor() {
    effect(
      () => {
        this.schema.chartType = this.chartType()
      }
    )

    effect(
      () => {
        this.onChange?.(this.model())
      }
    )
  }

  writeValue(obj: any): void {
    if (obj) {
      this.model.set(obj)
    }
  }
  registerOnChange(fn: any): void {
    this.onChange = fn
  }
  registerOnTouched(fn: any): void {
    this.onTouched = fn
  }
  setDisabledState?(isDisabled: boolean): void {
    this.isDisabled.set(isDisabled)
  }
}
