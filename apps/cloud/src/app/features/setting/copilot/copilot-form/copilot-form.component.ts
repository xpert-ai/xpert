import { Dialog } from '@angular/cdk/dialog'
import { DecimalPipe } from '@angular/common'
import { booleanAttribute, Component, computed, effect, inject, input, model, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatSliderModule } from '@angular/material/slider'
import { AiModelTypeEnum, AiProviderRole, ICopilot } from '@metad/contracts'
import { AiProvider } from '@metad/copilot'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import {
  CopilotAiProvidersComponent,
  CopilotModelSelectComponent,
  CopilotProviderComponent
} from '@cloud/app/@shared/copilot'
import { BehaviorSubject, firstValueFrom } from 'rxjs'
import {
  getErrorMessage,
  ICopilotProviderModel,
  injectCopilots,
  injectCopilotServer,
  Store,
  ToastrService
} from '../../../../@core'
import { PACCopilotService } from '../../../services'

@Component({
  standalone: true,
  selector: 'pac-copilot-form',
  templateUrl: './copilot-form.component.html',
  styleUrls: ['./copilot-form.component.scss'],
  imports: [
    DecimalPipe,
    TranslateModule,
    FormsModule,
    ReactiveFormsModule,
    MatSliderModule,
    MatButtonModule,
    NgmSpinComponent,
    CopilotProviderComponent,
    CopilotModelSelectComponent
  ]
})
export class CopilotFormComponent {
  AiProvider = AiProvider
  eAiModelTypeEnum = AiModelTypeEnum

  readonly #store = inject(Store)
  readonly copilotService = inject(PACCopilotService)
  readonly copilotServer = injectCopilotServer()
  readonly #toastrService = inject(ToastrService)
  readonly #dialog = inject(Dialog)
  readonly copilots = injectCopilots()

  // Inputs
  readonly copilot = input<ICopilot>()

  readonly enabled = model<boolean>(false)
  readonly embedding = input<boolean, string | boolean>(false, {
    transform: booleanAttribute
  })

  // States
  readonly formGroup = new FormGroup(
    {
      id: new FormControl(null),
      tokenBalance: new FormControl(null),
      copilotModel: new FormControl(null)
    },
    {}
  )

  get tokenBalance() {
    return this.formGroup.get('tokenBalance').value
  }

  readonly role = computed(() => this.copilot()?.role)

  readonly saving = signal(false)

  readonly organizationId = toSignal(this.#store.selectOrganizationId())
  readonly copilotId = computed(() => this.copilot()?.id)

  readonly refresh$ = new BehaviorSubject<void>(null)

  readonly modelProvider = computed(() => this.copilot()?.modelProvider)

  readonly defaultModelType = computed(() => {
    switch (this.role()) {
      case AiProviderRole.Primary:
        return AiModelTypeEnum.LLM
      case AiProviderRole.Secondary:
        return AiModelTypeEnum.LLM
      case AiProviderRole.Embedding:
        return AiModelTypeEnum.TEXT_EMBEDDING
      default:
        return null
    }
  })
  constructor() {
    effect(() => {
      // console.log(this.copilot())
    })

    effect(
      () => {
        if (this.copilot()) {
          this.formGroup.patchValue(this.copilot())
          this.formGroup.markAsPristine()
        }
      },
      { allowSignalWrites: true }
    )
  }

  async onSubmit() {
    try {
      this.saving.set(true)
      await firstValueFrom(
        this.copilotServer.update(this.copilotId(), {
          ...this.formGroup.value
        })
      )
      this.formGroup.markAsPristine()
      this.#toastrService.success('PAC.ACTIONS.Save', { Default: 'Save' })
      this.copilotServer.refresh()
    } catch (err) {
      this.#toastrService.error(getErrorMessage(err))
    } finally {
      this.saving.set(false)
    }
  }

  formatBalanceLabel(value: number): string {
    if (value >= 1000000) {
      return Math.round(value / 1000000) + 'm'
    }
    if (value >= 1000) {
      return Math.round(value / 1000) + 'k'
    }

    return `${value}`
  }

  cancel() {
    if (this.copilot()) {
      this.formGroup.patchValue(this.copilot())
    } else {
      this.formGroup.reset()
    }
    this.formGroup.markAsPristine()
  }

  openAiProviders() {
    const dialogRef = this.#dialog.open<string>(CopilotAiProvidersComponent, {
      data: {
        copilot: this.formGroup.value
      }
    })

    dialogRef.closed.subscribe((copilotProvider) => {
      this.copilotServer.refresh()
      this.refresh$.next()
    })
  }

  removedModelProvider() {
    this.refresh$.next()
    this.copilotServer.refresh()
  }

  onAddedModel(model: ICopilotProviderModel) {
    this.copilotServer.refresh()
  }
}
