import { DialogRef } from '@angular/cdk/dialog'
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import {
  IXpertToolset,
  MCPServerType,
  TMCPServer,
  XpertToolsetCategoryEnum
} from '@cloud/app/@core'

type JsonObject = {
  [key: string]: unknown
}

type StringMap = {
  [key: string]: string
}

type MCPServerJsonMap = {
  [name: string]: JsonObject
}

type MCPServerEntry = {
  name: string
  server: JsonObject
}

const sampleMCPJson = `{
  "mcpServers": {
    "edgeone-pages-mcp-server": {
      "command": "npx",
      "args": [
        "edgeone-pages-mcp"
      ]
    }
  }
}`

export function createMCPToolsetFromJson(source: string): Partial<IXpertToolset> {
  const parsed: unknown = JSON.parse(source)
  const entry = readFirstMCPServer(parsed)
  const server = normalizeMCPServer(entry.server)

  return {
    name: entry.name || 'MCP Toolset',
    category: XpertToolsetCategoryEnum.MCP,
    type: server.type,
    schema: JSON.stringify({
      mcpServers: {
        '': server
      }
    })
  }
}

@Component({
  standalone: true,
  selector: 'pac-mcp-import-json',
  imports: [FormsModule, TranslateModule],
  templateUrl: './import-json.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MCPImportJsonComponent {
  readonly #dialogRef = inject(DialogRef<Partial<IXpertToolset> | undefined>)

  readonly value = signal(sampleMCPJson)
  readonly error = signal<string>(null)

  updateValue(value: string) {
    this.value.set(value)
    this.error.set(null)
  }

  importJson() {
    try {
      this.#dialogRef.close(createMCPToolsetFromJson(this.value()))
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Invalid MCP JSON')
    }
  }

  close() {
    this.#dialogRef.close()
  }
}

function readFirstMCPServer(value: unknown): MCPServerEntry {
  if (!isJsonObject(value)) {
    throw new Error('MCP JSON must be an object')
  }

  const servers = readServerMap(value.mcpServers) ?? readServerMap(value.servers)
  if (!servers) {
    throw new Error('MCP JSON must include mcpServers or servers')
  }

  const serverName = Object.keys(servers)[0]
  if (!serverName) {
    throw new Error('MCP JSON must include at least one server')
  }

  return {
    name: serverName,
    server: servers[serverName]
  }
}

function normalizeMCPServer(value: JsonObject): TMCPServer {
  const type = readMCPServerType(value.type) ?? readMCPServerType(value.transport) ?? inferMCPServerType(value)
  if (!type) {
    throw new Error('MCP server must include command or url')
  }

  const server: TMCPServer = { type }

  const command = readString(value.command)
  if (command) {
    server.command = command
  }
  const args = readStringArray(value.args)
  if (args) {
    server.args = args
  }
  const env = readStringMap(value.env)
  if (env) {
    server.env = env
  }
  const encoding = readString(value.encoding)
  if (encoding) {
    server.encoding = encoding
  }
  const encodingErrorHandler = readString(value.encodingErrorHandler)
  if (encodingErrorHandler) {
    server.encodingErrorHandler = encodingErrorHandler
  }
  const url = readString(value.url)
  if (url) {
    server.url = url
  }
  const headers = readStringMap(value.headers)
  if (headers) {
    server.headers = headers
  }
  const useNodeEventSource = readBoolean(value.useNodeEventSource)
  if (useNodeEventSource !== null) {
    server.useNodeEventSource = useNodeEventSource
  }
  const automaticSSEFallback = readBoolean(value.automaticSSEFallback)
  if (automaticSSEFallback !== null) {
    server.automaticSSEFallback = automaticSSEFallback
  }
  const defaultToolTimeout = readPositiveNumber(value.defaultToolTimeout)
  if (defaultToolTimeout) {
    server.defaultToolTimeout = defaultToolTimeout
  }
  copyFiles(value, server)
  const toolNamePrefix = readString(value.toolNamePrefix)
  if (toolNamePrefix) {
    server.toolNamePrefix = toolNamePrefix
  }
  const initScripts = readString(value.initScripts)
  if (initScripts) {
    server.initScripts = initScripts
  }
  copyReconnect(value, server)

  return server
}

function readServerMap(value: unknown): MCPServerJsonMap | null {
  if (!isJsonObject(value)) {
    return null
  }

  const servers: MCPServerJsonMap = {}
  for (const name of Object.keys(value)) {
    const server = value[name]
    if (!isJsonObject(server)) {
      continue
    }
    servers[name] = server
  }

  return Object.keys(servers).length ? servers : null
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readMCPServerType(value: unknown): MCPServerType | null {
  if (value === MCPServerType.SSE || value === MCPServerType.HTTP || value === MCPServerType.STDIO || value === MCPServerType.CODE) {
    return value
  }
  return null
}

function inferMCPServerType(value: JsonObject): MCPServerType | null {
  if (typeof value.command === 'string') {
    return MCPServerType.STDIO
  }
  if (typeof value.url === 'string') {
    return MCPServerType.SSE
  }
  return null
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function readStringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : null
}

function readStringMap(value: unknown): StringMap | null {
  if (!isJsonObject(value)) {
    return null
  }

  const result: StringMap = {}
  for (const name of Object.keys(value)) {
    const item = value[name]
    if (typeof item === 'string') {
      result[name] = item
    }
  }

  return Object.keys(result).length ? result : null
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function readPositiveNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function copyFiles(source: JsonObject, target: TMCPServer) {
  const value = source.files
  if (!Array.isArray(value)) {
    return
  }

  const files = value.flatMap((file) =>
    isJsonObject(file) && typeof file.name === 'string' && typeof file.content === 'string'
      ? [{ name: file.name, content: file.content }]
      : []
  )

  if (files.length) {
    target.files = files
  }
}

function copyReconnect(source: JsonObject, target: TMCPServer) {
  const value = source.reconnect
  if (!isJsonObject(value)) {
    return
  }

  const reconnect: NonNullable<TMCPServer['reconnect']> = {}
  if (typeof value.enabled === 'boolean') {
    reconnect.enabled = value.enabled
  }
  if (typeof value.maxAttempts === 'number' && Number.isFinite(value.maxAttempts)) {
    reconnect.maxAttempts = value.maxAttempts
  }
  if (typeof value.delayMs === 'number' && Number.isFinite(value.delayMs)) {
    reconnect.delayMs = value.delayMs
  }

  if (Object.keys(reconnect).length) {
    target.reconnect = reconnect
  }
}
