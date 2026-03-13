import { Injectable } from '@angular/core'
import { AgentEvent, AgentEventType, AuthenticationEnum } from '@metad/contracts'
import {
  Agent,
  AgentRequestOptions,
  AgentStatus,
  AgentStatusEnum,
  AgentType,
  DataSourceOptions,
  pick,
  UUID
} from '@metad/ocap-core'
import { TranslateService } from '@ngx-translate/core'
import { DataSourceService, UsersService } from '@metad/cloud/state'
import { BehaviorSubject, firstValueFrom, Observable, of, Subject, Subscription, throwError, timer } from 'rxjs'
import { filter, finalize, mergeMap, retryWhen, switchMap, tap, timeout } from 'rxjs/operators'
import { webSocket, WebSocketSubject } from 'rxjs/webSocket'
import { ZardSheetService } from '@xpert-ai/headless-ui'
import { uuid } from '../types'
import { AgentService } from './agent.service'
import { Store } from './store.service'
import { AbstractAgent } from '../auth'

@Injectable()
export class LocalAgent extends AbstractAgent implements Agent {
  type = AgentType.Local
  socket: WebSocketSubject<any>
  queuePool = new Map<UUID, { subject: Subject<any>; request: any }>()
  status$ = new BehaviorSubject<AgentStatus>({ status: AgentStatusEnum.OFFLINE })
  private error$ = new Subject()

  get _agentOfflineMessage() {
    let message
    this.translateService
      .get('PAC.MESSAGE.LocalAgentOffline', { Default: 'Local Agent Offline' })
      .subscribe((_message) => {
        message = _message
      })

    return message
  }

  private connectSubscription: Subscription
  // private _auth: Record<string, [string, Subject<any>]> = {}
  // get auth() {
  //   return this._auth
  // }
  // private _retryAuth: Record<string, boolean> = {}

  private _baseUrl: string
  constructor(
    private store: Store,
    private agentService: AgentService,
    private readonly usersService: UsersService,
    private translateService: TranslateService,
    dataSourceService: DataSourceService,
    _bottomSheet: ZardSheetService
  ) {
    super(dataSourceService, _bottomSheet)

    this.agentService.getTenantAgentLocal().subscribe((value) => {
      this._baseUrl = value ? value : 'ws://localhost:20215/agent/'
      this.connect()
    })
  }

  connect() {
    const token = this.store.token
    this.socket = webSocket(`${this._baseUrl}?token=${token}`)
    this.connectSubscription?.unsubscribe()
    this.connectSubscription = this.socket
      .pipe(
        retryWhen((attempts: Observable<any>) => {
          return attempts.pipe(
            tap((val) => {
              this.status$.next({ status: AgentStatusEnum.OFFLINE })
            }),
            mergeMap((error, i) => {
              const retryAttempt = i + 1
              // if maximum number of retries have been met
              // or response is a status code we don't wish to retry, throw error
              if (retryAttempt > 20) {
                return throwError(() => error)
              }
              console.log(`Attempt ${retryAttempt}: retrying in ${retryAttempt * 1000}ms`)
              // retry after 1s, 2s, etc...
              return timer(retryAttempt * 1000)
            }),
            finalize(() => console.log('Retry are done!'))
          )
        })
      )
      .subscribe({
        next: (result: AgentEvent) => {
          this.status$.next({ status: AgentStatusEnum.ONLINE })
          this.response(result)
        },
        error: (err) => {
          console.error(err)
          this.status$.next({ status: AgentStatusEnum.OFFLINE })
        }
      })
  }

  async refreshToken() {
    await this.usersService.getMe()
    this.connect()
  }

  selectStatus(): Observable<any> {
    return this.status$
  }

  selectError() {
    return this.error$
  }

  error(err: any): void {
    this.error$.next(err)
  }

  async request(semanticModel: any | DataSourceOptions, options: AgentRequestOptions): Promise<any> {
    return firstValueFrom(this._request(semanticModel, options))
  }

