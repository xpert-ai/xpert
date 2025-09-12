import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { MatFormFieldModule } from '@angular/material/form-field'
import { NgmInputComponent } from '@metad/ocap-angular/common'
import { DensityDirective, ISelectOption } from '@metad/ocap-angular/core'
import { FieldType, FormlyModule } from '@ngx-formly/core'
import { TranslateModule } from '@ngx-translate/core'
import { isObservable, startWith } from 'rxjs'

@Component({
  standalone: true,
  selector: 'pac-formly-input',
  templateUrl: `input.type.html`,
  styleUrls: [`input.type.scss`],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'pac-formly-input'
  },
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    MatFormFieldModule,
    FormlyModule,
    DensityDirective,
    NgmInputComponent
  ]
})
export class PACFormlyInputComponent extends FieldType implements OnInit {
  readonly #destroyRef = inject(DestroyRef)

  readonly selectOptions = signal<ISelectOption[]>([])

  oldValue = null
  newValue = null

  ngOnInit(): void {
    this.formControl.valueChanges.pipe(startWith(this.formControl.value), takeUntilDestroyed(this.#destroyRef)).subscribe((value) => {
      this.oldValue = value
      this.newValue = value
    })

    if (isObservable(this.props?.options)) {
      this.props.options.pipe(takeUntilDestroyed(this.#destroyRef)).subscribe((options) => {
        this.selectOptions.set(options)
      })
    } else {
      this.selectOptions.set(this.props?.options ?? [])
    }

    if (this.props?.readonly) {
      this.formControl.disable()
    }
  }

  onBlur() {
    if (this.oldValue !== this.newValue) {
      this.formControl.setValue(this.newValue)
    }
  }
}
