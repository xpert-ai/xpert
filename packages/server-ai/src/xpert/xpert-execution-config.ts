import { normalizeXpertAgentConfig } from '@xpert-ai/contracts'
import type { DeepPartial } from 'typeorm'
import type { Xpert } from './xpert.entity'

/** Strip unsupported execution settings from both persisted and imported draft configurations. */
export function normalizeXpertExecutionConfig<T extends DeepPartial<Xpert>>(entity: T) {
    return {
        ...entity,
        agentConfig: normalizeXpertAgentConfig(entity.agentConfig),
        ...(entity.draft?.team
            ? {
                  draft: {
                      ...entity.draft,
                      team: {
                          ...entity.draft.team,
                          agentConfig: normalizeXpertAgentConfig(entity.draft.team.agentConfig)
                      }
                  }
              }
            : {})
    }
}
