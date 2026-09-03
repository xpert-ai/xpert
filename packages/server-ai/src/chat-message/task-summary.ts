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
const WEB_SEARCH_RESULT_PATTERN = /^Title:\s*(.+?)\r?\nURL:\s*(https?:\/\/\S+)\s*$/gim
const SANDBOX_FILE_OUTPUT_TOOLS = new Set([
    'sandbox_write_file',
    'sandbox_append_file',
    'sandbox_edit_file',
    'sandbox_multi_edit_file'
])

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
    output?: unknown
    status?: unknown
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
    status?: unknown
    files?: unknown
    workspacePath?: unknown
    filePath?: unknown
    fileAssetId?: unknown
    storageFileId?: unknown
    name?: unknown
    originalName?: unknown
    fileName?: unknown
    mimeType?: unknown
    extension?: unknown
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

type SandboxFileInputCandidate = {
    file_path?: unknown
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
    const rawStatus = readString(output.status)?.toLowerCase()
    const status = rawStatus === 'success' ? rawStatus : undefined
    const resource = normalizeResource(output.resource)
    if (
        !id ||
        !title ||
        !isOutputKind(output.kind) ||
        (rawStatus !== undefined && rawStatus !== 'success') ||
        !isOpenableOutputResource(resource)
    ) {
        return undefined
    }
    return {
        id,
        kind: output.kind,
        title: compactText(title, 160),
        description: readString(output.description),
        status,
        resource,
        messageId: readString(output.messageId) ?? messageId,
        updatedAt: toIsoString(output.updatedAt) ?? updatedAt
    }
}

export function isCompletedOpenableTaskSummaryOutput(output: ChatTaskSummaryOutput) {
    return (output.status === undefined || output.status === 'success') && isOpenableOutputResource(output.resource)
}

function isOpenableOutputResource(
    resource: ChatTaskSummaryOutput['resource']
): resource is NonNullable<ChatTaskSummaryOutput['resource']> {
    return resource?.type === 'workspace_file' || resource?.type === 'artifact' || resource?.type === 'url'
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
    if (!isCompletedOutputStatus(artifact.status)) {
        return undefined
    }
    const artifactId = readString(artifact.artifactId) ?? readString(artifact.id)
    const workspacePath = readString(artifact.workspacePath) ?? readString(artifact.filePath)
    const fileId = readString(artifact.fileAssetId) ?? readString(artifact.storageFileId)
    const id = artifactId ?? fileId ?? workspacePath
    const title =
        readString(artifact.title) ??
        readString(artifact.originalName) ??
        readString(artifact.name) ??
        readString(artifact.fileName) ??
        fileNameFromPath(workspacePath) ??
        id
    if (!id || !title) {
        return undefined
    }
    const kind = artifactKind(artifact)
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

function artifactOutputs(value: unknown, messageId?: string, updatedAt?: string): ChatTaskSummaryOutput[] {
    if (!isObjectValue(value)) {
        return []
    }
    const artifact = value as ArtifactCandidate
    if (!isCompletedOutputStatus(artifact.status)) {
        return []
    }
    const output = artifactOutput(value, messageId, updatedAt)
    const files = Array.isArray(artifact.files)
        ? artifact.files.flatMap((file) => artifactOutput(file, messageId, updatedAt) ?? [])
        : []
    return [...(output ? [output] : []), ...files]
}

function isCompletedOutputStatus(value: unknown) {
    const status = readString(value)?.toLowerCase()
    return status === undefined || status === 'success'
}

function parseStructuredOutput(value: unknown): Record<string, unknown> | undefined {
    if (isObjectValue(value)) {
        return value as Record<string, unknown>
    }
    if (typeof value !== 'string' || !value.trim()) {
        return undefined
    }
    try {
        const parsed = JSON.parse(value)
        return isObjectValue(parsed) ? (parsed as Record<string, unknown>) : undefined
    } catch {
        return undefined
    }
}

function structuredToolOutputs(data: ComponentData, messageId?: string, updatedAt?: string) {
    const sandboxOutput = sandboxFileOutput(data, messageId, updatedAt)
    if (sandboxOutput) {
        return [sandboxOutput]
    }

    const payload = parseStructuredOutput(data.output)
    if (!payload) {
        return []
    }

    const tool = readString(data.tool)
    const outputs: ChatTaskSummaryOutput[] = []
    if (tool === 'drawio_publish_artifact_link' && readString(payload.artifactId)) {
        const output = artifactOutput(
            {
                ...payload,
                kind: 'html',
                title: readString(payload.title) ?? 'draw.io diagram'
            },
            messageId,
            updatedAt
        )
        if (output) {
            outputs.push(output)
        }
    }

    if (!outputs.length) {
        outputs.push(...artifactOutputs(payload, messageId, updatedAt))
        outputs.push(...artifactOutputs(payload.artifact, messageId, updatedAt))
        outputs.push(...artifactOutputs(payload.file, messageId, updatedAt))
    }
    return outputs
}

function sandboxFileOutput(
    data: ComponentData,
    messageId?: string,
    updatedAt?: string
): ChatTaskSummaryOutput | undefined {
    const tool = readString(data.tool)
    const status = readString(data.status)?.toLowerCase()
    if (!tool || !SANDBOX_FILE_OUTPUT_TOOLS.has(tool) || status !== 'success' || !isObjectValue(data.input)) {
        return undefined
    }
    const workspacePath = portableWorkspacePath((data.input as SandboxFileInputCandidate).file_path)
    if (!workspacePath) {
        return undefined
    }
    return {
        id: `workspace-file:${workspacePath}`,
        kind: artifactKind({ fileName: workspacePath }),
        title: fileNameFromPath(workspacePath) ?? workspacePath,
        status: 'success',
        resource: { type: 'workspace_file', workspacePath },
        ...(messageId ? { messageId } : {}),
        ...(updatedAt ? { updatedAt } : {})
    }
}

function portableWorkspacePath(value: unknown) {
    const path = readString(value)
        ?.replace(/\\/g, '/')
        .replace(/^\.\/+/, '')
        .replace(/\/{2,}/g, '/')
    if (
        !path ||
        path.startsWith('/') ||
        /^[a-z]:\//i.test(path) ||
        path.split('/').some((segment) => segment === '..')
    ) {
        return undefined
    }
    return path
}

function artifactKind(artifact: ArtifactCandidate): ChatTaskSummaryOutputKind {
    const explicitKind = mapArtifactKind(artifact.kind)
    if (explicitKind) {
        return explicitKind
    }
    const mimeType = readString(artifact.mimeType)?.toLowerCase()
    if (mimeType) {
        if (mimeType === 'text/html') {
            return 'site'
        }
        if (mimeType.startsWith('image/')) {
            return 'image'
        }
        if (mimeType === 'text/csv' || mimeType.includes('spreadsheet') || mimeType.includes('excel')) {
            return 'spreadsheet'
        }
        if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) {
            return 'presentation'
        }
        if (
            mimeType === 'application/pdf' ||
            mimeType === 'text/markdown' ||
            mimeType === 'text/plain' ||
            mimeType.includes('wordprocessingml') ||
            mimeType.includes('msword') ||
            mimeType.includes('opendocument.text')
        ) {
            return 'document'
        }
    }
    const extension = artifactExtension(artifact)
    if (['html', 'htm'].includes(extension)) {
        return 'site'
    }
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif'].includes(extension)) {
        return 'image'
    }
    if (['csv', 'xls', 'xlsx', 'ods'].includes(extension)) {
        return 'spreadsheet'
    }
    if (['ppt', 'pptx', 'odp'].includes(extension)) {
        return 'presentation'
    }
    if (['pdf', 'doc', 'docx', 'md', 'markdown', 'txt', 'rtf', 'odt'].includes(extension)) {
        return 'document'
    }
    return 'file'
}

