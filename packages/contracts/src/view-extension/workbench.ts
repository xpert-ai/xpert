/** Assistant Workbench slot; openMode controls initial tab opening separately. */
export const AGENT_WORKBENCH_SLOT = 'agent.workbench'

/** Legacy plugin declarations and client requests; normalized to AGENT_WORKBENCH_SLOT by the host. */
export const LEGACY_AGENT_WORKBENCH_SLOTS = ['agent.workbench.fixed', 'agent.workbench.main'] as const

/** Platform-provided navigation, available without Assistant middleware. */
export const CONVERSATION_MAP_FEATURE = 'platform.conversation-map'
