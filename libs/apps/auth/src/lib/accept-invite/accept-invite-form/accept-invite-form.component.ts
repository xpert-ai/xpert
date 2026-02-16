import { CommonModule } from '@angular/common'
import { Component, EventEmitter, Input, Output } from '@angular/core'
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatCheckboxModule } from '@angular/material/checkbox'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInputModule } from '@angular/material/input'
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'
import { IInvite, ITag, ITenant, IUserRegistrationInput } from '@metad/contracts'
import { TranslateModule, TranslateService } from '@ngx-translate/core'

@Component({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    MatFormFieldModule,
    MatButtonModule,
    MatInputModule,
    MatCheckboxModule,
    MatProgressSpinnerModule
  ],
  selector: 'pac-accept-invite-form',
  templateUrl: 'accept-invite-form.component.html',
  styleUrls: ['accept-invite-form.component.scss']
})
export class AcceptInviteFormComponent {
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
    public readonly translateService: TranslateService
  ) {}

  saveInvites() {
    if (this.form.valid) {
      const { fullName, password } = this.form.value
      this.submitForm.emit({
        user: {
          firstName: fullName ? fullName.split(' ').slice(0, -1).join(' ') : null,
          lastName: fullName ? fullName.split(' ').slice(-1).join(' ') : null,
          email: this.invitation.email,
          role: this.invitation.role,
          tenant: this.tenant,
          tags: this.tags
        },
        password
      })
    }
  }
}
