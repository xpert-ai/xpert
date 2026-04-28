import {
    ChatKitCodeReference,
    ChatKitImageReference,
    ChatKitQuoteReference,
    STATE_VARIABLE_HUMAN,
    TChatElementReference,
    TChatElementReferenceCandidateFields,
    TChatReference
} from '@xpert-ai/contracts'

type CodeReferenceLike = Omit<ChatKitCodeReference, 'type'> & {
    type?: 'code'
}

type QuoteReferenceLike = ChatKitQuoteReference

type ImageReferenceLike = ChatKitImageReference

type ElementReferenceLike = TChatElementReference

type ReferenceLike = TChatReference

type ReferenceCompositionMode = 'compose' | 'preserve'

type ReferenceCandidate = TChatElementReferenceCandidateFields & {
    endLine?: unknown
    label?: unknown
    language?: unknown
    messageId?: unknown
    type?: unknown
    path?: unknown
    source?: unknown
    fileId?: unknown
    url?: unknown
    mimeType?: unknown
    name?: unknown
    size?: unknown
    width?: unknown
    height?: unknown
    startLine?: unknown
    taskId?: unknown
    text?: unknown
}

type CodeReferenceCandidate = ReferenceCandidate & {
    path: string
    startLine: number
    endLine: number
    text: string
    label?: string
    language?: string
    taskId?: string
}

type QuoteReferenceCandidate = ReferenceCandidate & {
    type: 'quote'
    text: string
    label?: string
    messageId?: string
    source?: string
}

type ImageReferenceCandidate = ReferenceCandidate & {
    type: 'image'
    text?: string
    label?: string
    fileId?: string
    url?: string
    mimeType?: string
    name?: string
    size?: number
    width?: number
    height?: number
}

type ElementReferenceCandidate = ReferenceCandidate & {
    type: 'element'
    attributes: Array<{ name: string; value: string }>
    outerHtml: string
    pageUrl: string
    selector: string
    serviceId: string
    tagName: string
    text: string
    label?: string
    pageTitle?: string
    role?: string
}

type ElementAttributeCandidate = {
    name?: unknown
    value?: unknown
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

function isOptionalString(value: unknown): value is string | undefined {
    return value === undefined || typeof value === 'string'
}

function isOptionalNumber(value: unknown): value is number | undefined {
    return value === undefined || (typeof value === 'number' && Number.isFinite(value))
}

function toOptionalString(value: string | undefined): string | undefined {
    return isNonEmptyString(value) ? value.trim() : undefined
}

function toOptionalNumber(value: unknown, options?: { allowZero?: boolean }): number | undefined {
    const allowZero = options?.allowZero ?? false
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return undefined
    }

    if (value > 0 || (allowZero && value === 0)) {
        return value
    }

    return undefined
}

function isElementAttribute(value: unknown): value is { name: string; value: string } {
    if (!isObjectLike(value)) {
        return false
    }

    const attribute = value as ElementAttributeCandidate
    return isNonEmptyString(attribute.name) && typeof attribute.value === 'string'
}

function hasImageReferenceLocator(value: ReferenceCandidate): boolean {
    return (
        isNonEmptyString(value.fileId) ||
        isNonEmptyString(value.url) ||
        isNonEmptyString(value.name) ||
        isNonEmptyString(value.label) ||
        isNonEmptyString(value.text)
    )
}

export function isCodeReferenceLike(value: unknown): value is CodeReferenceCandidate {
    if (!isObjectLike(value)) {
        return false
    }

    const reference = value as ReferenceCandidate

    return (
        isNonEmptyString(reference.path) &&
        isPositiveInteger(reference.startLine) &&
        isPositiveInteger(reference.endLine) &&
        isNonEmptyString(reference.text) &&
        isOptionalString(reference.label) &&
        isOptionalString(reference.language) &&
        isOptionalString(reference.taskId)
    )
}

export function isQuoteReferenceLike(value: unknown): value is QuoteReferenceCandidate {
    if (!isObjectLike(value)) {
        return false
    }

    const reference = value as ReferenceCandidate
    return (
        reference.type === 'quote' &&
        isNonEmptyString(reference.text) &&
        isOptionalString(reference.label) &&
        isOptionalString(reference.messageId) &&
        isOptionalString(reference.source)
    )
}

