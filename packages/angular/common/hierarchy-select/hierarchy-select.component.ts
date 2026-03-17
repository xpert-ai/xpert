
import { Component, computed, effect, forwardRef, inject, input, Input, signal } from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { ControlValueAccessor, FormControl, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms'
import { nonNullable, PropertyDimension } from '@metad/ocap-core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { distinctUntilChanged, startWith } from 'rxjs'
import { NgmDisplayBehaviourComponent } from '../display-behaviour'
import { NgmFieldAppearance } from "@metad/ocap-angular/core";
import { ZardComboboxComponent, ZardComboboxGroup, ZardComboboxOption, ZardFormImports } from '@xpert-ai/headless-ui'

/**
 * @deprecated use headless components instead
 */
@Component({
  standalone: true,
  imports: [...ZardFormImports, ZardComboboxComponent, ReactiveFormsModule, TranslateModule, NgmDisplayBehaviourComponent],
  selector: 'ngm-hierarchy-select',
  templateUrl: './hierarchy-select.component.html',
  styles: [],
  host: {
    class: 'ngm-hierarchy-select'
  },
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      multi: true,
      useExisting: forwardRef(() => NgmHierarchySelectComponent)
    }
  ]
})
export class NgmHierarchySelectComponent implements ControlValueAccessor {
  readonly #translate = inject(TranslateService)

  @Input() label: string
  @Input() appearance: NgmFieldAppearance
  readonly dimensions = input<PropertyDimension[]>()

  formControl = new FormControl<string>(null)
  onChange: (input: any) => void
  onTouched: () => void

  readonly value = toSignal(this.formControl.valueChanges.pipe(startWith(this.formControl.value)))
  readonly noneOption = computed<ZardComboboxOption[]>(() => [
    {
      value: '',
      label: `-- ${this.#translate.instant('Ngm.Common.None', { Default: 'None' })} --`
    }
  ])
  readonly groups = computed<ZardComboboxGroup[]>(() =>
    this.dimensions()?.map((dimension) => ({
      label: dimension.caption,
      options: dimension.hierarchies?.map((hierarchy) => ({
        value: hierarchy.name,
        label: hierarchy.caption || hierarchy.name
      })) ?? []
    })) ?? []
  )

  readonly error = signal<string>('')

  // Subscribers
  private _formValueSub = this.formControl.valueChanges
    .pipe(distinctUntilChanged(), takeUntilDestroyed())
    .subscribe((value) => {
      this.onChange?.(value)
    })

  #validatorEffectRef = effect(() => {
    const hierarchy = this.dimensions()?.reduce((hierarchy, dimension) => {
      if (hierarchy) return hierarchy
      return dimension.hierarchies?.find((item) => item.name === this.value())
    }, null)
      if (nonNullable(this.value()) && nonNullable(this.dimensions()) && !hierarchy) {
        this.error.set(
          this.#translate.instant('Ngm.Messages.NotFoundValue', { Default: 'Not found value: ' }) + this.value()
        )
      } else {
        this.error.set(null)
      }
    }
  )

  writeValue(obj: any): void {
    this.formControl.setValue(obj ?? '', { emitEvent: false })
  }
  registerOnChange(fn: any): void {
    this.onChange = fn
  }
  registerOnTouched(fn: any): void {
    this.onTouched = fn
  }
  setDisabledState?(isDisabled: boolean): void {
    isDisabled ? this.formControl.disable() : this.formControl.enable()
  }
}
