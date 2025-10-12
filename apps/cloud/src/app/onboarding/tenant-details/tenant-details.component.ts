import { CdkListboxModule } from '@angular/cdk/listbox'
import { CommonModule } from '@angular/common'
import { Component, ViewChild, computed, effect, inject, model, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInputModule } from '@angular/material/input'
import { MatListModule } from '@angular/material/list'
import { MatProgressBarModule } from '@angular/material/progress-bar'
import { MatRadioModule } from '@angular/material/radio'
import { MatStepper, MatStepperModule } from '@angular/material/stepper'
import { Router } from '@angular/router'
import { matchWithValidator } from '@metad/cloud/auth'
import { DataSourceService, DataSourceTypesService, IFeatureOrganizationUpdateInput, injectOrganization, ITenant, Store } from '@metad/cloud/state'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { omit } from '@metad/ocap-core'
import { FormlyModule } from '@ngx-formly/core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { BehaviorSubject, combineLatest, firstValueFrom, map, startWith } from 'rxjs'
import {
  AuthStrategy,
  BonusTypeEnum,
  CurrenciesEnum,
  DEFAULT_TENANT,
  DefaultValueDateTypeEnum,
  FeatureService,
  IDataSourceType,
  IOrganization,
  OrganizationDemoNetworkEnum,
  OrganizationsService,
  ServerAgent,
  TenantService,
  ToastrService,
  convertConfigurationSchema,
  getErrorMessage,
  injectHelpWebsite,
  injectLanguage
} from '../../@core'
import { FeatureCategoryComponent } from '@cloud/app/@shared/features'

@Component({
  standalone: true,
  selector: 'ngm-tenant-details',
  templateUrl: './tenant-details.component.html',
  styleUrls: ['./tenant-details.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    CdkListboxModule,
    MatStepperModule,
    MatFormFieldModule,
    MatInputModule,
    MatListModule,
    MatRadioModule,
    MatProgressBarModule,
    FormlyModule,
    FeatureCategoryComponent,

    NgmCommonModule,
  ],
  providers: [FeatureService]
})
export class TenantDetailsComponent {
  OrganizationDemoNetworkEnum = OrganizationDemoNetworkEnum

  readonly #store = inject(Store)
  private readonly tenantService = inject(TenantService)
  private readonly typesService = inject(DataSourceTypesService)
  private readonly dataSourceService = inject(DataSourceService)
  private readonly organizationsService = inject(OrganizationsService)
  readonly #featureAPI = inject(FeatureService)
  private readonly serverAgent? = inject(ServerAgent, { optional: true })
  private readonly authStrategy = inject(AuthStrategy)
  private readonly _formBuilder = inject(FormBuilder)
  private readonly router = inject(Router)
  private readonly translateService = inject(TranslateService)
  private readonly toastrService = inject(ToastrService)
  readonly currentLanguage = injectLanguage()
  readonly helpWebsite = injectHelpWebsite()
  readonly selectedOrganization = injectOrganization()

  @ViewChild('stepper') stepper: MatStepper

  readonly password = this._formBuilder.control('', [Validators.required, Validators.minLength(8)])
  userFormGroup: FormGroup = this._formBuilder.group({
    firstName: [''],
    lastName: [''],
    email: ['', [Validators.required, Validators.email]],
    organizationName: ['', [Validators.required]],
    password: this.password,
    confirmPassword: ['', [Validators.required, Validators.minLength(8), matchWithValidator(this.password)]]
  })

  // Features
  readonly features = model<{feature: IFeatureOrganizationUpdateInput; category: 'ai' | 'bi'}[]>([])
  readonly hasSemanticModel = computed(() => this.features().some(({category, feature}) => category === 'bi' && feature.isEnabled))

  demoFormGroup: FormGroup = this._formBuilder.group({
    source: [OrganizationDemoNetworkEnum.github, Validators.required]
  })

  dataSourceTypeFormGroup: FormGroup = this._formBuilder.group({
    type: [null, [Validators.required]],
    name: [null, [Validators.required]]
  })
  get type() {
    return this.dataSourceTypeFormGroup.get('type').value?.[0]
  }

  // defaultOrganization = signal<IOrganization>(null)

  loading = signal(false)
  tenantCompleted = signal(false)
  demoError = signal<string>(null)
  demoCompleted = signal(false)
  connectionCompleted = signal(false)

  searchControl = new FormControl()
  private readonly dataSourceTypes$ = new BehaviorSubject<IDataSourceType[]>([])
  public readonly filteredDataSourceTypes = toSignal(
    combineLatest([this.dataSourceTypes$, this.searchControl.valueChanges.pipe(startWith(''))]).pipe(
      map(([types, search]) =>
        search ? types.filter((type) => type.name.toLowerCase().includes(search.toLowerCase())) : types
      )
    )
  )

