import { STATE_VARIABLE_HUMAN, TChatCodeReference, TChatQuoteReference, TChatReference } from '@xpert-ai/contracts'

export type CodeReferenceLike = Omit<TChatCodeReference, 'type'> & {
    type?: 'code'
}

export type QuoteReferenceLike = TChatQuoteReference

export type ReferenceLike = TChatReference

export type ReferenceCompositionMode = 'compose' | 'preserve'

type ReferenceCandidate = {
    type?: unknown
    text?: unknown
    label?: unknown
    path?: unknown
    startLine?: unknown
    endLine?: unknown
    language?: unknown
    taskId?: unknown
    messageId?: unknown
    source?: unknown
}

type HumanInputCandidate = {
    input?: unknown
    references?: unknown
    referenceComposition?: unknown
    [key: string]: unknown
}

type SendMessageCandidate = {
    input?: unknown
    [key: string]: unknown
}

type SendRequestStateCandidate = {
    [STATE_VARIABLE_HUMAN]?: unknown
    [key: string]: unknown
}

type SendRequestCandidate = {
    action?: unknown
    message?: unknown
    state?: unknown
    [key: string]: unknown
}

function isObjectLike(value: unknown): value is object {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0
}

function isPositiveInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value > 0
}

export function normalizeCodeReferenceLike(value: unknown): TChatCodeReference | null {
    if (!isObjectLike(value)) {
        return null
    }

    const reference = value as ReferenceCandidate

    if (
        !isNonEmptyString(reference.path) ||
        !isPositiveInteger(reference.startLine) ||
        !isPositiveInteger(reference.endLine) ||
        !isNonEmptyString(reference.text)
    ) {
        return null
    }

    return {
        type: 'code',
        path: reference.path,
        startLine: reference.startLine,
        endLine: reference.endLine,
        text: reference.text,
        ...(isNonEmptyString(reference.label) ? { label: reference.label } : {}),
        ...(isNonEmptyString(reference.language) ? { language: reference.language } : {}),
        ...(isNonEmptyString(reference.taskId) ? { taskId: reference.taskId } : {})
    }
}

export function normalizeQuoteReferenceLike(value: unknown): TChatQuoteReference | null {
    if (!isObjectLike(value)) {
        return null
    }

    const reference = value as ReferenceCandidate
    if (!isNonEmptyString(reference.text)) {
        return null
    }

    return {
        type: 'quote',
        text: reference.text,
        ...(isNonEmptyString(reference.label) ? { label: reference.label } : {}),
        ...(isNonEmptyString(reference.messageId) ? { messageId: reference.messageId } : {}),
        ...(isNonEmptyString(reference.source) ? { source: reference.source } : {})
    }
}

export function normalizeReferenceLike(value: unknown): ReferenceLike | null {
    if (!isObjectLike(value)) {
        return null
    }

    const reference = value as ReferenceCandidate
    if (reference.type === 'quote') {
        return normalizeQuoteReferenceLike(reference)
    }

    return normalizeCodeReferenceLike(reference)
}

export function normalizeReferences(value: unknown): TChatReference[] {
    if (!Array.isArray(value)) {
        return []
    }

    return value
        .map((reference) => normalizeReferenceLike(reference))
        .filter((reference): reference is TChatReference => reference !== null)
}

function getCodeReferenceRange(reference: CodeReferenceLike): string {
    return reference.startLine === reference.endLine
        ? `${reference.startLine}`
        : `${reference.startLine}-${reference.endLine}`
}

function formatCodeReference(reference: CodeReferenceLike): string {
    const location = `${reference.path}:${getCodeReferenceRange(reference)}`
    const language = isNonEmptyString(reference.language) ? reference.language.trim() : ''

    return [`[${location}]`, `\`\`\`${language}`, reference.text, '```'].join('\n')
}

function formatQuoteReference(reference: QuoteReferenceLike): string {
    const source = [reference.label, reference.source].filter(isNonEmptyString).join(' · ')
    const quotedLines = reference.text.split('\n').map((line) => `> ${line}`)

    return [source ? `[${source}]` : '[Quoted text]', ...quotedLines].join('\n')
}

export function buildReferencedPrompt(references: ReferenceLike[]): string {
    if (!references.length) {
        return ''
    }

    const header = references.every((reference) => reference.type !== 'quote')
        ? 'Referenced code:'
        : 'Referenced content:'
    const body = references
        .map((reference) =>
            reference.type === 'quote' ? formatQuoteReference(reference) : formatCodeReference(reference)
        )
        .join('\n\n')

    return `${header}\n${body}`
}

export function buildReferencedCodePrompt(references: TChatCodeReference[]): string {
    return buildReferencedPrompt(references)
}

function getReferenceCompositionMode(input: HumanInputCandidate): ReferenceCompositionMode {
    return input.referenceComposition === 'compose' ? 'compose' : 'preserve'
}

export function synthesizeHumanInputFromReferences(input: unknown): string | undefined {
    if (!isObjectLike(input)) {
        return undefined
    }

    const humanInput = input as HumanInputCandidate
    const baseInput = typeof humanInput.input === 'string' ? humanInput.input : ''
    const hasBaseInput = baseInput.trim().length > 0
    const references = normalizeReferences(humanInput.references)

    if (!references.length) {
        return hasBaseInput ? baseInput : undefined
    }

    if (hasBaseInput && getReferenceCompositionMode(humanInput) !== 'compose') {
        return baseInput
    }

    const prompt = buildReferencedPrompt(references)
    if (!prompt.trim().length) {
        return hasBaseInput ? baseInput : undefined
    }

    if (!hasBaseInput) {
        return prompt
    }

    return `${baseInput.trimEnd()}\n\n${prompt}`
}

export function hydrateSendRequestHumanInput<T>(input: T): T {
    if (!isObjectLike(input)) {
        return input
    }

    const request = input as SendRequestCandidate
    if (request.action !== 'send' || !isObjectLike(request.message)) {
        return input
    }

    const message = request.message as SendMessageCandidate
    if (!isObjectLike(message.input)) {
        return input
    }

    const messageInput = message.input as HumanInputCandidate
    const synthesizedInput = synthesizeHumanInputFromReferences(messageInput)
    if (!synthesizedInput) {
        return input
    }

    const nextMessageInput: HumanInputCandidate = {
        ...messageInput,
        input: synthesizedInput
    }

    if (!isObjectLike(request.state)) {
        return {
            ...request,
            message: {
                ...message,
                input: nextMessageInput
            }
        } as T
    }

    const state = request.state as SendRequestStateCandidate
    const humanStateValue = state[STATE_VARIABLE_HUMAN]

    let nextHumanState: HumanInputCandidate
    if (isObjectLike(humanStateValue)) {
        const humanState = humanStateValue as HumanInputCandidate

        nextHumanState = {
            ...humanState,
            input: synthesizedInput,
            ...(Array.isArray(humanState.references) || !Array.isArray(nextMessageInput.references)
                ? {}
                : { references: nextMessageInput.references })
        }
    } else {
        nextHumanState = nextMessageInput
    }

    return {
        ...request,
        message: {
            ...message,
            input: nextMessageInput
        },
        state: {
            ...state,
            [STATE_VARIABLE_HUMAN]: nextHumanState
        }
    } as T
}
