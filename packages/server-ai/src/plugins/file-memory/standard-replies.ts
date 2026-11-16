import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod/v3'
import { memoryRevision } from './dream-review'
import type { FileMemoryService } from './file-memory.service'
import { createFileMemoryScopeKey, type FileMemoryXpertScope } from './ports'
import { writeMemoryFileAtomically } from './write-memory-file'

const question = z.string().trim().min(1).max(500)
const fields = z
    .object({
        question,
        aliases: z.array(question).max(30),
        answer: z.string().trim().min(1).max(32000)
    })
    .strict()
const approval = fields.extend({
    memoryId: z.string(),
    id: z.string().uuid(),
    revision: z.string(),
    approvedAt: z.string().datetime()
})
export const configureReply = z
    .object({
        id: z.string().min(1).max(240),
        revision: z.string().regex(/^[a-f0-9]{64}$/),
        approvalId: z.string().uuid().nullable(),
        reply: fields.nullable()
    })
    .strict()

function key(value: string) {
    return value
        .normalize('NFC')
        .trim()
        .replace(/[?？]$/u, '')
        .trimEnd()
}
function keys(reply: z.infer<typeof fields>) {
    return [reply.question, ...reply.aliases].map(key)
}

// Approvals are private server data. Editable workspace Markdown can supply evidence, never approval.
export class StandardReplies {
    constructor(
        private readonly memory: FileMemoryService,
        private readonly directory: string
    ) {}

    private file(scope: FileMemoryXpertScope) {
        const hash = createHash('sha256').update(createFileMemoryScopeKey(scope)).digest('hex')
        return path.join(this.directory, hash + '.json')
    }

    private async read(scope: FileMemoryXpertScope) {
        try {
            return z.array(approval).parse(JSON.parse(await fs.readFile(this.file(scope), 'utf8')))
        } catch (e) {
            if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []
            throw e
        }
    }

    async detail(scope: FileMemoryXpertScope, memoryId: string, revision: string, status: string) {
        const entry = (await this.read(scope)).find((r) => r.memoryId === memoryId)
        return entry && { ...entry, active: status === 'active' && entry.revision === revision }
    }

    async configure(scope: FileMemoryXpertScope, input: z.infer<typeof configureReply>) {
        return this.memory.withTopicWriteLock(scope, async () => {
            const records = await this.memory.listTopicRecords(scope)
            const note = records.find((r) => r.document.frontmatter.id === input.id)?.document
            if (!note) throw new NotFoundException()
            const entries = await this.read(scope)
            const previous = entries.find((r) => r.memoryId === input.id)
            if (input.revision !== memoryRevision(note) || input.approvalId !== (previous?.id ?? null))
                throw new ConflictException('Memory or approval changed. Refresh before saving.')
            const others = entries.filter((r) => r.memoryId !== input.id)
            if (input.reply) {
                if (note.frontmatter.status !== 'active' || !note.body.includes(input.reply.answer))
                    throw new BadRequestException('Choose an exact passage from an active note.')
                const questions = keys(input.reply)
                if (questions.includes('') || new Set(questions).size !== questions.length)
                    throw new BadRequestException('Each question must be distinct and nonempty.')
                if (
                    others.some(
                        (r) =>
                            keys(r).some((k) => questions.includes(k)) &&
                            records.some(
                                ({ document }) =>
                                    document.frontmatter.id === r.memoryId &&
                                    document.frontmatter.status === 'active' &&
                                    memoryRevision(document) === r.revision
                            )
                    )
                )
                    throw new ConflictException('Another active reply already uses this question.')
                others.push({
                    ...input.reply,
                    memoryId: input.id,
                    revision: input.revision,
                    id: randomUUID(),
                    approvedAt: new Date().toISOString()
                })
            }
            await writeMemoryFileAtomically(this.file(scope), JSON.stringify(others))
            return { id: input.id }
        })
    }

    async resolve(scope: FileMemoryXpertScope, text: string) {
        const normalized = key(text)
        if (!normalized || normalized.length > 500) return
        const candidates = (await this.read(scope)).filter((r) => keys(r).includes(normalized))
        if (!candidates.length) return
        const notes = await this.memory.listTopicRecords(scope)
        const matches = candidates.filter((r) =>
            notes.some(
                ({ document }) =>
                    document.frontmatter.id === r.memoryId &&
                    document.frontmatter.status === 'active' &&
                    memoryRevision(document) === r.revision &&
                    document.body.includes(r.answer)
            )
        )
        if (matches.length === 1) {
            const { answer, id, memoryId, revision } = matches[0]
            return { kind: 'approved' as const, text: answer, source: { type: 'memory_reply', id, memoryId, revision } }
        }
        const current =
            candidates.length === 1
                ? notes.find(
                      ({ document }) =>
                          document.frontmatter.id === candidates[0].memoryId && document.frontmatter.status === 'active'
                  )?.document
                : undefined
        return { kind: 'inactive' as const, current: current?.body.trim() }
    }
}
