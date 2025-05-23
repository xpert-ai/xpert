import { Injectable, computed, effect, inject, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import {
  BusinessRoleType,
  CopilotService,
  DefaultBusinessRole,
  NgmLanguageEnum,
  AiProviderRole,
  ICopilot
} from '@metad/copilot'
import { TranslateService } from '@ngx-translate/core'
import { ClientOptions } from '@langchain/openai'
import { combineLatest, map, shareReplay, startWith } from 'rxjs'
import { createLLM } from '../core'

@Injectable()
export abstract class NgmCopilotService extends CopilotService {
  readonly translate = inject(TranslateService)

  readonly copilots = signal<ICopilot[]>(null)
  readonly credentials = signal<{ apiHost: string; apiKey: string }>(null)

  readonly lang = toSignal(
    this.translate.onLangChange.pipe(
      map((event) => event.lang),
      startWith(this.translate.currentLang)
    )
  )
  readonly defaultRoleI18n = toSignal(
    this.translate.stream('Copilot.DefaultBusinessRole', {
      Default: { title: 'Common', description: 'Common business role' }
    })
  )

  readonly role = signal<string>(DefaultBusinessRole)
  readonly roles = signal<BusinessRoleType[]>([])
  readonly allRoles = computed(() => {
    const lang = this.lang()
    const selectedRoleName = this.role()
    const roles = [NgmLanguageEnum.SimplifiedChinese, NgmLanguageEnum.Chinese].includes(lang as NgmLanguageEnum)
      ? this.roles()?.map((role) => ({ ...role, title: role.titleCN || role.title }))
      : this.roles()
    const items: BusinessRoleType[] = [
      {
        name: DefaultBusinessRole,
        title: this.defaultRoleI18n().title,
        description: this.defaultRoleI18n().description
      },
      ...(roles ?? [])
    ]
    if (!items.some((_) => _.name === selectedRoleName)) {
      items.push({
        name: selectedRoleName,
        title: selectedRoleName,
        description: ''
      })
    }
    return items
  })
  
  readonly roleDetail = computed(() => this.allRoles()?.find((role) => role.name === this.role()))
  readonly rolePrompt = computed(() => {
    const role = this.roleDetail()
    return role ? `Your role is '${role.title}', and your responsibility is ${role.description}.` : ''
  })

  readonly languagePrompt = computed(
    () =>
      `Please answer in language ${Object.entries(NgmLanguageEnum).find((item) => item[1] === this.lang())?.[0] ?? 'English'}`
  )

  // Xpert ChatModel
  readonly copilot = computed(() => {
    const role = this.roleDetail()
    const copilots = this.copilots()
    return (
      copilots?.find((_) => _.id === role?.copilotModel?.copilotId) ??
      copilots?.find((_) => _.role === AiProviderRole.Primary)
    )
  })

  readonly llm$ = combineLatest([this.copilot$, this.clientOptions$]).pipe(
    map(([copilot, clientOptions]) => {
      const role = this.roleDetail()
      return copilot?.enabled
        ? createLLM(
            { ...copilot, copilotModel: role?.copilotModel || copilot.copilotModel },
            this.credentials(),
            clientOptions,
            (input) => {
              this.recordTokenUsage(input)
            }
          )
        : null
    }),
    shareReplay(1)
  )

  constructor() {
    super()

    effect(() => {
      if (this.copilot()) {
        this.setCopilot(this.copilot())
      }
    }, { allowSignalWrites: true })
  }

  setRole(role: string): void {
    this.role.set(role)
  }

  abstract enableCopilot(): void

  forkChatModel$(config: ClientOptions) {
    return combineLatest([this.copilot$, this.clientOptions$])
      .pipe(
        map(([copilot, clientOptions]) =>
          copilot?.enabled
            ? createLLM(copilot, this.credentials(), {...clientOptions, ...config}, (input) => {
                this.recordTokenUsage(input)
              })
            : null
        )
      )
  }
}
