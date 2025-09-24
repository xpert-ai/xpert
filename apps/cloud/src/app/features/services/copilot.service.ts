import { HttpClient } from '@angular/common/http'
import { effect, inject, Injectable } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { Router } from '@angular/router'
import { AuthService } from '@metad/cloud/state'
import { BusinessRoleType } from '@metad/copilot'
import { NgmCopilotService } from '@metad/copilot-angular'
import { pick } from '@metad/ocap-core'
import { environment } from '@cloud/environments/environment'
import { BehaviorSubject, combineLatest, firstValueFrom, map } from 'rxjs'
import { CopilotServerService, Store, XpertAPIService } from '../../@core'
import { AgentService } from '../../@core/services/agent.service'

const baseUrl = environment.API_BASE_URL
const API_CHAT = constructUrl(baseUrl) + '/api/ai/chat'
const API_AI_HOST = constructUrl(baseUrl) + '/api/ai/proxy'

@Injectable({ providedIn: 'root' })
export class PACCopilotService extends NgmCopilotService {
  readonly #store = inject(Store)
  readonly httpClient = inject(HttpClient)
  readonly authService = inject(AuthService)
  readonly xpertService = inject(XpertAPIService)
  readonly router = inject(Router)
  readonly #agentService = inject(AgentService)
  readonly copilotServer = inject(CopilotServerService)

  // Init copilot config
  private _userSub = this.copilotServer
    .getCopilots()
    .pipe(takeUntilDestroyed())
    .subscribe((items) => {
      this.copilots.set(items)
    })

  // Use Xpert as copilot role
  private roleSub = this.xpertService
    .getMyCopilots(['copilotModel'])
    .pipe(
      map(({ items }) => items),
      takeUntilDestroyed()
    )
    .subscribe((roles) => {
      this.roles.set(roles as unknown as BusinessRoleType[])
    })

  private clientOptionsSub = combineLatest([this.#store.token$, this.#store.selectOrganizationId()])
    .pipe(
      map(([token, organizationId]) => ({
        defaultHeaders: {
          'Organization-Id': `${organizationId}`,
          Authorization: `Bearer ${token}`
        },
        fetch: (async (url: string, request: RequestInit) => {
          try {
            const response = await fetch(url, request)
            // Refresh token if unauthorized
            if (response.status === 401) {
              try {
                await firstValueFrom(this.authService.isAlive())
                request.headers['authorization'] = this.getAuthorizationToken()
                return await fetch(url, request)
              } catch (error) {
                return response
              }
            }

            return response
          } catch (error) {
            console.error(error)
            return null
          }
        }) as any
      }))
    )
    .subscribe((options) => this.clientOptions$.next(options))

  private tokenSub = this.tokenUsage$.pipe(takeUntilDestroyed()).subscribe((usage) => {
    this.#agentService.emit('copilot', {
      organizationId: this.#store.organizationId,
      copilot: pick(usage.copilot, 'organizationId', 'provider', 'id'),
      tokenUsed: usage.tokenUsed
    })
  })

  constructor() {
    super()

    effect(
      () => {
        this.credentials.set({
          apiHost: API_AI_HOST,
          apiKey: this.#store.token
        })
      },
      { allowSignalWrites: true }
    )

    // effect(
    //   () => {
    //     const items = this.copilots()
    //     if (items?.length > 0) {
    //       items.forEach((item) => {
    //         if (item.role === AiProviderRole.Primary) {
    //           this.copilot = {
    //             ...item,
    //             chatUrl: API_CHAT,
    //             apiHost: API_AI_HOST + `/${AiProviderRole.Primary}`,
    //             apiKey: this.#store.token
    //           }
    //         } else if (item.role === AiProviderRole.Secondary) {
    //           this.secondary = {
    //             ...item,
    //             apiHost: API_AI_HOST + `/${AiProviderRole.Secondary}`
    //           }
    //         }
    //       })
    //     } else {
    //       this.copilot = {
    //         enabled: false
    //       }
    //     }
    //   },
    //   { allowSignalWrites: true }
    // )

    effect(
      () => {
        if (this.#store.copilotRole()) {
          this.role.set(this.#store.copilotRole())
        }
      },
      { allowSignalWrites: true }
    )

    effect(
      () => {
        this.#store.setCopilotRole(this.role())
      },
      { allowSignalWrites: true }
    )
  }

  private getAuthorizationToken() {
    return `Bearer ${this.#store.token}`
  }

  enableCopilot(): void {
    this.router.navigate(['settings', 'copilot'])
  }
}

function constructUrl(url: string) {
  const protocol = window.location.protocol

  if (url?.startsWith('http')) {
    return url
  }

  return url ? `${protocol}${url}` : ''
}
