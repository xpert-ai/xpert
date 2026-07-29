import { Component, ViewChild, computed, effect, inject, signal } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'
import {
  ZardButtonComponent,
  ZardFormImports,
  ZardInputDirective,
  ZardStepperComponent,
  ZardStepperImports,
  type ZardStepperSelectionEvent
} from '@xpert-ai/headless-ui'
import { Router } from '@angular/router'
import { matchWithValidator } from '@cloud/app/auth'
import { injectOrganization, ITenant, Store } from '@cloud/app/@core/state'
import { XpCommonModule } from '@xpert-ai/headless-ui'
import { TranslateModule } from '@ngx-translate/core'
import { combineLatest, filter, firstValueFrom, map, switchMap } from 'rxjs'
import {
  AiProviderRole,
  AuthStrategy,
  BonusTypeEnum,
  CopilotServerService,
  CurrenciesEnum,
  DEFAULT_TENANT,
  DefaultValueDateTypeEnum,
  IOrganization,
  ICopilot,
  TenantService,
  ToastrService,
  getErrorMessage,
  injectHelpWebsite,
  injectLanguage
} from '../../@core'
import { CopilotConfigFormComponent } from '@cloud/app/@shared/copilot'

@Component({
  standalone: true,
  selector: 'xp-tenant-details',
  templateUrl: './tenant-details.component.html',
  styleUrls: ['./tenant-details.component.scss'],
  imports: [
    ReactiveFormsModule,
    TranslateModule,
    ...ZardStepperImports,
    ...ZardFormImports,
    ZardInputDirective,
    XpCommonModule,
    CopilotConfigFormComponent,
    ZardButtonComponent
  ]
})
export class TenantDetailsComponent {
  readonly #store = inject(Store)
  private readonly tenantService = inject(TenantService)
  readonly #copilotServer = inject(CopilotServerService)
  private readonly authStrategy = inject(AuthStrategy)
  private readonly _formBuilder = inject(FormBuilder)
  private readonly router = inject(Router)
  private readonly toastrService = inject(ToastrService)
  readonly currentLanguage = injectLanguage()
  readonly helpWebsite = injectHelpWebsite()
  readonly selectedOrganization = injectOrganization()

  @ViewChild('stepper') stepper: ZardStepperComponent

  readonly password = this._formBuilder.control('', [Validators.required, Validators.minLength(8)])
  userFormGroup: FormGroup = this._formBuilder.group({
    firstName: [''],
    lastName: [''],
    email: ['', [Validators.required, Validators.email]],
    organizationName: ['', [Validators.required]],
    password: this.password,
    confirmPassword: ['', [Validators.required, Validators.minLength(8), matchWithValidator(this.password)]]
  })

  readonly orgCopilots = toSignal(
    combineLatest([this.#copilotServer.refresh$, toObservable(this.selectedOrganization)]).pipe(
      filter(([, organization]) => !!organization?.id),
      switchMap(() => this.#copilotServer.getAllInOrg()),
      map(({ items }) => items)
    ),
    { initialValue: [] as ICopilot[] }
  )
  readonly primaryCopilot = computed(
    () => this.orgCopilots()?.find((item) => item.role === AiProviderRole.Primary) ?? null
  )
  readonly showAiModelForm = computed(() => !!this.primaryCopilot()?.enabled)

  loading = signal(false)
  aiModelSetupRequested = signal(false)
  tenantCompleted = signal(false)
  primaryCopilotCreatedInOnboarding = signal(false)

  readonly navigating = signal(false)

  constructor() {
    effect(() => {
      const organizationId = this.selectedOrganization()?.id
      if (organizationId) {
        this.#copilotServer.refresh()
      }
    })
  }

  minlengthError() {
    return this.userFormGroup.get('password').getError('minlength')
  }

  mustMatchError() {
    return this.userFormGroup.get('confirmPassword').getError('mismatch')
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

    this.#store.setOrganizationScope(organization)
    this.#copilotServer.refresh()
  }

  navigateHome() {
    this.navigating.set(true)
    this.router.navigate(['/chat/'])
  }

  async startAiModelSetup() {
    const primaryCopilot = this.primaryCopilot()

    if (this.aiModelSetupRequested() || primaryCopilot?.enabled) {
      return
    }

    this.aiModelSetupRequested.set(true)
    this.loading.set(true)
    try {
      if (!primaryCopilot) {
        this.primaryCopilotCreatedInOnboarding.set(true)
      }

      await firstValueFrom(this.#copilotServer.enableCopilot(AiProviderRole.Primary))
      this.#copilotServer.refresh()
    } catch (error) {
      this.aiModelSetupRequested.set(false)
      this.primaryCopilotCreatedInOnboarding.set(false)
      this.toastrService.error(getErrorMessage(error))
    } finally {
      this.loading.set(false)
    }
  }

  onStepChange(event: ZardStepperSelectionEvent) {
    if (event.selectedIndex !== 1 || this.primaryCopilot()?.enabled || this.aiModelSetupRequested() || this.loading()) {
      return
    }

    void this.startAiModelSetup()
  }

  async skipAiModelSetup() {
    const primaryCopilot = this.primaryCopilot()
    const shouldDeletePrimary =
      this.primaryCopilotCreatedInOnboarding() &&
      !!primaryCopilot &&
      !primaryCopilot.modelProvider &&
      !primaryCopilot.copilotModel

    if (!shouldDeletePrimary) {
      this.stepper.next()
      return
    }

    this.loading.set(true)
    try {
      await firstValueFrom(this.#copilotServer.delete(primaryCopilot.id))
      this.aiModelSetupRequested.set(false)
      this.primaryCopilotCreatedInOnboarding.set(false)
      this.#copilotServer.refresh()
      this.stepper.next()
    } catch (error) {
      this.toastrService.error(getErrorMessage(error))
    } finally {
      this.loading.set(false)
    }
  }

  onAiModelSaved() {
    this.primaryCopilotCreatedInOnboarding.set(false)
    this.stepper.next()
  }
}