  _request(semanticModel: any | DataSourceOptions, options: AgentRequestOptions): Observable<any> {
    const req = new Subject()
    const organization = this.store.selectedOrganization
    // Request info
    const id = uuid()

    const request: AgentEvent = {
      id,
      event: AgentEventType.request,
      data: {
        organizationId: organization?.id,
        dataSource: {
          ...pick(semanticModel?.dataSource, 'id', 'name', 'updatedAt', 'authType'),
          // ???
          type: semanticModel?.type
        },
        // 判断数据源配置来源于 Semantic Model 还是 DataSource
        modelId: semanticModel?.id === semanticModel?.dataSource?.id ? null : semanticModel?.id,
        semanticModel: {
          ...pick(semanticModel, 'type', 'updatedAt')
        },
        request: {
          ...options
        }
      } as any
    }

    return of(id).pipe(
      switchMap(async () => {
        await firstValueFrom(
          this.status$.pipe(
            filter(({ status }) => status !== AgentStatusEnum.OFFLINE),
            timeout({ first: 1000, with: () => throwError(() => new Error(this._agentOfflineMessage)) })
          )
        )

        if (semanticModel?.dataSource?.authType === AuthenticationEnum.BASIC) {
          const auth = await this.authenticate(request)
          /**
           * 不是未创建的数据源授权信息 client 端传给 Agent， 而是 ping 的情况下将 auth 传过去（因为创建后在修改的 ping 也要）
           */
          if (auth && request.data.request.url === 'ping') {
            request.data.request.body = {
              ...(request.data.request.body ?? {}),
              authentications: [auth]
            }
          }
          // if (!dataSource?.dataSource?.id && auth) {
          //   request.data.request.body.authentications = [auth]
          // }
        }
    
        if (this.status$.value.status === AgentStatusEnum.OFFLINE) {
          const error = this._agentOfflineMessage
          req.error(error)
          this.error(error)
        } else {
          this.queuePool.set(id, { subject: req, request })
    
          this.send(request)
          this.updateStatus()
        }
      }),
      switchMap(() => req)
    )
  }

  private async response(result: AgentEvent) {
    // When connected event from webSocket
    if (result.type === 'connected') {
      this.updateStatus()
      return
    }

    // 不能识别的问题
    if (!result.id) {
      throw new Error(`Local agent internal exception`)
    }

    const req = this.queuePool.get(result.id)
    // websocket 错误类型当作服务器内部错误
    if (result.event === 'error') {
      req.request.retryCount ??= 0
      // 用户认证失败， 重试 5 次
      if (result.data.error?.includes('401') && req.request.retryCount < 5) {
        // Refresh access token
        await this.refreshToken()
        // Retry request
        const request = {
          ...req.request,
          id: uuid(),
          retryCount: 1 + req.request.retryCount
        }
        this.send(request)
        this.queuePool.set(request.id, { subject: req.subject, request })
      } else {
        // Return error message to consumer
        req.subject.error(result.data.error)
      }
    } else if (result.event === 'response') {
      if (result.data.response?.status === 401) {
        if (req.request.data.request.url === 'ping') {
          req?.subject.error(result.data.response.statusText)
        } else {
          this.retryAuthenticate(req.request).subscribe({
            next: (auth) => {
              req.request.data.semanticModel.updatedAt = auth.updatedAt
              this.send(req.request)
            },
            error: (err) => {
              req?.subject.error(err)
              this.queuePool.delete(result.id)
              this.updateStatus()
            }
          })
          return
        }
      } else if (result.data.response?.status === 404 || result.data.response?.status === 500) {
        req?.subject.error(result.data.response?.body || result.data.response.statusText)
      } else {
        // if (result.data.response.headers['content-type'][0] === 'application/json') {
        req?.subject.next(result.data.response.body)
        // } else {
        //   req?.next(result.data.response)
        // }
        req?.subject.complete()
      }
    }

    this.queuePool.delete(result.id)
    this.updateStatus()
  }

  private send(request: AgentEvent) {
    this.socket.next(request)
  }

  private updateStatus() {
    if (this.queuePool.size === 0) {
      this.status$.next({ status: AgentStatusEnum.ONLINE })
    } else {
      this.status$.next({ status: AgentStatusEnum.LOADING })
    }
  }

  getPingCallback(request: AgentEvent): (auth: any) => Promise<any> {
    return async (auth) => {
      return await this.pingAuthentication(request, auth)
    }
  }

  pingAuthentication(request: AgentEvent, auth: any) {
    const id = uuid()
    const subject = new Subject<any>()

    request = {
      ...request,
      data: {
        ...request.data,
        request: {
          ...request.data.request,
          url: 'ping',
          auth
        }
      },
      id
    }
    this.queuePool.set(id, { subject, request })

    this.send(request)

    return firstValueFrom(subject)
  }
}
