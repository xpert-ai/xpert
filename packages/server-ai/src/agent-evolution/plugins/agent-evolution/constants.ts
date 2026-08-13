import { AIPermissionsEnum } from '@xpert-ai/contracts'

export const AGENT_EVOLUTION_PROVIDER_KEY = 'agent_evolution'
export const AGENT_EVOLUTION_FEATURE = 'agent_evolution'
export const AGENT_EVOLUTION_VIEW_KEY = 'agent_evolution_center'
export const AGENT_EVOLUTION_REMOTE_ENTRY_KEY = 'agent-evolution'
export const AGENT_EVOLUTION_OPEN_TOOL = 'agent_evolution_open_center'
export const AGENT_EVOLUTION_STATUS_TOOL = 'agent_evolution_get_status'
export const AGENT_EVOLUTION_TOOL_NAMES = [AGENT_EVOLUTION_OPEN_TOOL, AGENT_EVOLUTION_STATUS_TOOL]
export const AGENT_WORKBENCH_MAIN_SLOT = 'agent.workbench.main'
export const AGENT_WORKBENCH_FIXED_SLOT = 'agent.workbench.fixed'

export const AGENT_EVOLUTION_VIEW_PERMISSIONS = [AIPermissionsEnum.EVOLUTION_VIEW]
export const AGENT_EVOLUTION_MANAGE_PERMISSIONS = [AIPermissionsEnum.EVOLUTION_MANAGE]

export const AGENT_EVOLUTION_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img"><rect x="24" y="24" width="208" height="208" rx="40" fill="#E8EEFF"/><path d="M128 56v40M128 160v40M56 128h40M160 128h40" stroke="#315EFB" stroke-width="15" stroke-linecap="round"/><path d="M94 104c12-22 56-22 68 0 10 18-2 30-16 40-9 7-13 13-13 24h-10c0-11-4-17-13-24-14-10-26-22-16-40Z" fill="#315EFB"/><circle cx="128" cy="119" r="14" fill="#FFFFFF"/></svg>`
