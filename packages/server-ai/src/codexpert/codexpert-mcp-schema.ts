import { XpertToolsetCategoryEnum } from '@xpert-ai/contracts'

const CODEXPERT_CONTEXT_SERVER_NAME = 'codexpert-context'

export function requiresCodexpertPrincipal(toolset: {
  category?: XpertToolsetCategoryEnum | string | null
  schema?: string | null
}): boolean {
  if (toolset.category !== XpertToolsetCategoryEnum.MCP || !toolset.schema) {
    return false
  }

  try {
    const schema = JSON.parse(toolset.schema)
    const servers = schema?.servers ?? schema?.mcpServers
    return Boolean(servers && typeof servers === 'object' && servers[CODEXPERT_CONTEXT_SERVER_NAME])
  } catch {
    return false
  }
}
