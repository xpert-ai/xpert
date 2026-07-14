import type {
    ChatKitReference,
    ChatTaskSummaryOutput,
    ChatTaskSummaryOutputKind,
    ChatTaskSummaryPlan,
    ChatTaskSummarySource,
    ChatTaskSummarySourceKind,
    ChatTaskSummaryTodos,
    IChatMessage,
    TChatTaskSummaryContribution
} from '@xpert-ai/contracts'

const SUMMARY_VERSION = 1 as const
const PLAN_EXCERPT_LENGTH = 160
const PLAN_PATTERN = /<proposed_plan>\s*([\s\S]*?)\s*<\/proposed_plan>/i
const MARKDOWN_LINK_PATTERN = /\[[^\]]*\]\((xpert:\/\/knowledgebase\/chunk\?[^)]+)\)/g

type MessageContentPart = {
    id?: unknown
    type?: unknown
    text?: unknown
    image_url?: unknown
    title?: unknown
    url?: unknown
    data?: unknown
}

type ComponentData = {
    type?: unknown
    title?: unknown
    taskSummary?: unknown
    _meta?: unknown
    artifact?: unknown
    artifactLink?: unknown
    file?: unknown
    input?: unknown
    tool?: unknown
    url?: unknown
}

type TaskSummaryMeta = {
    'xpertai/taskSummary'?: unknown
}

type ArtifactCandidate = {
    id?: unknown
    artifactId?: unknown
    kind?: unknown
    title?: unknown
    description?: unknown
    workspacePath?: unknown
    fileAssetId?: unknown
    storageFileId?: unknown
    name?: unknown
    originalName?: unknown
}

type TaskSummaryResourceCandidate = {
    type?: unknown
    messageId?: unknown
    workspacePath?: unknown
    fileAssetId?: unknown
    storageFileId?: unknown
    artifactId?: unknown
    serviceId?: unknown
    url?: unknown
}

type TaskSummaryOutputCandidate = {
    id?: unknown
    kind?: unknown
    title?: unknown
    description?: unknown
    status?: unknown
    resource?: unknown
    messageId?: unknown
    updatedAt?: unknown
}

type TaskSummarySourceCandidate = {
    id?: unknown
    kind?: unknown
    title?: unknown
    description?: unknown
    resource?: unknown
    messageId?: unknown
    updatedAt?: unknown
}

type TaskSummaryPlanCandidate = {
    title?: unknown
    excerpt?: unknown
    messageId?: unknown
    updatedAt?: unknown
}

type TaskSummaryTodosCandidate = {
    componentId?: unknown
    title?: unknown
    items?: unknown
    messageId?: unknown
    updatedAt?: unknown
}

type TaskSummaryContributionCandidate = {
    version?: unknown
    plan?: unknown
    todos?: unknown
    outputs?: unknown
    sources?: unknown
}

type TodoInputCandidate = {
    todos?: unknown
}

type TodoCandidate = {
    content?: unknown
    status?: unknown
}

type FileAssetCandidate = {
    id?: unknown
    fileAssetId?: unknown
    storageFileId?: unknown
    workspacePath?: unknown
    originalName?: unknown
    name?: unknown
    fileName?: unknown
}

type RuntimeCapabilitiesMetadata = {
    runtimeCapabilities?: unknown
}

type RuntimeCapabilitiesCandidate = {
    skills?: unknown
    plugins?: unknown
}

type CapabilityIdsCandidate = {
    ids?: unknown
    nodeKeys?: unknown
}