function artifactExtension(artifact: ArtifactCandidate) {
    const explicit = readString(artifact.extension)?.replace(/^\./, '').toLowerCase()
    if (explicit) {
        return explicit
    }
    const fileName =
        readString(artifact.fileName) ??
        readString(artifact.originalName) ??
        readString(artifact.name) ??
        readString(artifact.workspacePath) ??
        readString(artifact.filePath)
    const match = fileName?.match(/\.([^./\\]+)$/)
    return match?.[1]?.toLowerCase() ?? ''
}

function fileNameFromPath(value: string | undefined) {
    return value?.split(/[/\\]/).filter(Boolean).at(-1)
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
    outputs.push(...artifactOutputs(data.artifact, messageId, updatedAt))
    outputs.push(...artifactOutputs(data.artifactLink, messageId, updatedAt))
    outputs.push(...artifactOutputs(data.file, messageId, updatedAt))
    outputs.push(...structuredToolOutputs(data, messageId, updatedAt))
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

function webSearchSources(part: MessageContentPart, messageId?: string, updatedAt?: string) {
    if (part.type !== 'component' || !isObjectValue(part.data)) {
        return []
    }
    const data = part.data as ComponentData
    if (data.tool !== 'web_search' || readString(data.status)?.toLowerCase() !== 'success') {
        return []
    }
    const output = readString(data.output)
    if (!output) {
        return []
    }
    const sources: ChatTaskSummarySource[] = []
    for (const match of output.matchAll(WEB_SEARCH_RESULT_PATTERN)) {
        const rawTitle = readString(match[1])
        const url = httpUrl(match[2])
        if (!url) {
            continue
        }
        const title = rawTitle && rawTitle.toLowerCase() !== 'n/a' ? rawTitle : new URL(url).hostname
        sources.push({
            id: `web:${url}`,
            kind: 'web_page',
            title: compactText(title, 160),
            description: url,
            resource: { type: 'url', url },
            ...(messageId ? { messageId } : {}),
            ...(updatedAt ? { updatedAt } : {})
        })
    }
    return sources
}

function httpUrl(value: unknown) {
    const url = readString(value)
    if (!url) {
        return undefined
    }
    try {
        const parsed = new URL(url)
        return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? url : undefined
    } catch {
        return undefined
    }
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
        ...parts.flatMap((part) => webSearchSources(part, messageId, updatedAt)),
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
