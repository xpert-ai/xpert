import { IKnowledgeDocumentChunk, IDocChunkMetadata, KnowledgeChunkQuestions } from '@xpert-ai/contracts'
import { BadRequestException } from '@nestjs/common'
import { t } from 'i18next'
import { Repository } from 'typeorm'
import { KnowledgeDocumentChunk } from '../chunk/chunk.entity'
import { writeQuestionState } from './question-state'
import { buildQuestionVectors } from './question-vectors'

export function mergeQuestionProjectionIds(
    state: KnowledgeChunkQuestions,
    write: ReturnType<typeof buildQuestionVectors>
) {
    return {
        ...state,
        vectorIds: [...new Set([...state.vectorIds, ...write.ids])],
        questions: state.questions.map((question) => ({
            ...question,
            vectorIds: [
                ...new Set([
                    ...(question.vectorIds ?? []),
                    ...(write.questions.find((item) => item.id === question.id)?.vectorIds ?? [])
                ])
            ]
        }))
    }
}

/** Retain active and pending ids until promotion; either collection can then be cleaned up safely. */
export async function recordRebuiltQuestionVectors(
    repository: Repository<KnowledgeDocumentChunk>,
    chunk: IKnowledgeDocumentChunk<IDocChunkMetadata>,
    write: ReturnType<typeof buildQuestionVectors>
) {
    const state = chunk.metadata.questionGeneration
    const saved = await writeQuestionState(repository, chunk, mergeQuestionProjectionIds(state, write))
    // An in-flight generation changed the snapshot. Do not promote a collection built from stale questions.
    if (!saved) throw new BadRequestException(t('server-ai:Error.KnowledgeQuestionsStale'))
}
