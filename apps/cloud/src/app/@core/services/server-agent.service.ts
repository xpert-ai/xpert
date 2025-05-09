import { HttpClient, HttpParams, HttpRequest, HttpResponse } from '@angular/common/http'
import { Inject, Injectable, InjectionToken } from '@angular/core'
import { MatBottomSheet } from '@angular/material/bottom-sheet'
import { AgentEvent, AuthenticationEnum, IDataSource, IDataSourceAuthentication, ISemanticModel } from '@metad/contracts'
import { Agent, AgentStatus, AgentType, DataSourceOptions, UUID } from '@metad/ocap-core'
import { API_DATA_SOURCE, C_URI_API_MODELS, DataSourceService } from '@metad/cloud/state'
import { chunk, flatten, groupBy } from 'lodash-es'
import {
  bufferTime,
  catchError,
  EMPTY,
  filter,
  firstValueFrom,
  from,
  mergeMap,
  Observable,
  of,
  Subject,
} from 'rxjs'
import { getErrorMessage, uuid } from '../types'
import { AbstractAgent, AuthInfoType } from '../auth'

/**
 * @deprecated use PAC_SERVER_DEFAULT_OPTIONS
 */
export interface PacServerAgentDefaultOptions {
  modelBaseUrl: string
}

/**
 * @deprecated use PAC_SERVER_DEFAULT_OPTIONS
 */
export const PAC_SERVER_AGENT_DEFAULT_OPTIONS = new InjectionToken<PacServerAgentDefaultOptions>(
  'pac-server-agent-default-options',
  {
    providedIn: 'root',
    factory: PAC_SERVER_AGENT_DEFAULT_OPTIONS_FACTORY,
  },
);

/** @docs-private */
export function PAC_SERVER_AGENT_DEFAULT_OPTIONS_FACTORY(): PacServerAgentDefaultOptions {
  return {modelBaseUrl: C_URI_API_MODELS};
}

/**
 * @deprecated Only for http request, others to use {@link ServerSocketAgent} instead
 */
@Injectable()
export class ServerAgent extends AbstractAgent implements Agent {
  
  type = AgentType.Server

  private error$ = new Subject()
  readonly queuePool = new Map<UUID, { resolve: (value) => void; reject: (reason?: any) => void }>()
  readonly request$ = new Subject<{ id: UUID; url: string; request: any; forceRefresh: boolean }>()
  batchSize = 10


  constructor(
    @Inject(PAC_SERVER_AGENT_DEFAULT_OPTIONS)
    private options: PacServerAgentDefaultOptions,
    private httpClient: HttpClient,
    dataSourceService: DataSourceService,
    _bottomSheet: MatBottomSheet) {
    super(dataSourceService, _bottomSheet)

    this.request$
      .pipe(
        bufferTime(200),
        mergeMap((requests) => {
          const gRequests = groupBy(requests, 'url')
          return from(
            flatten(
              Object.keys(gRequests).map((url) =>
                chunk(gRequests[url], this.batchSize).map((items) => {
                  return new HttpRequest(
                    gRequests[url][0].request.method,
                    url,
                    {
                      query: items.map(({ id, request, forceRefresh }: any) => ({
                        id: id,
                        body: request.body,
                        forceRefresh
                      }))
                    },
                    { responseType: 'json' }
                  )

                  // url,
                  // method: 'POST',
                  // Accept: 'application/json',
                  // 'Content-Type': 'application/json',
                  // data: items.map((item: any) => ({
                  //     ID: item.id,
                  //     REQUEST: item.data
                  // }))
                })
              )
            )
          ).pipe(
            mergeMap((request: HttpRequest<{query: { id: string, body: string, forceRefresh: boolean }[]}>) => {
              return this.httpClient.request(request).pipe(
                filter(({ type }) => type === 4),
                catchError((err) => {
                  const items = request.body.query
                  items.forEach((item) => {
                    const { reject } = this.queuePool.get(item.id)
                    reject({
                      status: err.status,
                      error: err.statusText
                    })
                    this.queuePool.delete(item.id)
                  })
                  return EMPTY
                })
              )
            })
          )
        })
      )
      .subscribe((response) => {
        if (response instanceof HttpResponse) {
          const results: any[] = response.body as any[]
          results.forEach((item) => {
            const { resolve, reject } = this.queuePool.get(item.id)
            this.queuePool.delete(item.id)
            if (item.status === 500) {
              reject({
                status: item.status,
                error: item.statusText
              })
            } else if (item.data) {
              resolve(item.data)
            } else {
              reject({
                status: item.status,
                error: item.statusText
              })
            }
          })
        }
      })
  }