export function isImageReferenceLike(value: unknown): value is ImageReferenceCandidate {
    if (!isObjectLike(value)) {
        return false
    }

    const reference = value as ReferenceCandidate
    return (
        reference.type === 'image' &&
        isOptionalString(reference.label) &&
        isOptionalString(reference.fileId) &&
        isOptionalString(reference.url) &&
        isOptionalString(reference.mimeType) &&
        isOptionalString(reference.name) &&
        isOptionalString(reference.text) &&
        isOptionalNumber(reference.size) &&
        isOptionalNumber(reference.width) &&
        isOptionalNumber(reference.height) &&
        hasImageReferenceLocator(reference)
    )
}

export function isElementReferenceLike(value: unknown): value is ElementReferenceCandidate {
    if (!isObjectLike(value)) {
        return false
    }

    const reference = value as ReferenceCandidate

    return (
        reference.type === 'element' &&
        isNonEmptyString(reference.text) &&
        isNonEmptyString(reference.serviceId) &&
        isNonEmptyString(reference.pageUrl) &&
        isNonEmptyString(reference.selector) &&
        isNonEmptyString(reference.tagName) &&
        isNonEmptyString(reference.outerHtml) &&
        Array.isArray(reference.attributes) &&
        reference.attributes.every((attribute) => isElementAttribute(attribute)) &&
        isOptionalString(reference.label) &&
        isOptionalString(reference.pageTitle) &&
        isOptionalString(reference.role)
    )
}

function toCodeReference(reference: CodeReferenceCandidate): ChatKitCodeReference {
    return {
        type: 'code',
        path: reference.path.trim(),
        startLine: reference.startLine,
        endLine: reference.endLine,
        text: reference.text,
        ...(toOptionalString(reference.label) ? { label: toOptionalString(reference.label) } : {}),
        ...(toOptionalString(reference.language) ? { language: toOptionalString(reference.language) } : {}),
        ...(toOptionalString(reference.taskId) ? { taskId: toOptionalString(reference.taskId) } : {})
    }
}

function toQuoteReference(reference: QuoteReferenceCandidate): ChatKitQuoteReference {
    return {
        type: 'quote',
        text: reference.text,
        ...(toOptionalString(reference.label) ? { label: toOptionalString(reference.label) } : {}),
        ...(toOptionalString(reference.messageId) ? { messageId: toOptionalString(reference.messageId) } : {}),
        ...(toOptionalString(reference.source) ? { source: toOptionalString(reference.source) } : {})
    }
}

function toImageReference(reference: ImageReferenceCandidate): ChatKitImageReference {
    const fileId = toOptionalString(reference.fileId)
    const url = toOptionalString(reference.url)
    const name = toOptionalString(reference.name)
    const label = toOptionalString(reference.label)
    const rawText = toOptionalString(reference.text)
    const text = rawText ?? name ?? label ?? 'Pasted image'

    return {
        type: 'image',
        text,
        ...(label ? { label } : {}),
        ...(fileId ? { fileId } : {}),
        ...(url ? { url } : {}),
        ...(toOptionalString(reference.mimeType) ? { mimeType: toOptionalString(reference.mimeType) } : {}),
        ...(name ? { name } : {}),
        ...(toOptionalNumber(reference.size, { allowZero: true }) !== undefined
            ? { size: toOptionalNumber(reference.size, { allowZero: true }) }
            : {}),
        ...(toOptionalNumber(reference.width) !== undefined ? { width: toOptionalNumber(reference.width) } : {}),
        ...(toOptionalNumber(reference.height) !== undefined ? { height: toOptionalNumber(reference.height) } : {})
    }
}

function toElementReference(reference: ElementReferenceCandidate): TChatElementReference {
    return {
        type: 'element',
        attributes: reference.attributes,
        outerHtml: reference.outerHtml,
        pageUrl: reference.pageUrl,
        selector: reference.selector,
        serviceId: reference.serviceId,
        tagName: reference.tagName,
        text: reference.text,
        ...(toOptionalString(reference.label) ? { label: toOptionalString(reference.label) } : {}),
        ...(toOptionalString(reference.pageTitle) ? { pageTitle: toOptionalString(reference.pageTitle) } : {}),
        ...(toOptionalString(reference.role) ? { role: toOptionalString(reference.role) } : {})
    }
}

