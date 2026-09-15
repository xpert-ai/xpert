import { KnowledgeAutoTaggingEnqueueCommand } from './tags/automatic-tagging.command'
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
        const publications = [
            {
                target: 'Tags',
                command: new KnowledgeAutoTaggingEnqueueCommand({ ...context, documentId: input.documentId })
            },
            {
                target: 'Questions',
                command: new KnowledgeQuestionsEnqueueCommand({ documentId: input.documentId, userId: input.userId })
            },
            {
                target: 'GraphRAG',
                command: input.contentChanged
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
            },
            ...(input.contentChanged
                ? [
                      {
                          target: 'Wiki',
                          command: new KnowledgeWikiEnqueueSourceCommand({
                              ...context,
                              documentId: input.documentId,
                              reason: 'document'
                          })
                      }
                  ]
                : [])
        ]
        // Both synchronous dispatch failures and asynchronous queue failures are optional outcomes.
        const results = await Promise.allSettled(
            publications.map(({ command }) => Promise.resolve().then(() => this.commandBus.execute(command)))
        )

        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                const target = publications[index].target
                this.logger.warn(
                    `${target} publication failed for document '${input.documentId}': ${getErrorMessage(result.reason)}`
                )
            }
        })
    }
}