  selectStatus(): Observable<AgentStatus> {
    throw new Error('Method not implemented.')
  }

  selectError() {
    return this.error$
  }

  error(err: any): void {
    this.error$.next(err)
  }

  _request?(semanticModel: ISemanticModel & DataSourceOptions, options: any): Observable<any> {
    return from(this.request(semanticModel, options))
  }

  async request(semanticModel: ISemanticModel & DataSourceOptions, options: any): Promise<any> {
    options.headers = options.headers || {}
    const modelId = semanticModel.id
    const id = uuid()

    let url = ''
    let method = 'GET'
    let params = new HttpParams()
    let body = options.body

    // Require auth info if authType is Basic
    if (semanticModel?.dataSource?.authType === AuthenticationEnum.BASIC) {
      const auth = await this.authenticate({data: {
        dataSource: semanticModel?.dataSource,
        request: {
          url,
          body
        }
      }} as any)

      if (!semanticModel?.dataSource?.id && auth) {
        body.authentications = [auth]
      }
    }

    if (options.url === 'ping') {
      url = semanticModel.dataSource?.id ? `${API_DATA_SOURCE}/${semanticModel.dataSource.id}/ping` : `${API_DATA_SOURCE}/ping`
      method = 'POST'

      try {
        return await firstValueFrom(this.httpClient.post(url, body, {params}))
      } catch(err) {
        const message = getErrorMessage(err)
        this.error$.next(message)
        throw new Error(message)
      }
    } else {
      if (semanticModel.type === 'XMLA') {
        // throw new Error('Use {@link ServerSocketAgent} instead of {@link ServerAgent} for XMLA')
        /**
         * @todo 使用更好的办法判断 (用类型判断?)
         */
        url =
          (<ISemanticModel>semanticModel).dataSourceId ? `${this.options.modelBaseUrl}/${modelId}/olap`
            : `${API_DATA_SOURCE}/${semanticModel.dataSource?.id}/olap`
        method = 'POST'

        return new Promise((resolve, reject) => {
          this.queuePool.set(id, { resolve, reject })
          this.request$.next({
            url,
            id,
            request: {
              method,
              url,
              body,
              params
            },
            forceRefresh: options.forceRefresh
          })
        })
      } else if (semanticModel.type === 'SQL') {
        url = `${API_DATA_SOURCE}/${semanticModel.dataSource?.id}`
        switch (options.url) {
          case 'schema': {
            if (options.catalog) {
              params = params.set('catalog', options.catalog)
            }
            if (options.table) {
              params = params.set('table', options.table)
            }
            if (options.statement) {
              params = params.set('statement', options.statement)
            }
            url = `${url}/schema`
            break
          }
          case 'catalogs': {
            url = `${url}/catalogs`
            break
          }
          case 'query': {
            url = `${this.options.modelBaseUrl}/${modelId}/query`
            method = 'POST'
            body = { id, query: options.body }
            break
          }
          case 'import': {
            url = `${this.options.modelBaseUrl}/${modelId}/import`
            method = 'POST'
            body = options.body
            break
          }
          case 'drop': {
            url = `${this.options.modelBaseUrl}/${modelId}/table/${options.body.name}`
            method = 'DELETE'
            body = null
            break
          }
          // case 'ping': {
          //   url = semanticModel.dataSource?.id ? `${API_DATA_SOURCE}/${semanticModel.dataSource.id}/ping` : `${API_DATA_SOURCE}/ping`
          //   method = 'POST'
          //   break
          // }
        }

        try {
          return await firstValueFrom(this.httpClient.request(method, url, {
            body,
            params
          }))
        } catch(err) {
          const message = getErrorMessage(err)
          this.error$.next(message)
          throw new Error(message)
        }
      }
    }

    return Promise.reject(`未找到相应 Agent 响应方法`)
  }

  getPingCallback(request: any, dataSource?: IDataSource) {
    return async (auth: AuthInfoType) => {
      dataSource = {
        ...dataSource,
        authentications: [
          {
            ...auth as IDataSourceAuthentication,
          }
        ]
      }
      return await firstValueFrom(
        dataSource.id ? 
        this.dataSourceService.ping(dataSource.id, dataSource) :
        this.dataSourceService.ping(dataSource)
      )
    }
  }
}
