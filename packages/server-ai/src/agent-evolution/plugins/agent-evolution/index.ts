export * from './constants'
export * from './agent-evolution-app.service'
export * from './agent-evolution.middleware'
export * from './agent-evolution-view.provider'

import { AgentEvolutionAppService } from './agent-evolution-app.service'
import { AgentEvolutionMiddleware } from './agent-evolution.middleware'
import { AgentEvolutionViewProvider } from './agent-evolution-view.provider'

export const AgentEvolutionProviders = [AgentEvolutionAppService, AgentEvolutionMiddleware, AgentEvolutionViewProvider]
