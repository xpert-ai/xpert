import { inject, Injectable } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { OrganizationBaseCrudService } from '@metad/cloud/state'
import { toParams } from '@metad/core'
import { NGXLogger } from 'ngx-logger'
import { BehaviorSubject, Observable, shareReplay, switchMap } from 'rxjs'
import { API_COPILOT } from '../constants/app.constants'
import {
  AiModelTypeEnum,
  AiProviderRole,
  IAiProviderEntity,
  ICopilot,
  ICopilotWithProvider,
  ParameterRule
} from '../types'
import { HttpParams } from '@angular/common/http'

@Injectable({ providedIn: 'root' })
export class CopilotServerService extends OrganizationBaseCrudService<ICopilot> {
  readonly #logger = inject(NGXLogger)

  readonly refresh$ = new BehaviorSubject(false)

  private readonly modelsByType = new Map<AiModelTypeEnum, Observable<ICopilotWithProvider[]>>()
  private readonly aiProviders$ = this.httpClient
    .get<IAiProviderEntity[]>(API_COPILOT + `/providers`)
    .pipe(shareReplay(1))

  /**
   * All available copilots (enabled or tenant free quota)
   */
  private readonly copilots$ = this.refresh$.pipe(
    switchMap(() => this.selectOrganizationId()),
    switchMap(() => this.httpClient.get<ICopilot[]>(this.apiBaseUrl + `/availables`)),
    shareReplay(1)
  )

  constructor() {
    super(API_COPILOT)
  }

  refresh() {
    this.refresh$.next(true)
  }

  getCopilots() {
    return this.copilots$
  }

  getAiProviders() {
    return this.aiProviders$
  }

  getCopilotModels(type: AiModelTypeEnum) {
    if (!this.modelsByType.get(type)) {
      this.modelsByType.set(
        type,
        this.refresh$.pipe(
          switchMap(() =>
            this.httpClient.get<ICopilotWithProvider[]>(API_COPILOT + '/models', { params: toParams({ type }) })
          ),
          shareReplay(1)
        )
      )
    }
    return this.modelsByType.get(type)
  }

  /**
   * @deprecated use getModelParameterRules in CopilotProviderService
   */
  getModelParameterRules(provider: string, model: string) {
    return this.httpClient.get<ParameterRule[]>(API_COPILOT + `/provider/${provider}/model-parameter-rules`, {
      params: {
        model
      }
    })
  }

  enableCopilot(role: AiProviderRole) {
    return this.httpClient.post(this.apiBaseUrl + `/enable/${role}`, {})
  }

  disableCopilot(role: AiProviderRole) {
    return this.httpClient.post(this.apiBaseUrl + `/disable/${role}`, {})
  }

  // Statistics

  getStatisticsDailyConversations(timeRange: string[]) {
    return this.httpClient.get<{date: string; count?: number;}[]>(this.apiBaseUrl + `/statistics/daily-conversations`, {
      params: this.timeRangeToParams(new HttpParams(), timeRange)
    })
  }

  getStatisticsDailyEndUsers(timeRange: string[]) {
    return this.httpClient.get<{date: string; count?: number;}[]>(this.apiBaseUrl + `/statistics/daily-end-users`, {
      params: this.timeRangeToParams(new HttpParams(), timeRange)
    })
  }

  getStatisticsAverageSessionInteractions(timeRange: string[]) {
    return this.httpClient.get<{date: string; count?: number;}[]>(this.apiBaseUrl + `/statistics/average-session-interactions`, {
      params: this.timeRangeToParams(new HttpParams(), timeRange)
    })
  }

  getStatisticsDailyMessages(timeRange: string[]) {
    return this.httpClient.get<{date: string; count?: number;}[]>(this.apiBaseUrl + `/statistics/daily-messages`, {
      params: this.timeRangeToParams(new HttpParams(), timeRange)
    })
  }

  getStatisticsTokensPerSecond(timeRange: string[]) {
    return this.httpClient.get<{date: string; count?: number;}[]>(this.apiBaseUrl + `/statistics/tokens-per-second`, {
      params: this.timeRangeToParams(new HttpParams(), timeRange)
    })
  }

  getStatisticsTokenCost(timeRange: string[]) {
    return this.httpClient.get<{ date: string; tokens: number; price: number; model: string; currency: string;}[]>(this.apiBaseUrl + `/statistics/token-costs`, {
      params: this.timeRangeToParams(new HttpParams(), timeRange)
    })
  }

  getStatisticsUserSatisfactionRate(timeRange: string[]) {
    return this.httpClient.get<{ date: string; tokens: number; price: number; model: string; currency: string;}[]>(
      this.apiBaseUrl + `/statistics/user-satisfaction-rate`, {
      params: this.timeRangeToParams(new HttpParams(), timeRange)
    })
  }


  timeRangeToParams(params: HttpParams, timeRange: string[]) {
    if (timeRange[0]) {
      params = params.set('start', timeRange[0])
    }
    if (timeRange[1]) {
      params = params.set('end', timeRange[1])
    }
    return params
  }
}

export function injectAiProviders() {
  const service = inject(CopilotServerService)
  return toSignal(service.getAiProviders())
}

export function injectCopilotServer() {
  return inject(CopilotServerService)
}

export function injectCopilots() {
  const server = injectCopilotServer()
  return toSignal(server.getCopilots())
}
