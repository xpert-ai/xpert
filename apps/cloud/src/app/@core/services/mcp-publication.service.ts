import { HttpClient, HttpParams } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import type {
  IMcpApiKey,
  IMcpCapabilityCatalog,
  IMcpCapabilitySourceSummary,
  IMcpInvocationAudit,
  IMcpOAuthPolicy,
  IMcpPublication,
  IMcpPublicationCapability,
  IMcpPublicationSummary,
  IPagination,
  McpAuthMethod,
  McpCapabilityPolicy,
  McpCapabilityType,
  McpOAuthSubjectMapping,
  McpPublicationStatus
} from '@xpert-ai/contracts'
import { API_MCP_API_KEYS, API_MCP_PUBLICATIONS } from '../constants/app.constants'

export interface CreateMcpPublicationInput {
  name: string
  slug: string
  authMethods?: McpAuthMethod[]
  instructions?: string | null
}

export interface UpdateMcpPublicationInput {
  name?: string
  authMethods?: McpAuthMethod[]
  instructions?: string | null
  status?: McpPublicationStatus
}

export interface McpCapabilityBindingInput {
  toolsetId: string
  capabilityType: McpCapabilityType
  capabilityKey: string
  publicName: string
  enabled?: boolean
  policy?: McpCapabilityPolicy | null
}

export interface CreateMcpApiKeyInput {
  name: string
  subjectType?: 'user' | 'service_account'
  subjectId?: string
  scopes?: string[]
  expiresAt?: string | null
}

export interface CreatedMcpApiKey {
  apiKey: Omit<IMcpApiKey, 'keyHash'>
  secret: string
}

export interface UpsertMcpOAuthPolicyInput {
  issuer: string
  audience: string
  requiredScopes?: string[]
  subjectMapping?: McpOAuthSubjectMapping
  introspection?: {
    enabled: boolean
    endpoint?: string | null
    clientId?: string | null
    clientSecret?: string | null
  }
  enabled?: boolean
}

export interface McpConnectionInfo {
  protocolVersion: string
  transport: 'streamable-http'
  endpoint: string
  authorization: 'Bearer'
  serverInstructions?: string | null
}

export interface McpPublicationTestResult {
  ready: boolean
  protocolVersion: string
  status: McpPublicationStatus
  reviewStatus: 'current' | 'required'
  enabledCapabilityCount: number
  capabilityCounts: Partial<Record<McpCapabilityType, number>>
  checks: Array<{ key: string; status: 'passed' | 'failed' | 'warning'; message: string }>
}

@Injectable({ providedIn: 'root' })
export class McpPublicationService {
  readonly #http = inject(HttpClient)

  create(input: CreateMcpPublicationInput) {
    return this.#http.post<IMcpPublication>(API_MCP_PUBLICATIONS, input)
  }

  list() {
    return this.#http.get<IMcpPublicationSummary[]>(API_MCP_PUBLICATIONS)
  }

  get(publicationId: string) {
    return this.#http.get<IMcpPublication & { capabilities?: IMcpPublicationCapability[] }>(
      `${API_MCP_PUBLICATIONS}/${encode(publicationId)}`
    )
  }

  update(publicationId: string, input: UpdateMcpPublicationInput) {
    return this.#http.patch<IMcpPublication>(`${API_MCP_PUBLICATIONS}/${encode(publicationId)}`, input)
  }

  disable(publicationId: string) {
    return this.#http.post<IMcpPublication>(`${API_MCP_PUBLICATIONS}/${encode(publicationId)}/disable`, {})
  }

  enable(publicationId: string) {
    return this.#http.post<IMcpPublication>(`${API_MCP_PUBLICATIONS}/${encode(publicationId)}/enable`, {})
  }

  availableCapabilities(publicationId: string, toolsetId?: string) {
    return this.#http.get<IMcpCapabilityCatalog[]>(
      `${API_MCP_PUBLICATIONS}/${encode(publicationId)}/available-capabilities`,
      { params: toolsetId ? new HttpParams().set('toolsetId', toolsetId) : undefined }
    )
  }

  availableCapabilitySources(publicationId: string) {
    return this.#http.get<IMcpCapabilitySourceSummary[]>(
      `${API_MCP_PUBLICATIONS}/${encode(publicationId)}/available-capability-sources`
    )
  }

  replaceCapabilities(publicationId: string, input: McpCapabilityBindingInput[]) {
    return this.#http.put<IMcpPublicationCapability[]>(
      `${API_MCP_PUBLICATIONS}/${encode(publicationId)}/capabilities`,
      input
    )
  }

  patchCapability(publicationId: string, capabilityId: string, input: Partial<McpCapabilityBindingInput>) {
    return this.#http.patch<IMcpPublicationCapability>(
      `${API_MCP_PUBLICATIONS}/${encode(publicationId)}/capabilities/${encode(capabilityId)}`,
      input
    )
  }

  createApiKey(publicationId: string, input: CreateMcpApiKeyInput) {
    return this.#http.post<CreatedMcpApiKey>(`${API_MCP_PUBLICATIONS}/${encode(publicationId)}/api-keys`, input)
  }

  listApiKeys(publicationId: string) {
    return this.#http.get<Array<Omit<IMcpApiKey, 'keyHash'>>>(
      `${API_MCP_PUBLICATIONS}/${encode(publicationId)}/api-keys`
    )
  }

  revokeApiKey(keyId: string) {
    return this.#http.post<Omit<IMcpApiKey, 'keyHash'>>(`${API_MCP_API_KEYS}/${encode(keyId)}/revoke`, {})
  }

  rotateApiKey(keyId: string) {
    return this.#http.post<CreatedMcpApiKey>(`${API_MCP_API_KEYS}/${encode(keyId)}/rotate`, {})
  }

  getOAuthPolicy(publicationId: string) {
    return this.#http.get<IMcpOAuthPolicy | null>(`${API_MCP_PUBLICATIONS}/${encode(publicationId)}/oauth-policy`)
  }

  upsertOAuthPolicy(publicationId: string, input: UpsertMcpOAuthPolicyInput) {
    return this.#http.put<IMcpOAuthPolicy>(`${API_MCP_PUBLICATIONS}/${encode(publicationId)}/oauth-policy`, input)
  }

  testOAuthPolicy(publicationId: string) {
    return this.#http.post<{
      issuer: string
      authorizationEndpoint?: string
      tokenEndpoint?: string
      introspectionEndpoint?: string
      introspectionEnabled: boolean
      introspectionClientSecretConfigured: boolean
      jwksUri: string
      scopesSupported: string[]
    }>(`${API_MCP_PUBLICATIONS}/${encode(publicationId)}/oauth-policy/test`, {})
  }

  audit(publicationId: string, options: { skip?: number; take?: number } = {}) {
    const { skip = 0, take = 10 } = options
    return this.#http.get<IPagination<IMcpInvocationAudit>>(`${API_MCP_PUBLICATIONS}/${encode(publicationId)}/audit`, {
      params: new HttpParams().set('skip', skip).set('take', take)
    })
  }

  test(publicationId: string) {
    return this.#http.post<McpPublicationTestResult>(`${API_MCP_PUBLICATIONS}/${encode(publicationId)}/test`, {})
  }

  connectionInfo(publicationId: string) {
    return this.#http.get<McpConnectionInfo>(`${API_MCP_PUBLICATIONS}/${encode(publicationId)}/connection-info`)
  }
}

function encode(value: string) {
  return encodeURIComponent(value)
}
