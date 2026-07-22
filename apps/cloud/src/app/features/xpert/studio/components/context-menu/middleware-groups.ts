import { isUserAddableAgentMiddleware, TAgentMiddlewareDescriptor, TAgentMiddlewareSource } from '@xpert-ai/contracts'

export type TAgentMiddlewareGroup = {
  key: string
  source: TAgentMiddlewareSource
  middlewares: TAgentMiddlewareDescriptor[]
}

export function groupAgentMiddlewares(
  middlewares: TAgentMiddlewareDescriptor[] | null | undefined,
  searchTerm: string | null | undefined,
  localize: (value: unknown) => string
): TAgentMiddlewareGroup[] {
  const term = searchTerm?.toLowerCase().trim() ?? ''
  const groups = new Map<string, TAgentMiddlewareGroup>()

  for (const middleware of middlewares ?? []) {
    if (!isUserAddableAgentMiddleware(middleware.meta) || !matchesSearch(middleware, term, localize)) {
      continue
    }

    const key = middleware.source.kind === 'builtin' ? 'builtin' : `plugin:${middleware.source.pluginName}`
    const group = groups.get(key) ?? {
      key,
      source: middleware.source,
      middlewares: []
    }
    group.middlewares.push(middleware)
    groups.set(key, group)
  }

  const builtin = groups.get('builtin')
  return [...(builtin ? [builtin] : []), ...Array.from(groups.values()).filter((group) => group.key !== 'builtin')]
}

function matchesSearch(middleware: TAgentMiddlewareDescriptor, term: string, localize: (value: unknown) => string) {
  if (!term) {
    return true
  }

  const sourceTerms =
    middleware.source.kind === 'plugin' ? [middleware.source.pluginName, localize(middleware.source.displayName)] : []

  return [
    middleware.meta.name,
    localize(middleware.meta.label),
    localize(middleware.meta.description),
    ...sourceTerms
  ].some((value) => value.toLowerCase().includes(term))
}
