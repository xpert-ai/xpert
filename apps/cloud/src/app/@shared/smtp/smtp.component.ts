import { AfterViewInit, ChangeDetectorRef, Component, DestroyRef, Input, OnChanges, OnInit, SimpleChanges, inject, signal } from '@angular/core'
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { ActivatedRoute } from '@angular/router'
import { ICustomSmtp, IOrganization, IUser, SMTPSecureEnum } from '@metad/contracts'
import { ButtonGroupDirective, OcapCoreModule } from '@metad/ocap-angular/core'
import { FormlyFieldConfig, FormlyModule } from '@ngx-formly/core'
import { TranslateModule } from '@ngx-translate/core'
import { filter, pairwise, tap } from 'rxjs/operators'
import { CustomSmtpService, Store, ToastrService } from '../../@core/services'
import { patterns } from '../regex/regex-patterns.const'
import { TranslationBaseComponent } from '../language/translation-base.component'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'

@Component({
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,

    FormlyModule,
    MatButtonModule,
    ButtonGroupDirective,

    OcapCoreModule
  ],
  selector: 'pac-smtp',
  templateUrl: './smtp.component.html',
  styleUrls: ['./smtp.component.scss']
})
export class SMTPComponent extends TranslationBaseComponent implements OnInit, OnChanges, AfterViewInit {

  private readonly _activatedRoute = inject(ActivatedRoute)
  private readonly fb = inject(FormBuilder)
  private readonly customSmtpService = inject(CustomSmtpService)
  private readonly toastrService = inject(ToastrService)
  private readonly store = inject(Store)
  private readonly _cdr = inject(ChangeDetectorRef)
  readonly destroyRef = inject(DestroyRef)

  @Input() organization?: IOrganization
  @Input() isOrganization?: boolean

  loading: boolean
  secureOptions = [
    { label: SMTPSecureEnum.TRUE, value: true },
    { label: SMTPSecureEnum.FALSE, value: false }
  ]
  customSmtp: ICustomSmtp = {} as ICustomSmtp
  user: IUser
  readonly isValidated = signal(false)

  /*
   * Income Mutation Form
   */
  public form: FormGroup = SMTPComponent.buildForm(this.fb, this)
  static buildForm(fb: FormBuilder, self: SMTPComponent): FormGroup {
    return fb.group({
      id: [],
      organizationId: [],
      host: ['', Validators.compose([Validators.required, Validators.pattern(patterns.host)])],
      port: [],
      secure: [],
      username: [],
      password: [],
      isValidate: [false]
    })
  }

  //Fields for the form
  schema: FormlyFieldConfig[] = []

  /**
  |--------------------------------------------------------------------------
  | Subscriptions (effect)
  |--------------------------------------------------------------------------
  */
  private _activatedRouteSub = this._activatedRoute.data.pipe(takeUntilDestroyed()).subscribe(({ isOrganization }) => {
    this.isOrganization = isOrganization
  })

  private _userSub = this.store.user$.pipe(filter(Boolean), takeUntilDestroyed()).subscribe((user) => {
    this.user = user
  })
  private _selectedOrganizationSub = this.store.selectedOrganization$
    .pipe(
      filter((organization) => !!organization),
      tap((organization) => (this.organization = organization)),
      tap(() => this.getTenantSmtpSetting()),
      takeUntilDestroyed()
    )
    .subscribe()

