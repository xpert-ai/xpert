// Invariants: parser and identity-contract failures share one corrective attempt. Every
// attempt uses the caller's metered model; invalid decisions never become graph writes.
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { t } from 'i18next'
import { z } from 'zod'
import { KnowledgeIdentityError } from '../knowledgebase/identity/knowledge-identity-error'
import {
    buildKnowledgeIdentityDedupMessages,
    createKnowledgeIdentityDedupOutputSchema,
    KnowledgeIdentityDedupModelInput,
    parseKnowledgeIdentityDedupOutput
} from '../knowledgebase/identity/knowledge-identity-model'
import { isGraphOutputParsingError } from './graph-extraction-batches'

export class GraphIdentityOutputError extends Error {
    readonly code = 'graph_identity_output_invalid'

    constructor(readonly cause: unknown) {
        const defaultValue =
            'Graph identity resolution returned invalid model output after one corrective attempt. For same, identityId must reference a supplied candidate; for different or uncertain, it must be null. Check the graph model configuration and retry the failed document.'
        super(t('server-ai:Error.GraphIdentityOutputInvalid', { defaultValue }) || defaultValue)
    }
}

export async function judgeGraphIdentity(model: BaseChatModel, input: KnowledgeIdentityDedupModelInput) {
    const messages = buildKnowledgeIdentityDedupMessages(input)
    const structured = model.withStructuredOutput(createKnowledgeIdentityDedupOutputSchema(input), {
        method: 'functionCalling'
    })
    const invoke = async (correction: boolean) => {
        const output = await structured.invoke(
            correction
                ? messages.map((message) =>
                      message.role === 'system'
                          ? {
                                ...message,
                                content: `${message.content}\nThe previous response failed validation. Re-evaluate the item against the supplied candidates. For same, identityId must exactly match one candidates[].id; for different or uncertain, identityId must be null, never an empty string. Return a short non-empty reason. Never invent a target or match the item to itself.`
                            }
                          : message
                  )
                : messages
        )
        return parseKnowledgeIdentityDedupOutput(output, input)
    }
    const isInvalidOutput = (error: unknown) =>
        isGraphOutputParsingError(error) ||
        error instanceof z.ZodError ||
        (error instanceof KnowledgeIdentityError && error.code === 'invalid')
    try {
        return await invoke(false)
    } catch (error) {
        if (!isInvalidOutput(error)) throw error
    }
    try {
        return await invoke(true)
    } catch (error) {
        if (!isInvalidOutput(error)) throw error
        throw new GraphIdentityOutputError(error)
    }
}
