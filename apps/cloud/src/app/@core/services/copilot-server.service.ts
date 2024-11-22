import { OrganizationBaseCrudService } from '@metad/cloud/state'
import { NGXLogger } from 'ngx-logger'

import { HttpClient } from '@angular/common/http'
import { effect, inject, Injectable, signal } from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { Router } from '@angular/router'
import { API_PREFIX, AuthService } from '@metad/cloud/state'
import { NgmCopilotService } from '@metad/copilot-angular'
import { toParams } from '@metad/core'
import { pick } from '@metad/ocap-core'
import { environment } from 'apps/cloud/src/environments/environment'
import { omit } from 'lodash-es'
import {
  BehaviorSubject,
  combineLatest,
  distinctUntilChanged,
  filter,
  firstValueFrom,
  map,
  Observable,
  shareReplay,
  startWith,
  switchMap
} from 'rxjs'
import { API_COPILOT } from '../constants/app.constants'
import { ICopilotWithProvider, ICopilot as IServerCopilot, AiModelTypeEnum, ParameterRule, IAiProviderEntity, ICopilot, AiProviderRole } from '../types'


@Injectable({ providedIn: 'root' })
export class CopilotServerService extends OrganizationBaseCrudService<ICopilot> {
  readonly #logger = inject(NGXLogger)

  readonly refresh$ = new BehaviorSubject(false)

  private readonly modelsByType = new Map<AiModelTypeEnum, Observable<ICopilotWithProvider[]>>()
  private readonly aiProviders$ = this.httpClient.get<IAiProviderEntity[]>(API_COPILOT + `/providers`).pipe(shareReplay(1))

  private readonly copilots$ = this.refresh$.pipe(
    switchMap(() => this.selectOrganizationId()),
    switchMap(() => this.httpClient.get<{ total: number; items: ICopilot[] }>(API_COPILOT)),
    map(({items}) => items),
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