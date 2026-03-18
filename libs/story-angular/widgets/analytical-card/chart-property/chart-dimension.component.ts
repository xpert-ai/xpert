
import { Component, effect, forwardRef, model, signal } from '@angular/core'
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms'
import { NgmSchemaFormComponent, NxDesignerModule, STORY_DESIGNER_SCHEMA } from '@metad/story/designer'
import { TranslateModule } from '@ngx-translate/core'
import { DimensionChartOptionsSchemaService } from '../analytical-card.schema'

@Component({
  standalone: true,
  imports: [FormsModule, TranslateModule, NxDesignerModule, NgmSchemaFormComponent],
  selector: 'ngm-chart-dimension-form',
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
      useExisting: forwardRef(() => NgmChartDimensionComponent)
    },
    {
      provide: STORY_DESIGNER_SCHEMA,
      useClass: DimensionChartOptionsSchemaService
    }
  ]
})
export class NgmChartDimensionComponent implements ControlValueAccessor {
  readonly model = model()

  readonly isDisabled = signal(false)

  onChange: (input: any) => void
  onTouched: () => void

  constructor() {
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
