import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormControl, ReactiveFormsModule } from '@angular/forms'
import { MatFormFieldModule } from '@angular/material/form-field'
import { NgmInputComponent } from '@metad/ocap-angular/common'
import { ISelectOption, OcapCoreModule } from '@metad/ocap-angular/core'
import { FieldType, FormlyModule } from '@ngx-formly/core'
import { TranslateModule } from '@ngx-translate/core'
import { isObservable } from 'rxjs'

@Component({
  standalone: true,
  selector: 'pac-formly-input',
  templateUrl: `input.type.html`,
  styleUrls: [`input.type.scss`],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'pac-formly-input'
  },
  imports: [CommonModule, ReactiveFormsModule, TranslateModule, MatFormFieldModule, FormlyModule, OcapCoreModule, NgmInputComponent]
})
export class PACFormlyInputComponent extends FieldType implements OnInit {
  readonly #destroyRef = inject(DestroyRef)
  
  readonly selectOptions = signal<ISelectOption[]>([])

  ngOnInit(): void {
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

  get valueFormControl() {
    return this.formControl as FormControl
  }
}
