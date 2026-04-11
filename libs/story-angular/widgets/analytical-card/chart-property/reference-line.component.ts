
import { Component, effect, forwardRef, model, signal } from '@angular/core'
import { ControlValueAccessor, FormControl, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms'
import { NgmSchemaFormComponent, NxDesignerModule, STORY_DESIGNER_SCHEMA } from '@xpert-ai/story/designer'
import { TranslateModule } from '@ngx-translate/core'
import { ReferenceLineSchemaService } from '../schemas'

@Component({
  standalone: true,
  imports: [FormsModule, TranslateModule, NxDesignerModule, NgmSchemaFormComponent],
  selector: 'ngm-reference-line',
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
      useExisting: forwardRef(() => NgmReferenceLineComponent)
    },
    {
      provide: STORY_DESIGNER_SCHEMA,
      useClass: ReferenceLineSchemaService
    }
  ]
})
export class NgmReferenceLineComponent implements ControlValueAccessor {
  readonly model = model<{ referenceLines: any[] }>({ referenceLines: null })

  readonly isDisabled = signal(false)

  formControl = new FormControl({ referenceLines: [] })

  // private valueSub = this.formControl.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
  //     this.onChange?.(value.referenceLines)
  // })

  onChange: (input: any) => void
  onTouched: () => void

  constructor() {
    effect(() => {
      const model = this.model()
      if (model.referenceLines) {
        this.onChange?.(model.referenceLines)
      }
    })
  }

  writeValue(obj: any): void {
    if (obj) {
      this.model.update((state) => {
        state.referenceLines = obj
        return state
      })
      // this.formControl.patchValue({referenceLines: obj})
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
    // isDisabled ? this.formControl.disable() : this.formControl.enable()
  }
}
