import { inject, Injectable, Signal } from '@angular/core'
import { NGXLogger } from 'ngx-logger'
import { derivedAsync } from 'ngxtension/derived-async'
import { BehaviorSubject, catchError, map, of, shareReplay, startWith } from 'rxjs'
import { API_XPERT_TOOLSET } from '../constants/app.constants'
import {
  ApiProviderSchemaType,
  ApiToolBundle,
  getErrorMessage,
  IBuiltinTool,
  IToolProvider,
  IToolTag,
  IXpertTool,
  IXpertToolset,
  OrderTypeEnum,
  ToolProviderCredentials,
  TToolCredentials,
  TXpertToolEntity
} from '../types'
import { XpertWorkspaceBaseCrudService } from './xpert-workspace.service'

@Injectable({ providedIn: 'root' })
export class XpertToolsetService extends XpertWorkspaceBaseCrudService<IXpertToolset> {
  readonly #logger = inject(NGXLogger)

  readonly #refresh = new BehaviorSubject<void>(null)

  readonly builtinToolProviders$ = this.getProviders().pipe(
    shareReplay(1),
  )

  constructor() {
    super(API_XPERT_TOOLSET)
  }

  parserOpenAPISchema(schema: string) {
    return this.httpClient.post<{
      schema_type: ApiProviderSchemaType
      parameters_schema: ApiToolBundle[]
      credentials_schema: ToolProviderCredentials
      warning: any
    }>(this.apiBaseUrl + `/provider/openapi/schema`, {
      schema
    })
  }

  testOpenAPI(tool: IXpertTool) {
    return this.httpClient.post(this.apiBaseUrl + '/provider/openapi/test', {
      ...tool
    })
  }

  getAllTags() {
    return this.httpClient.get<IToolTag[]>(this.apiBaseUrl + `/tags`)
  }

  getProviders() {
    return this.httpClient.get<IToolProvider[]>(this.apiBaseUrl + `/providers`)
  }

  getProvider(name: string) {
    return this.httpClient.get<IToolProvider>(this.apiBaseUrl + `/provider/` + name)
  }

  getBuiltinTools(provider: string) {
    return this.httpClient.get<IBuiltinTool[]>(this.apiBaseUrl + `/builtin-provider/${provider}/tools`)
  }

  getBuiltinCredentialsSchema(provider: string) {
    return this.httpClient.get<ToolProviderCredentials[]>(
      this.apiBaseUrl + `/builtin-provider/${provider}/credentials-schema`
    )
  }

  createBuiltinToolsetInstance(provider: string, entity: Partial<IXpertToolset>) {
    return this.httpClient.post<IXpertToolset>(this.apiBaseUrl + `/builtin-provider/${provider}/instance`, entity)
  }

  getBuiltinToolInstances(workspaceId: string, provider: string) {
    return this.getAllByWorkspace(workspaceId, { where: { type: provider }, order: { updatedAt: OrderTypeEnum.DESC } })
  }

  getOpenAPIRemoteSchema(url: string, credentials: Record<string, string>) {
    return this.httpClient.post<{ schema: string; tools: TXpertToolEntity[] }>(
      this.apiBaseUrl + `/provider/openapi/remote`,
      {
        url,
        credentials
      }
    )
  }

  getODataRemoteMetadata(url: string, credentials: Record<string, string>) {
    return this.httpClient.post<{ schema: string; tools: TXpertToolEntity[] }>(
      this.apiBaseUrl + `/provider/odata/remote`,
      {
        url,
        credentials
      }
    )
  }

  parserODataSchema(schema: string) {
    return this.httpClient.post<{
      tools: TXpertToolEntity[]
    }>(this.apiBaseUrl + `/provider/odata/schema`, {
      schema
    })
  }

  getMCPToolsBySchema(toolset: Partial<IXpertToolset>) {
    return this.httpClient.post<{ schema: string; tools: TXpertToolEntity[] }>(
      this.apiBaseUrl + `/provider/mcp/tools`,
      toolset
    )
  }

  getToolsetTools(id: string) {
    return this.httpClient.get<IXpertTool[]>(this.apiBaseUrl + `/${id}/tools`)
  }

  getCredentials(id: string) {
    return this.httpClient.get<TToolCredentials>(this.apiBaseUrl + `/${id}/credentials`)
  }
}

export function derivedToolProvider(providerName: Signal<string>) {
  const toolsetService = inject(XpertToolsetService)

  return derivedAsync<{ error?: string; loading: boolean; provider: IToolProvider }>(() =>
    providerName()
      ? toolsetService.getProvider(providerName()).pipe(
          map((provider) => ({ provider, loading: false })),
          catchError((err) => {
            return of({
              error: getErrorMessage(err),
              loading: false,
              provider: null
            })
          }),
          startWith({
            loading: true,
            provider: null
          })
        )
      : of(null)
  )
}
