import { HttpClient, HttpParams } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import { API_MCP_RUNTIMES } from '../constants/app.constants'

export type McpRuntimeStatus = 'starting' | 'running' | 'closing' | 'closed' | 'failed'
export type McpRuntimeOrigin = 'agent-toolset' | 'mcp-app-host'

export type McpRuntimeListFilter = {
  organizationId?: string
  workspaceId?: string
  toolsetId?: string
  pluginName?: string
  status?: McpRuntimeStatus | 'active' | 'all'
  activeOnly?: boolean
  executionId?: string
  appInstanceId?: string
  from?: string
  to?: string
  limit?: number
  offset?: number
}

export type McpStdioRuntimeSnapshot = {
  id: string
  live?: boolean
  status: McpRuntimeStatus
  origin?: McpRuntimeOrigin
  tenantId?: string
  organizationId?: string
  workspaceId?: string
  toolsetId?: string
  toolsetName?: string
  serverName: string
  pluginManaged: boolean
  pluginName?: string
  componentKey?: string
  pluginRuntimeId?: string
  resourceInstallationId?: string
  xpertId?: string
  agentKey?: string
  executionId?: string
  conversationId?: string
  appInstanceId?: string
  command: string
  commandLabel?: string
  commandHash?: string
  policySnapshot?: Record<string, unknown>
  runnerPid?: number
  childPid?: number
  startedAt: string
  idleExpiresAt?: string
  maxLifetimeExpiresAt?: string
  readyAt?: string
  closedAt?: string
  closeReason?: string
  startupDurationMs?: number
  durationMs?: number
  stderrTail?: string
}

export type McpRuntimeFilterOption = {
  value: string
  label: string
}

export type McpRuntimeListOptions = {
  workspaces: McpRuntimeFilterOption[]
  toolsets: McpRuntimeFilterOption[]
  plugins: McpRuntimeFilterOption[]
  executions: McpRuntimeFilterOption[]
  appInstances: McpRuntimeFilterOption[]
}

export type McpRuntimeListResponse = {
  items: McpStdioRuntimeSnapshot[]
  total?: number
  limit?: number
  offset?: number
  options?: McpRuntimeListOptions
}

@Injectable({ providedIn: 'root' })
export class McpRuntimeService {
  readonly #http = inject(HttpClient)

  list(filter: McpRuntimeListFilter = {}) {
    let params = new HttpParams()
    for (const [key, value] of Object.entries(filter)) {
      const trimmed = typeof value === 'undefined' || value === null ? '' : String(value).trim()
      if (trimmed) {
        params = params.set(key, trimmed)
      }
    }
    return this.#http.get<McpRuntimeListResponse>(API_MCP_RUNTIMES, { params })
  }

  stop(runtimeId: string) {
    return this.#http.post<{ stopped: boolean }>(`${API_MCP_RUNTIMES}/${encodeURIComponent(runtimeId)}/stop`, {})
  }

  kill(filter: McpRuntimeListFilter = {}) {
    return this.#http.post<{ stopped: number }>(`${API_MCP_RUNTIMES}/kill`, filter)
  }
}