  ngOnInit(): void {
    this.translateService
      .get('PAC.SHARED.SMTP', {
        Default: {
          Host: 'Host',
          Port: 'Port',
          Secure: 'Secure',
          Username: 'Username',
          Password: 'Password',
          True: 'True',
          False: 'False'
        }
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((SMTP) => {
        this.schema = [
          {
            fieldGroupClassName: 'ngm-formly__row',
            fieldGroup: [
              {
                className: 'ngm-formly__col ngm-formly__col-2',
                key: 'host',
                type: 'input',
                props: {
                  label: SMTP.Host,
                  required: true
                }
              },
              {
                className: 'ngm-formly__col ngm-formly__col-2',
                key: 'port',
                type: 'input',
                props: {
                  label: SMTP.Port,
                  type: 'number'
                }
              },
              {
                className: 'ngm-formly__col ngm-formly__col-2',
                key: 'secure',
                type: 'select',
                props: {
                  label: SMTP.Secure,
                  options: [
                    {
                      value: false,
                      label: SMTP.False
                    },
                    {
                      value: true,
                      label: SMTP.True
                    }
                  ]
                }
              },
              {
                className: 'ngm-formly__col ngm-formly__col-2',
                key: 'username',
                type: 'input',
                props: {
                  label: SMTP.Username
                }
              },

              {
                className: 'ngm-formly__col ngm-formly__col-2',
                key: 'password',
                type: 'input',
                props: {
                  label: SMTP.Password
                }
              },
              {
                key: 'isValidate',
                type: 'empty'
              }
            ]
          }
        ]
      })
  }

  ngOnChanges(change: SimpleChanges) {
    if (change.organization.previousValue) {
      this.getTenantSmtpSetting()
    }
  }

  ngAfterViewInit() {
    const control1 = <FormControl>this.form.get('username')
    const control2 = <FormControl>this.form.get('password')
    control1.valueChanges.subscribe((value) => {
      if (value) {
        control2.setValidators([Validators.required])
      } else {
        control2.setValidators(null)
      }
      control2.updateValueAndValidity()
    })

    this.form.valueChanges.pipe(pairwise(), takeUntilDestroyed(this.destroyRef)).subscribe((values) => {
      const oldVal = values[0]
      const newVal = values[1]
      if ((newVal.username && oldVal.username) || (newVal.host && oldVal.host)) {
        if (newVal.username !== oldVal.username || newVal.host !== oldVal.host) {
          this.isValidated.set(false)
        }
      }
    })
  }

  /*
   * Get tenant SMTP details
   */
  async getTenantSmtpSetting() {
    const { tenantId } = this.user
    const find = { tenantId }

    if (this.organization && this.isOrganization) {
      find['organizationId'] = this.organization.id
    }

    this.loading = true

    const setting = await this.customSmtpService.getSMTPSetting(find)

    // this.formDirective.resetForm();
    if (setting && setting.hasOwnProperty('auth')) {
      this.globalSmtpPatch(setting)
    } else {
      this.customSmtp = setting
      this.patchValue()
    }
    // if organization exist
    if (this.organization && this.isOrganization) {
      this.form.patchValue({
        organizationId: this.organization.id
      })
    }
    this.form.markAsPristine()
    this._cdr.detectChanges()

    this.loading = false
  }

  /*
   * Patch old SMTP details for tenant
   */
  patchValue() {
    if (this.customSmtp) {
      this.isValidated.set(this.customSmtp.isValidate ? true : false)
      this.form.patchValue({
        id: this.customSmtp.id,
        host: this.customSmtp.host,
        port: this.customSmtp.port,
        secure: this.customSmtp.secure,
        username: this.customSmtp.username,
        password: this.customSmtp.password,
        isValidate: this.customSmtp.isValidate
      })
    }
  }

  /*
   * Global SMTP Configuration
   */
  globalSmtpPatch(setting: any) {
    this.form.patchValue({
      host: setting.host,
      port: setting.port,
      secure: setting.secure,
      username: setting['auth']['user'],
      password: setting['auth']['pass']
    })
  }

  onFormChange(model) {}

  onSubmit() {
    if (this.form.invalid) {
      return
    }

    if (this.form.get('id').value) {
      this.updateSetting()
    } else {
      this.saveSetting()
    }
  }

  saveSetting() {
    const { value } = this.form
    value['isValidate'] = this.isValidated

    this.customSmtpService
      .saveSMTPSetting(value)
      .then(() => {
        this.toastrService.success(
          this.getTranslation('TOASTR.TITLE.SUCCESS'),
          this.getTranslation(`TOASTR.MESSAGE.CUSTOM_SMTP_ADDED`)
        )
      })
      .catch(() => {
        this.toastrService.error('TOASTR.MESSAGE.ERRORS')
      })
      .finally(() => this.getTenantSmtpSetting())
  }

  updateSetting() {
    const { id } = this.form.value
    const { value } = this.form
    value['isValidate'] = this.isValidated

    this.customSmtpService
      .updateSMTPSetting(id, value)
      .then(() => {
        this.toastrService.success(
          this.getTranslation('TOASTR.TITLE.SUCCESS'),
          this.getTranslation(`TOASTR.MESSAGE.CUSTOM_SMTP_UPDATED`)
        )
      })
      .catch(() => {
        this.toastrService.error('TOASTR.MESSAGE.ERRORS')
      })
      .finally(() => this.getTenantSmtpSetting())
  }

  async validateSmtp() {
    try {
      const smtp = this.form.getRawValue()
      await this.customSmtpService.validateSMTPSetting(smtp)
      this.isValidated.set(true)
      this.toastrService.success(this.getTranslation('TOASTR.TITLE.SUCCESS', { Default: 'Success' }))
    } catch (error) {
      this.isValidated.set(false)
      this.toastrService.error(this.getTranslation('TOASTR.MESSAGE.ERRORS', { Default: 'Errors' }))
    }
  }
}
