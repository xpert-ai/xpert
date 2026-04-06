import { AIPermissionsEnum, XpertViewSlot } from '@metad/contracts'
import { ViewHostDefinition, XpertViewHostDefinition } from '@metad/server-core'
import { Injectable } from '@nestjs/common'
import { RequestContext } from '@metad/server-core'
import { KnowledgebaseService } from '../../knowledgebase/knowledgebase.service'

@Injectable()
@ViewHostDefinition('knowledgebase')
export class KnowledgebaseViewHostDefinition implements XpertViewHostDefinition {
  readonly hostType = 'knowledgebase'
  readonly slots: XpertViewSlot[] = [{ key: 'detail.main_tabs', mode: 'tabs', order: 0 }]

  constructor(private readonly knowledgebaseService: KnowledgebaseService) {}

  async resolve(hostId: string) {
    const knowledgebase = await this.knowledgebaseService.findOne(hostId)

    return {
      workspaceId: knowledgebase.workspaceId ?? null,
      hostSnapshot: {
        id: knowledgebase.id,
        name: knowledgebase.name,
        type: knowledgebase.type,
        status: knowledgebase.status ?? null,
        documentNum: knowledgebase.documentNum ?? 0,
        tokenNum: knowledgebase.tokenNum ?? 0,
        chunkNum: knowledgebase.chunkNum ?? 0,
        workspaceId: knowledgebase.workspaceId ?? null,
        pipelineId: knowledgebase.pipelineId ?? null
      }
    }
  }

  canRead() {
    return RequestContext.hasPermission(AIPermissionsEnum.KNOWLEDGEBASE_EDIT, false)
  }
}
