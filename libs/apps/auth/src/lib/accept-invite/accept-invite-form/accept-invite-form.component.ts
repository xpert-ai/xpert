import { CommonModule } from '@angular/common'
import { ChangeDetectorRef, Component, EventEmitter, Input, OnInit, Output } from '@angular/core'
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { ActivatedRoute } from '@angular/router'

import { ZardButtonComponent, ZardFormImports, ZardInputDirective, ZardCheckboxComponent } from '@xpert-ai/headless-ui'
import { IInvite, ITag, ITenant, IUserRegistrationInput } from '@xpert-ai/contracts'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ReferralService } from '@xpert-ai/cloud/state'

@Component({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    ...ZardFormImports,
    ZardButtonComponent,
    ZardInputDirective,
    ZardCheckboxComponent
  ],
  selector: 'pac-accept-invite-form',
  templateUrl: 'accept-invite-form.component.html',
  styleUrls: ['accept-invite-form.component.scss']
})
export class AcceptInviteFormComponent implements OnInit {
  @Input()
  invitation: IInvite

  @Output()
  submitForm: EventEmitter<IUserRegistrationInput> = new EventEmitter<IUserRegistrationInput>()

  tenant: ITenant
  tags: ITag[]

  public readonly form: FormGroup = AcceptInviteFormComponent.buildForm(this.fb)
  static buildForm(fb: FormBuilder): FormGroup {
    return fb.group(
      {
        fullName: ['', Validators.required],
        password: ['', Validators.compose([Validators.required, Validators.minLength(4)])],
        repeatPassword: ['', Validators.required],
        referralCode: [{ value: '', disabled: true }],
        agreeTerms: [false, Validators.requiredTrue]
      }
      // {
      // 	validators: [
      // 		MatchValidator.mustMatch(
      // 			'password',
      // 			'repeatPassword'
      // 		)
      // 	]
      // }
    )
  }

  constructor(
    private readonly fb: FormBuilder,
    public readonly translateService: TranslateService,
    private readonly referralService: ReferralService,
    private readonly route: ActivatedRoute,
    private readonly cdr: ChangeDetectorRef
  ) {
    this.form.controls.referralCode.setValue(this.route.snapshot.queryParamMap.get('ref')?.trim() ?? '')
  }

  ngOnInit() {
    void this.loadReferralAvailability()
  }

  referralEnabled = false
  referralAvailabilityLoading = true
  referralValidationLoading = false
  referralValid: boolean | null = null

  async saveInvites() {
    if (!(await this.validateReferralCode())) {
      return
    }
    if (this.form.valid) {
      const { fullName, password, referralCode } = this.form.getRawValue()
      this.submitForm.emit({
        user: {
          firstName: fullName ? fullName.split(' ').slice(0, -1).join(' ') : null,
          lastName: fullName ? fullName.split(' ').slice(-1).join(' ') : null,
          email: this.invitation.email,
          role: this.invitation.role,
          tenant: this.tenant,
          tags: this.tags
        },
        password,
        referralCode: this.referralEnabled ? referralCode?.trim() || undefined : undefined
      })
    }
  }

  async validateReferralCode() {
    const control = this.form.controls.referralCode
    const code = control.value?.trim().toUpperCase()
    if (!this.referralEnabled || !code) {
      this.referralValid = null
      control.setErrors(null)
      return true
    }

    this.referralValidationLoading = true
    this.referralValid = null
    this.cdr.markForCheck()
    try {
      const valid = await this.referralService.validateCode(code, this.invitation.tenantId)
      if (control.value?.trim().toUpperCase() !== code) {
        return false
      }
      this.referralValid = valid
      control.setErrors(valid ? null : { invalidReferralCode: true })
      return valid
    } catch {
      this.referralValid = false
      control.setErrors({ invalidReferralCode: true })
      return false
    } finally {
      this.referralValidationLoading = false
      this.cdr.markForCheck()
    }
  }

  private async loadReferralAvailability() {
    try {
      this.referralEnabled = await this.referralService.getAvailability(this.invitation.tenantId)
      if (this.referralEnabled) {
        this.form.controls.referralCode.enable({ emitEvent: false })
        if (this.form.controls.referralCode.value) {
          await this.validateReferralCode()
        }
      } else {
        this.form.controls.referralCode.reset('', { emitEvent: false })
      }
    } catch {
      this.referralEnabled = false
      this.form.controls.referralCode.reset('', { emitEvent: false })
    } finally {
      this.referralAvailabilityLoading = false
      this.cdr.markForCheck()
    }
  }
}
