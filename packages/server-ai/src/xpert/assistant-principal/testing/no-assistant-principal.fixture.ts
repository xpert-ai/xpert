/** Human-only fixtures; Assistant behavior is covered by principal boundary tests. */
export const noAssistantPrincipal = { isPrincipal: async () => false, find: async () => null }
