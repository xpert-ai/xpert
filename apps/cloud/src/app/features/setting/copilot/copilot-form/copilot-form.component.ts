import { Dialog } from '@angular/cdk/dialog'
import { DecimalPipe } from '@angular/common'
import { booleanAttribute, Component, computed, effect, inject, input, model, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { AiModelTypeEnum, AiProviderRole } from '@metad/contracts'
import { AiProvider } from '@metad/copilot'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { derivedAsync } from 'ngxtension/derived-async'
import { BehaviorSubject, firstValueFrom } from 'rxjs'
import { switchMap } from 'rxjs/operators'
import {
  CopilotServerService,
  getErrorMessage,
  ICopilotProviderModel,
  injectCopilots,
  PACCopilotService,
  Store,
  ToastrService
} from '../../../../@core'
import { CopilotAiProvidersComponent, CopilotProviderComponent, MaterialModule } from '../../../../@shared'
import { CopilotModelSelectComponent } from '../../../../@shared/'

const PROVIDERS = [
  {
    name: AiProvider.OpenAI,
    icon: 'openai.svg',
    iconAlt: 'openai-logo',
    embedding: true
  },
  {
    name: AiProvider.Azure,
    icon: 'azure.svg',
    iconAlt: 'azure-logo',
    embedding: true
  },
  {
    name: AiProvider.Ollama,
    icon: 'ollama.svg',
    iconAlt: 'ollama-logo',
    embedding: true
  },
  {
    name: AiProvider.DeepSeek,
    icon: 'deepseek.svg',
    iconAlt: 'deepseek-logo',
    embedding: false
  },
  {
    name: AiProvider.Anthropic,
    icon: 'claude.svg',
    iconAlt: 'claude-logo',
    embedding: false
  },
  {
    name: AiProvider.AlibabaTongyi,
    icon: 'tongyi.svg',
    iconAlt: 'tongyi-logo',
    embedding: true
  },
  {
    name: AiProvider.Zhipu,
    icon: 'zhipu.svg',
    iconAlt: 'zhipu-logo',
    embedding: true
  },
  // {
  //   name: AiProvider.BaiduQianfan,
  //   icon: 'qianfan.svg',
  //   iconAlt: 'qianfan-logo',
  //   embedding: true
  // }
  {
    name: AiProvider.Together,
    icon: 'together-ai.svg',
    iconAlt: 'together-logo',
    embedding: true
  },
  {
    name: AiProvider.Moonshot,
    icon: 'moonshot.svg',
    iconAlt: 'moonshot-logo',
    embedding: false
  },
  {
    name: AiProvider.Groq,
    icon: 'groq.svg',
    iconAlt: 'groq-logo',
    embedding: false
  },
  {
    name: AiProvider.Mistral,
    icon: 'mistral.svg',
    iconAlt: 'mistral-logo',
    embedding: true
  },
  {
    name: AiProvider.Cohere,
    icon: 'cohere.svg',
    iconAlt: 'cohere-logo',
    embedding: true
  }
]

@Component({
  standalone: true,
  selector: 'pac-copilot-form',
  templateUrl: './copilot-form.component.html',
  styleUrls: ['./copilot-form.component.scss'],
  imports: [
    DecimalPipe,
    TranslateModule,
    MaterialModule,
    FormsModule,
    ReactiveFormsModule,
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
  readonly copilotServer = inject(CopilotServerService)
  readonly #toastrService = inject(ToastrService)
  readonly #dialog = inject(Dialog)
  readonly copilots = injectCopilots()

  // Inputs
  readonly role = input<AiProviderRole>()

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

  readonly saving = signal(false)

  readonly organizationId = toSignal(this.#store.selectOrganizationId())
  readonly copilotId = computed(
    () =>
      this.copilots()?.find((item) => item.organizationId === this.organizationId() && item.role === this.role())?.id
  )

  readonly refresh$ = new BehaviorSubject<void>(null)
  readonly copilot = derivedAsync(() => {
    return this.copilotId()
      ? this.refresh$.pipe(
          switchMap(() => this.copilotServer.getOneById(this.copilotId(), { relations: ['modelProvider'] }))
        )
      : null
  })

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