  readonly formlyFields = toSignal(
    combineLatest([
      this.translateService.stream('PAC.DataSources.Schema'),
      this.dataSourceTypeFormGroup.get('type').valueChanges
    ]).pipe(map(([i18n, type]) => convertConfigurationSchema(type[0].configuration, i18n)))
  )

  model = {}

  constructor() {
    effect(() => {
      console.log(this.selectedOrganization())
    })
  }

  minlengthError() {
    return this.userFormGroup.get('password').getError('minlength')
  }

  mustMatchError() {
    return this.userFormGroup.get('confirmPassword').getError('mismatch')
  }

  dataSourceNameError() {
    return this.dataSourceTypeFormGroup.get('name').getError('required')
  }

  async onboard() {
    this.loading.set(true)
    let tenant: ITenant
    try {
      tenant = await this.tenantService.onboard({
        name: DEFAULT_TENANT,
        superAdmin: {
          firstName: this.userFormGroup.get('firstName').value,
          lastName: this.userFormGroup.get('lastName').value,
          email: this.userFormGroup.get('email').value,
          hash: this.userFormGroup.get('password').value,
          preferredLanguage: this.currentLanguage()
        },
        defaultOrganization: {
          name: this.userFormGroup.get('organizationName').value,
          preferredLanguage: this.currentLanguage(),
          invitesAllowed: true,
          currency: CurrenciesEnum.USD,
          profile_link: '',
          imageUrl: '',
          isDefault: true,
          client_focus: '',
          defaultValueDateType: DefaultValueDateTypeEnum.TODAY,
          bonusType: BonusTypeEnum.PROFIT_BASED_BONUS,
          tenant: null
        }
      })

      this.tenantCompleted.set(true)

      // this.defaultOrganization.set(tenant.organizations[0])
    } catch (error) {
      console.error(error)
      this.loading.set(false)
      this.toastrService.error(getErrorMessage(error))
      return
    }

    try {
      await this.afterOnboard(tenant.organizations[0])
    } catch (error) {
      console.error(error)
      this.toastrService.error(getErrorMessage(error))
    }

    this.loading.set(false)
    this.stepper.next()
  }

  async afterOnboard(organization: IOrganization) {
    await firstValueFrom(
      this.authStrategy.login({
        email: this.userFormGroup.get('email').value,
        password: this.userFormGroup.get('password').value
      })
    )

    this.#store.selectedOrganization = organization
    this.dataSourceTypes$.next(await firstValueFrom(this.typesService.getAll()))
  }

  enableFeatures() {
    this.loading.set(true)
    this.#featureAPI.featuresToggle(this.features().map(({feature}) => feature)).subscribe({
      next: () => {
        this.loading.set(false)
        this.toastrService.success('PAC.Onboarding.EnableFeaturesSuccess', {
          Default: 'Features enabled successfully!'
        })
        this.stepper.next()
      },
      error: (err) => {
        this.loading.set(false)
        this.toastrService.error(getErrorMessage(err))
      }
    })
  }

  /**
   * Generate demo data for default organization
   */
  async generateDemo() {
    try {
      this.demoError.set(null)
      this.loading.set(true)
      await firstValueFrom(
        this.organizationsService.demo(this.selectedOrganization().id, {
          source: this.demoFormGroup.get('source').value,
          importData: true
        })
      )

      this.toastrService.success('PAC.Onboarding.GenerateDemoSuccess', {
        Default: 'Demo data & samples generated successfully!'
      })
      this.demoCompleted.set(true)
      this.loading.set(false)
      this.stepper.next()
    } catch (error) {
      this.loading.set(false)
      const errorText = getErrorMessage(error)
      this.demoError.set(errorText)
      this.toastrService.error(errorText)
    }
  }

  navigateHome() {
    this.router.navigate(['home'])
  }

  compareTypeFn(a: IDataSourceType, b: IDataSourceType) {
    return a?.id === b?.id
  }

  onModelChange(event) {
    // console.log(event)
  }

  async connectDatabase() {
    this.loading.set(true)
    const dataSource = {
      name: this.dataSourceTypeFormGroup.value.name,
      type: this.type,
      options: {
        ...omit(this.dataSourceTypeFormGroup.value, 'type', 'name')
      }
    }
    try {
      await this.serverAgent.request(
        {
          type: this.type.protocol.toUpperCase(),
          dataSource: {
            ...this.dataSourceTypeFormGroup.value,
            typeId: this.type.id
          },
          isDraft: false
        },
        {
          method: 'get',
          url: 'ping',
          body: dataSource
        }
      )

      this.toastrService.success('PAC.ACTIONS.PING', { Default: 'Ping' })

      // Create datadource
      const result = await firstValueFrom(this.dataSourceService.create(dataSource))
      this.toastrService.success('PAC.MESSAGE.CreateDataSource', { Default: 'Create data source' })
      this.loading.set(false)
      this.connectionCompleted.set(true)
      this.stepper.next()
    } catch (err) {
      const message = getErrorMessage(err)
      this.loading.set(false)
      this.toastrService.error(message)
    }
  }
}
