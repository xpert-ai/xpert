export const FILE_MEMORY_PROVIDER_NAME = 'file-memory'
export const MEMORY_REGISTRY_TOKEN = 'xpert.memory.registry'
export const MEMORY_PATH_RESOLVER_TOKEN = 'xpert.memory.paths'

export type MemoryRegistryLike = {
  register(name: string, provider: unknown): void
  unregister(name: string): void
}

export type MemoryPathResolverLike = {
  getSandboxRootPath(tenantId?: string): string
  getWorkspaceRootPath(tenantId: string, workspaceId: string): string
  getHostedRootPath(tenantId: string): string
}
