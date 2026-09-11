import { KnowledgeQuestionsEnqueueCommand } from './questions/question-generation.command'
import { IKnowledgebase } from '@xpert-ai/contracts'
import { getErrorMessage } from '@xpert-ai/server-common'
import { Injectable, Logger } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { KnowledgeGraphEnqueueCommand, KnowledgeGraphRetryDocumentCommand } from '../graphrag/commands'
import { KnowledgeWikiEnqueueSourceCommand } from '../knowledgebase/wiki/commands'

export type KnowledgeDocumentPublication = {
    knowledgebase: IKnowledgebase
    documentId: string
    userId: string
    contentChanged: boolean
}

/** Dispatches optional derived indexes only after the source document is durably FINISH. */
@Injectable()
export class KnowledgeDerivedIndexPublicationService {
    private readonly logger = new Logger(KnowledgeDerivedIndexPublicationService.name)

    constructor(private readonly commandBus: CommandBus) {}

    async publish(input: KnowledgeDocumentPublication) {
        const context = {
            userId: input.userId,
            tenantId: input.knowledgebase.tenantId,
            organizationId: input.knowledgebase.organizationId,
            knowledgebaseId: input.knowledgebase.id
        }
        const results = await Promise.allSettled([
            this.commandBus.execute(
                new KnowledgeQuestionsEnqueueCommand({ documentId: input.documentId, userId: input.userId })
            ),
            this.commandBus.execute(
                input.contentChanged
                    ? new KnowledgeGraphEnqueueCommand({
                          ...context,
                          documentIds: [input.documentId],
                          reason: 'document'
                      })
                    : new KnowledgeGraphRetryDocumentCommand({
                          knowledgebaseId: input.knowledgebase.id,
                          documentId: input.documentId,
                          userId: input.userId
                      })
            ),
            ...(input.contentChanged
                ? [
                      this.commandBus.execute(
                          new KnowledgeWikiEnqueueSourceCommand({
                              ...context,
                              documentId: input.documentId,
                              reason: 'document'
                          })
                      )
                  ]
                : [])
        ])

        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                const target = ['Questions', 'GraphRAG', 'Wiki'][index]
                this.logger.warn(
                    `${target} publication failed for document '${input.documentId}': ${getErrorMessage(result.reason)}`
                )
            }
        })
    }
}