export function normalizeReferenceLike(value: unknown): ReferenceLike | null {
    if (isQuoteReferenceLike(value)) {
        return toQuoteReference(value)
    }

    if (isImageReferenceLike(value)) {
        return toImageReference(value)
    }

    if (isElementReferenceLike(value)) {
        return toElementReference(value)
    }

    if (isCodeReferenceLike(value)) {
        return toCodeReference(value)
    }

    return null
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
    const source = [reference.label, reference.source].filter(isNonEmptyString).join(' - ')
    const quotedLines = reference.text.split('\n').map((line) => `> ${line}`)

    return [source ? `[${source}]` : '[Quoted text]', ...quotedLines].join('\n')
}

function formatReferenceSize(size: number): string {
    if (size < 1024) {
        return `${size} B`
    }

    if (size < 1024 * 1024) {
        return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`
    }

    return `${(size / (1024 * 1024)).toFixed(size < 10 * 1024 * 1024 ? 1 : 0)} MB`
}

function formatImageReference(reference: ImageReferenceLike): string {
    const summary = [
        reference.mimeType?.trim() || null,
        reference.width && reference.height ? `${reference.width}x${reference.height}` : null,
        typeof reference.size === 'number' ? formatReferenceSize(reference.size) : null
    ].filter((item): item is string => Boolean(item))

    return [
        `[Image] ${reference.label?.trim() || reference.name?.trim() || 'Pasted image'}`,
        ...(summary.length ? [`Metadata: ${summary.join(', ')}`] : []),
        ...(reference.url?.trim() ? [`URL: ${reference.url.trim()}`] : []),
        ...(reference.fileId?.trim() ? [`File ID: ${reference.fileId.trim()}`] : []),
        `Text: ${reference.text}`
    ].join('\n')
}

function formatElementReference(reference: ElementReferenceLike): string {
    const heading = reference.label?.trim() || `${reference.tagName.toLowerCase()} ${reference.selector}`
    const attributes = reference.attributes.length
        ? reference.attributes.map(({ name, value }) => `${name}="${value}"`).join(' ')
        : '(none)'

    return [
        `[Page element] ${heading}`,
        `Page: ${reference.pageTitle?.trim() || reference.pageUrl}`,
        `Selector: ${reference.selector}`,
        `Tag: ${reference.tagName}`,
        ...(isNonEmptyString(reference.role) ? [`Role: ${reference.role.trim()}`] : []),
        `Attributes: ${attributes}`,
        'Text:',
        reference.text,
        'HTML:',
        '```html',
        reference.outerHtml,
        '```'
    ].join('\n')
}

export function buildReferencedPrompt(references: ReferenceLike[]): string {
    if (!references.length) {
        return ''
    }

    const header = references.every((reference) => reference.type === 'code')
        ? 'Referenced code:'
        : 'Referenced content:'
    const body = references
        .map((reference) =>
            reference.type === 'quote'
                ? formatQuoteReference(reference)
                : reference.type === 'image'
                  ? formatImageReference(reference)
                  : reference.type === 'element'
                    ? formatElementReference(reference)
                    : formatCodeReference(reference)
        )
        .join('\n\n')

    return `${header}\n${body}`
}

export function buildReferencedCodePrompt(references: ChatKitCodeReference[]): string {
    return buildReferencedPrompt(references)
}

function getReferenceCompositionMode(input: HumanInputCandidate): ReferenceCompositionMode {
    return input.referenceComposition === 'compose' ? 'compose' : 'preserve'
}

/**
 * Takes human input that may contain reference-only content and transforms it into fully synthesized input that can be directly used by graph/LLM.
 */
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

/**
 * Hydrates the human input of a message.
 */
export function hydrateHumanInput<T extends HumanInputCandidate>(input: T): T {
    const synthesizedInput = synthesizeHumanInputFromReferences(input)
    if (!synthesizedInput) {
        return input
    }

    return {
        ...input,
        input: synthesizedInput
    } as T
}

/**
 * Transform reference-only / referenceComposition: 'compose' requests into human input that can be directly used by graph/LLM.
 */
export function hydrateSendRequestHumanInput<T>(input: T): T {
    if (!isObjectLike(input)) {
        return input
    }

    const request = input as SendRequestCandidate
    if ((request.action !== 'send' && request.action !== 'follow_up') || !isObjectLike(request.message)) {
        return input
    }

    const message = request.message as SendMessageCandidate
    if (!isObjectLike(message.input)) {
        return input
    }

    const messageInput = message.input as HumanInputCandidate
    const nextMessageInput = hydrateHumanInput(messageInput)
    if (nextMessageInput.input === messageInput.input) {
        return input
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
            input: nextMessageInput.input,
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
