import {
    SANDBOX_JOB_PROGRESS_PREFIX,
    type SandboxJobProgress,
    type SandboxRuntimeOutputChunk
} from '@xpert-ai/plugin-sdk'

const MAX_STAGE_LENGTH = 64
const MAX_MESSAGE_LENGTH = 512
const MAX_BUFFER_LENGTH = 16 * 1024

/**
 * Decodes newline-delimited Action progress without coupling Core to one plugin.
 * Output chunks may split a line arbitrarily and stdout/stderr are buffered separately.
 */
export class SandboxJobProgressDecoder {
    private stdout = ''
    private stderr = ''

    push(output: SandboxRuntimeOutputChunk): SandboxJobProgress[] {
        const buffered = `${output.stream === 'stdout' ? this.stdout : this.stderr}${output.text}`
        const lines = buffered.split(/\r?\n/)
        const tail = lines.pop() ?? ''
        if (output.stream === 'stdout') this.stdout = boundedTail(tail)
        else this.stderr = boundedTail(tail)
        return lines.flatMap((line) => {
            const progress = parseSandboxJobProgress(line)
            return progress ? [progress] : []
        })
    }

    flush(): SandboxJobProgress[] {
        const lines = [this.stdout, this.stderr]
        this.stdout = ''
        this.stderr = ''
        return lines.flatMap((line) => {
            const progress = parseSandboxJobProgress(line)
            return progress ? [progress] : []
        })
    }
}

export function parseSandboxJobProgress(line: string): SandboxJobProgress | null {
    const normalized = line.trim()
    if (!normalized.startsWith(SANDBOX_JOB_PROGRESS_PREFIX)) return null
    let value: unknown
    try {
        value = JSON.parse(normalized.slice(SANDBOX_JOB_PROGRESS_PREFIX.length))
    } catch {
        return null
    }
    if (!value || typeof value !== 'object' || Array.isArray(value) || !('progress' in value)) return null
    if (
        typeof value.progress !== 'number' ||
        !Number.isFinite(value.progress) ||
        value.progress < 0 ||
        value.progress > 1
    ) {
        return null
    }
    const stage = boundedString('stage' in value ? value.stage : undefined, MAX_STAGE_LENGTH)
    const message = boundedString('message' in value ? value.message : undefined, MAX_MESSAGE_LENGTH)
    const current = workUnit('current' in value ? value.current : undefined)
    const total = workUnit('total' in value ? value.total : undefined)
    if (
        (current === undefined) !== (total === undefined) ||
        (current !== undefined && total !== undefined && current > total)
    ) {
        return null
    }
    return {
        progress: value.progress,
        ...(stage ? { stage } : {}),
        ...(message ? { message } : {}),
        ...(current !== undefined && total !== undefined ? { current, total } : {})
    }
}

export function lifecycleSandboxJobProgress(
    current: SandboxJobProgress | null | undefined,
    stage: string,
    progress = current?.progress ?? 0
): SandboxJobProgress {
    return {
        ...(current ?? {}),
        progress: Math.max(0, Math.min(1, progress)),
        stage,
        updatedAt: new Date().toISOString()
    }
}

export function timestampSandboxJobProgress(progress: SandboxJobProgress): SandboxJobProgress {
    return { ...progress, updatedAt: new Date().toISOString() }
}

function boundedTail(value: string): string {
    return value.length <= MAX_BUFFER_LENGTH ? value : value.slice(-MAX_BUFFER_LENGTH)
}

function boundedString(value: unknown, maxLength: number): string | undefined {
    return typeof value === 'string' && value.length > 0 && value.length <= maxLength ? value : undefined
}

function workUnit(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined
}