function isObjectValue(value: unknown): value is object {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function toIsoString(value: unknown) {
    if (value instanceof Date) {
        return value.toISOString()
    }
    const text = readString(value)
    if (!text) {
        return undefined
    }
    const timestamp = Date.parse(text)
    return Number.isNaN(timestamp) ? undefined : new Date(timestamp).toISOString()
}

function readContentParts(content: unknown): MessageContentPart[] {
    if (!Array.isArray(content)) {
        return []
    }
    return content.filter((value): value is MessageContentPart => isObjectValue(value))
}

function readMessageText(content: unknown) {
    if (typeof content === 'string') {
        return content
    }
    return readContentParts(content)
        .map((part) => readString(part.text) ?? '')
        .join('\n')
}

function compactText(value: string, maxLength: number) {
    const normalized = value.replace(/\s+/g, ' ').trim()
    return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 3).trimEnd()}...`
}

function extractPlan(content: unknown, messageId?: string, updatedAt?: string): ChatTaskSummaryPlan | undefined {
    const match = PLAN_PATTERN.exec(readMessageText(content))
    const markdown = match?.[1]?.trim()
    if (!markdown) {
        return undefined
    }
    const heading = markdown
        .split(/\r?\n/)
        .map((line) => line.replace(/^#{1,6}\s+/, '').trim())
        .find(Boolean)

    return {
        title: heading ?? 'Plan',
        excerpt: compactText(markdown, PLAN_EXCERPT_LENGTH),
        ...(messageId ? { messageId } : {}),
        ...(updatedAt ? { updatedAt } : {})
    }
}

function isTodoStatus(value: unknown): value is 'pending' | 'in_progress' | 'completed' {
    return value === 'pending' || value === 'in_progress' || value === 'completed'
}

function extractTodos(
    part: MessageContentPart,
    messageId?: string,
    updatedAt?: string
): ChatTaskSummaryTodos | undefined {
    if (part.type !== 'component' || !isObjectValue(part.data)) {
        return undefined
    }
    const data = part.data as ComponentData
    if (data.tool !== 'write_todos' || !isObjectValue(data.input)) {
        return undefined
    }
    const input = data.input as TodoInputCandidate
    if (!Array.isArray(input.todos)) {
        return undefined
    }
    const items = input.todos.flatMap((value, index) => {
        if (!isObjectValue(value)) {
            return []
        }
        const todo = value as TodoCandidate
        const content = readString(todo.content)
        if (!content || !isTodoStatus(todo.status)) {
            return []
        }
        return [{ id: `todo-${index + 1}`, content, status: todo.status }]
    })
    if (!items.length) {
        return undefined
    }
    return {
        componentId: readString(part.id) ?? `write_todos-${messageId ?? 'message'}`,
        title: readString(data.title),
        items,
        ...(messageId ? { messageId } : {}),
        ...(updatedAt ? { updatedAt } : {})
    }
}

function isOutputKind(value: unknown): value is ChatTaskSummaryOutputKind {
    return (
        value === 'file' ||
        value === 'image' ||
        value === 'document' ||
        value === 'spreadsheet' ||
        value === 'presentation' ||
        value === 'site' ||
        value === 'url' ||
        value === 'mcp_app'
    )
}

function isSourceKind(value: unknown): value is ChatTaskSummarySourceKind {
    return (
        value === 'attachment' ||
        value === 'code' ||
        value === 'quote' ||
        value === 'image' ||
        value === 'web_page' ||
        value === 'file_element' ||
        value === 'knowledge' ||
        value === 'skill' ||
        value === 'plugin' ||
        value === 'sub_agent'
    )
}

function isOutputStatus(value: unknown): value is ChatTaskSummaryOutput['status'] {
    return value === 'pending' || value === 'running' || value === 'success' || value === 'error'
}

function normalizeResource(value: unknown): ChatTaskSummaryOutput['resource'] | undefined {
    if (!isObjectValue(value)) {
        return undefined
    }
    const candidate = value as TaskSummaryResourceCandidate
    switch (candidate.type) {
        case 'message': {
            const messageId = readString(candidate.messageId)
            return messageId ? { type: 'message', messageId } : undefined
        }
        case 'workspace_file': {
            const workspacePath = readString(candidate.workspacePath)
            return workspacePath
                ? {
                      type: 'workspace_file',
                      workspacePath,
                      fileAssetId: readString(candidate.fileAssetId),
                      storageFileId: readString(candidate.storageFileId)
                  }
                : undefined
        }
        case 'artifact': {
            const artifactId = readString(candidate.artifactId)
            return artifactId ? { type: 'artifact', artifactId } : undefined
        }
        case 'browser': {
            const serviceId = readString(candidate.serviceId)
            const url = readString(candidate.url)
            return serviceId || url ? { type: 'browser', serviceId, url } : undefined
        }
        case 'url': {
            const url = readString(candidate.url)
            return url ? { type: 'url', url } : undefined
        }
        default:
            return undefined
    }
}

function normalizePlan(value: unknown, messageId?: string, updatedAt?: string): ChatTaskSummaryPlan | undefined {
    if (!isObjectValue(value)) {
        return undefined
    }
    const candidate = value as TaskSummaryPlanCandidate
    const title = readString(candidate.title)
    const excerpt = readString(candidate.excerpt)
    if (!title || !excerpt) {
        return undefined
    }
    return {
        title: compactText(title, 160),
        excerpt: compactText(excerpt, PLAN_EXCERPT_LENGTH),
        messageId: readString(candidate.messageId) ?? messageId,
        updatedAt: toIsoString(candidate.updatedAt) ?? updatedAt
    }
}

function normalizeTodos(value: unknown, messageId?: string, updatedAt?: string): ChatTaskSummaryTodos | undefined {
    if (!isObjectValue(value)) {
        return undefined
    }
    const candidate = value as TaskSummaryTodosCandidate
    const componentId = readString(candidate.componentId)
    if (!componentId || !Array.isArray(candidate.items)) {
        return undefined
    }
    const items = candidate.items.flatMap((value) => {
        if (!isObjectValue(value)) {
            return []
        }
        const item = value as { id?: unknown; content?: unknown; status?: unknown }
        const id = readString(item.id)
        const content = readString(item.content)
        return id && content && isTodoStatus(item.status) ? [{ id, content, status: item.status }] : []
    })
    return items.length
        ? {
              componentId,
              title: readString(candidate.title),
              items,
              messageId: readString(candidate.messageId) ?? messageId,
              updatedAt: toIsoString(candidate.updatedAt) ?? updatedAt
          }
        : undefined
}

function normalizeOutput(value: unknown, messageId?: string, updatedAt?: string): ChatTaskSummaryOutput | undefined {
    if (!isObjectValue(value)) {
        return undefined
    }
    const output = value as TaskSummaryOutputCandidate
    const id = readString(output.id)
    const title = readString(output.title)
    if (!id || !title || !isOutputKind(output.kind)) {
        return undefined
    }
    return {
        id,
        kind: output.kind,
        title: compactText(title, 160),
        description: readString(output.description),
        status: isOutputStatus(output.status) ? output.status : undefined,
        resource: normalizeResource(output.resource),
        messageId: readString(output.messageId) ?? messageId,
        updatedAt: toIsoString(output.updatedAt) ?? updatedAt
    }
}

function normalizeSource(value: unknown, messageId?: string, updatedAt?: string): ChatTaskSummarySource | undefined {
    if (!isObjectValue(value)) {
        return undefined
    }
    const source = value as TaskSummarySourceCandidate
    const id = readString(source.id)
    const title = readString(source.title)
    if (!id || !title || !isSourceKind(source.kind)) {
        return undefined
    }
    return {
        id,
        kind: source.kind,
        title: compactText(title, 160),
        description: readString(source.description),
        resource: normalizeResource(source.resource),
        messageId: readString(source.messageId) ?? messageId,
        updatedAt: toIsoString(source.updatedAt) ?? updatedAt
    }
}

function normalizeContribution(
    value: unknown,
    messageId?: string,
    updatedAt?: string
): TChatTaskSummaryContribution | undefined {
    if (!isObjectValue(value)) {
        return undefined
    }
    const candidate = value as TaskSummaryContributionCandidate
    if (candidate.version !== SUMMARY_VERSION) {
        return undefined
    }
    const outputs = Array.isArray(candidate.outputs)
        ? candidate.outputs.flatMap((item) => normalizeOutput(item, messageId, updatedAt) ?? [])
        : []
    const sources = Array.isArray(candidate.sources)
        ? candidate.sources.flatMap((item) => normalizeSource(item, messageId, updatedAt) ?? [])
        : []
    const plan = normalizePlan(candidate.plan, messageId, updatedAt)
    const todos = normalizeTodos(candidate.todos, messageId, updatedAt)
    return {
        version: SUMMARY_VERSION,
        ...(plan ? { plan } : {}),
        ...(todos ? { todos } : {}),
        ...(outputs.length ? { outputs } : {}),
        ...(sources.length ? { sources } : {})
    }
}

function readExplicitContribution(data: ComponentData, messageId?: string, updatedAt?: string) {
    const direct = normalizeContribution(data.taskSummary, messageId, updatedAt)
    if (direct) {
        return direct
    }
    if (!isObjectValue(data._meta)) {
        return undefined
    }
    const meta = data._meta as TaskSummaryMeta
    return normalizeContribution(meta['xpertai/taskSummary'], messageId, updatedAt)
}

function artifactOutput(value: unknown, messageId?: string, updatedAt?: string): ChatTaskSummaryOutput | undefined {
    if (!isObjectValue(value)) {
        return undefined
    }
    const artifact = value as ArtifactCandidate
    const artifactId = readString(artifact.artifactId) ?? readString(artifact.id)
    const workspacePath = readString(artifact.workspacePath)
    const fileId = readString(artifact.fileAssetId) ?? readString(artifact.storageFileId)
    const id = artifactId ?? fileId ?? workspacePath
    const title = readString(artifact.title) ?? readString(artifact.originalName) ?? readString(artifact.name) ?? id
    if (!id || !title) {
        return undefined
    }
    const kind = mapArtifactKind(artifact.kind) ?? 'file'
    if (!artifactId && !workspacePath) {
        return undefined
    }
    return {
        id: `artifact:${id}`,
        kind,
        title,
        description: readString(artifact.description),
        resource: artifactId
            ? { type: 'artifact', artifactId }
            : workspacePath
              ? {
                    type: 'workspace_file',
                    workspacePath,
                    fileAssetId: readString(artifact.fileAssetId),
                    storageFileId: readString(artifact.storageFileId)
                }
              : undefined,
        ...(messageId ? { messageId } : {}),
        ...(updatedAt ? { updatedAt } : {})
    }
}

function mapArtifactKind(value: unknown): ChatTaskSummaryOutputKind | undefined {
    if (isOutputKind(value)) {
        return value
    }
    switch (value) {
        case 'html':
            return 'site'
        case 'markdown':
        case 'pdf':
            return 'document'
        case 'pptx':
            return 'presentation'
        default:
            return undefined
    }
}

function partOutputs(part: MessageContentPart, messageId?: string, updatedAt?: string) {
    const outputs: ChatTaskSummaryOutput[] = []
    if (part.type === 'image_url') {
        const url =
            readString(part.image_url) ??
            (isObjectValue(part.image_url) && 'url' in part.image_url ? readString(part.image_url.url) : undefined)
        if (url) {
            outputs.push({
                id: `image:${url}`,
                kind: 'image',
                title: readString(part.title) ?? 'Image',
                resource: { type: 'url', url },
                ...(messageId ? { messageId } : {}),
                ...(updatedAt ? { updatedAt } : {})
            })
        }
    }
    if (part.type === 'iframe') {
        const url =
            readString(part.url) ??
            (isObjectValue(part.data) ? readString((part.data as ComponentData).url) : undefined)
        if (url) {
            outputs.push({
                id: `url:${url}`,
                kind: 'url',
                title: readString(part.title) ?? url,
                resource: { type: 'url', url },
                ...(messageId ? { messageId } : {}),
                ...(updatedAt ? { updatedAt } : {})
            })
        }
    }
    if (part.type !== 'component' || !isObjectValue(part.data)) {
        return outputs
    }
    const data = part.data as ComponentData
    const explicit = readExplicitContribution(data, messageId, updatedAt)
    outputs.push(...(explicit?.outputs ?? []))
    if (data.type === 'McpApp') {
        outputs.push({
            id: `mcp-app:${readString(part.id) ?? messageId ?? 'message'}`,
            kind: 'mcp_app',
            title: readString(data.title) ?? 'MCP App',
            resource: messageId ? { type: 'message', messageId } : undefined,
            ...(messageId ? { messageId } : {}),
            ...(updatedAt ? { updatedAt } : {})
        })
    }
    const legacyArtifact = artifactOutput(data.artifact, messageId, updatedAt)
    if (legacyArtifact) {
        outputs.push(legacyArtifact)
    }
    const artifactLink = artifactOutput(data.artifactLink, messageId, updatedAt)
    if (artifactLink) {
        outputs.push(artifactLink)
    }
    const file = artifactOutput(data.file, messageId, updatedAt)
    if (file) {
        outputs.push(file)
    }
    return outputs
}

function referenceSource(reference: ChatKitReference, messageId?: string, updatedAt?: string): ChatTaskSummarySource {
    const common = {
        id: reference.id ?? `${reference.type}:${reference.text}`,
        title: reference.label ?? compactText(reference.text, 80),
        ...(messageId ? { messageId } : {}),
        ...(updatedAt ? { updatedAt } : {})
    }
    switch (reference.type) {
        case 'code':
            return {
                ...common,
                kind: 'code',
                title: reference.label ?? reference.path,
                description: `${reference.path}:${reference.startLine}-${reference.endLine}`,
                resource: messageId ? { type: 'message', messageId } : undefined
            }
        case 'quote':
            return { ...common, kind: 'quote', description: reference.source }
        case 'image':
            return {
                ...common,
                kind: 'image',
                title: reference.name ?? common.title,
                resource: reference.url ? { type: 'url', url: reference.url } : undefined
            }
        case 'element':
            return {
                ...common,
                kind: 'web_page',
                title: reference.pageTitle ?? reference.pageUrl,
                description: reference.pageUrl,
                resource: { type: 'browser', serviceId: reference.serviceId, url: reference.pageUrl }
            }
        case 'file_element':
            return {
                ...common,
                kind: 'file_element',
                title: reference.documentTitle ?? reference.filePath,
                description: reference.filePath,
                resource: { type: 'workspace_file', workspacePath: reference.filePath }
            }
    }
}

function fileSource(value: unknown, messageId?: string, updatedAt?: string): ChatTaskSummarySource | undefined {
    if (!isObjectValue(value)) {
        return undefined
    }
    const file = value as FileAssetCandidate
    const id = readString(file.fileAssetId) ?? readString(file.id) ?? readString(file.storageFileId)
    const title = readString(file.originalName) ?? readString(file.name) ?? readString(file.fileName) ?? id
    if (!id || !title) {
        return undefined
    }
    const workspacePath = readString(file.workspacePath)
    return {
        id: `attachment:${id}`,
        kind: 'attachment',
        title,
        resource: workspacePath
            ? {
                  type: 'workspace_file',
                  workspacePath,
                  fileAssetId: readString(file.fileAssetId) ?? readString(file.id),
                  storageFileId: readString(file.storageFileId)
              }
            : messageId
              ? { type: 'message', messageId }
              : undefined,
        ...(messageId ? { messageId } : {}),
        ...(updatedAt ? { updatedAt } : {})
    }
}

function capabilitySources(value: unknown, messageId?: string, updatedAt?: string) {
    if (!isObjectValue(value)) {
        return []
    }
    const metadata = value as RuntimeCapabilitiesMetadata
    if (!isObjectValue(metadata.runtimeCapabilities)) {
        return []
    }
    const capabilities = metadata.runtimeCapabilities as RuntimeCapabilitiesCandidate
    const groups: Array<{ kind: ChatTaskSummarySourceKind; prefix: string; value: unknown }> = [
        { kind: 'skill', prefix: 'skill', value: capabilities.skills },
        { kind: 'plugin', prefix: 'plugin', value: capabilities.plugins }
    ]
    return groups.flatMap(({ kind, prefix, value: groupValue }) => {
        if (!isObjectValue(groupValue)) {
            return []
        }
        const group = groupValue as CapabilityIdsCandidate
        const ids = Array.isArray(group.ids) ? group.ids : Array.isArray(group.nodeKeys) ? group.nodeKeys : []
        return ids.flatMap((entry) => {
            const id = readString(entry)
            return id
                ? [
                      {
                          id: `${prefix}:${id}`,
                          kind,
                          title: id,
                          ...(messageId ? { messageId } : {}),
                          ...(updatedAt ? { updatedAt } : {})
                      } satisfies ChatTaskSummarySource
                  ]
                : []
        })
    })
}

function knowledgeSources(content: unknown, messageId?: string, updatedAt?: string) {
    const text = readMessageText(content)
    const sources: ChatTaskSummarySource[] = []
    for (const match of text.matchAll(MARKDOWN_LINK_PATTERN)) {
        const href = match[1]
        if (!href) {
            continue
        }
        try {
            const url = new URL(href)
            const documentId = url.searchParams.get('documentId')?.trim()
            if (!documentId) {
                continue
            }
            const title = url.searchParams.get('documentName')?.trim() || documentId
            sources.push({
                id: `knowledge:${documentId}:${url.searchParams.get('chunkId') ?? ''}`,
                kind: 'knowledge',
                title,
                description: url.searchParams.get('knowledgebaseId')?.trim() || undefined,
                ...(messageId ? { messageId } : {}),
                ...(updatedAt ? { updatedAt } : {})
            })
        } catch {
            // Ignore malformed citation URLs from historical messages.
        }
    }
    return sources
}

function dedupeById<T extends { id: string }>(items: T[]) {
    const seen = new Set<string>()
    return items.filter((item) => {
        if (seen.has(item.id)) {
            return false
        }
        seen.add(item.id)
        return true
    })
}

export function extractChatMessageTaskSummary(
    message: Pick<
        IChatMessage,
        | 'id'
        | 'content'
        | 'references'
        | 'fileAssets'
        | 'attachments'
        | 'thirdPartyMessage'
        | 'taskSummary'
        | 'createdAt'
        | 'updatedAt'
    >
): TChatTaskSummaryContribution {
    const messageId = readString(message.id)
    const updatedAt = toIsoString(message.updatedAt) ?? toIsoString(message.createdAt)
    const parts = readContentParts(message.content)
    const explicitContributions = parts.flatMap((part) => {
        if (part.type !== 'component' || !isObjectValue(part.data)) {
            return []
        }
        return readExplicitContribution(part.data as ComponentData, messageId, updatedAt) ?? []
    })
    const latestExplicit =
        normalizeContribution(message.taskSummary, messageId, updatedAt) ?? explicitContributions.at(-1)
    const plan = latestExplicit?.plan ?? extractPlan(message.content, messageId, updatedAt)
    const todos =
        latestExplicit?.todos ?? parts.flatMap((part) => extractTodos(part, messageId, updatedAt) ?? []).at(-1)
    const outputs = dedupeById([
        ...(latestExplicit?.outputs ?? []),
        ...parts.flatMap((part) => partOutputs(part, messageId, updatedAt))
    ])
    const sources = dedupeById([
        ...(latestExplicit?.sources ?? []),
        ...(message.references ?? []).map((reference) => referenceSource(reference, messageId, updatedAt)),
        ...(message.fileAssets ?? []).flatMap((file) => fileSource(file, messageId, updatedAt) ?? []),
        ...(message.attachments ?? []).flatMap((file) => fileSource(file, messageId, updatedAt) ?? []),
        ...capabilitySources(message.thirdPartyMessage, messageId, updatedAt),
        ...knowledgeSources(message.content, messageId, updatedAt)
    ])

    return {
        version: SUMMARY_VERSION,
        ...(plan ? { plan } : {}),
        ...(todos ? { todos } : {}),
        ...(outputs.length ? { outputs } : {}),
        ...(sources.length ? { sources } : {})
    }
}
