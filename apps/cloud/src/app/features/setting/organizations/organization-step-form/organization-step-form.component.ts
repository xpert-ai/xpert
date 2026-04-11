import { CommonModule } from '@angular/common'
import { Component, DestroyRef, forwardRef, inject, OnInit } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { ControlValueAccessor, FormBuilder, NG_VALUE_ACCESSOR, Validators, FormGroup, ReactiveFormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { ZardCheckboxComponent, ZardFormImports, ZardInputDirective, ZardStepperImports } from '@xpert-ai/headless-ui'
import { combineLatest } from 'rxjs'

@Component({
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    ...ZardStepperImports,
    ...ZardFormImports,
    ZardCheckboxComponent,
    ZardInputDirective,
  ],
  selector: 'pac-organization-step-form',
  templateUrl: './organization-step-form.component.html',
  styleUrls: ['./organization-step-form.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      multi: true,
      useExisting: forwardRef(() => OrganizationStepFormComponent),
    }
  ]
})
export class OrganizationStepFormComponent implements OnInit, ControlValueAccessor {
  readonly destroyRef = inject(DestroyRef)
  private fb = inject(FormBuilder)

  basic = this.fb.group({
    name: ['', Validators.required],
    currency: ['CNY', Validators.required],
    defaultValueDateType: ['TODAY', Validators.required],
  })

  orgSettingsForm: FormGroup

  onChange: (value: any) => any

  writeValue(obj: any): void {
    if (obj) {
      this.basic.patchValue(obj)
      this.orgSettingsForm.patchValue(obj)
    }
  }
  registerOnChange(fn: any): void {
    this.onChange = fn
  }
  registerOnTouched(fn: any): void {
  }
  setDisabledState?(isDisabled: boolean): void {
  }

  ngOnInit(): void {
    this._initializedForm()
  }

  private _initializedForm() {
    this.orgSettingsForm = this.fb.group({
			invitesAllowed: [true],
			inviteExpiryPeriod: [7, [Validators.min(1)]]
		});

    combineLatest([
      this.basic.valueChanges,
      this.orgSettingsForm.valueChanges
    ]).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(([basic, orgSettings]) => {
      this.onChange?.({
        ...basic,
        ...orgSettings
      })
    })
  }
}
