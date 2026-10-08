import { Inject, Injectable } from '@nestjs/common'
import { createHash, randomUUID } from 'node:crypto'
import { link, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { RequestContext, type KnowledgeUploadSessionsApi, type KnowledgeUploadSession } from '@xpert-ai/plugin-sdk'
import { KnowledgebaseService } from '../knowledgebase.service'
import { VOLUME_CLIENT, VolumeClient, VolumeHandle } from '../../shared/volume/volume'

const CHUNK_SIZE = 4 * 1024 * 1024
const manifestSchema = z.object({
    id: z.string().uuid(),
    name: z.string(),
    size: z
        .number()
        .int()
        .positive()
        .max(2 * 1024 ** 3),
    chunkSize: z.literal(CHUNK_SIZE)
})
const identitySchema = z.object({ knowledgebaseId: z.string().uuid(), sessionId: z.string().uuid() })

/** Parts are immutable and atomically published; retries and process restarts preserve acknowledged bytes. */
@Injectable()
export class KnowledgeUploadSessionsService implements KnowledgeUploadSessionsApi {
    constructor(
        private readonly knowledge: KnowledgebaseService,
        @Inject(VOLUME_CLIENT) private readonly volumes: VolumeClient
    ) {}

    private async root(knowledgebaseId: string) {
        z.string().uuid().parse(knowledgebaseId)
        await this.knowledge.assertKnowledgebaseWriteAccess(knowledgebaseId, { select: { id: true } })
        await this.knowledge.assertNotRebuilding(knowledgebaseId)
        const tenantId = RequestContext.currentTenantId()
        if (!tenantId) throw new Error('Upload scope unavailable')
        const volume = await this.volumes
            .resolve({ tenantId, catalog: 'knowledges', knowledgeId: knowledgebaseId })
            .ensureRoot()
        const root = path.join(volume.serverRoot, '.upload-sessions')
        await VolumeHandle.ensureDirectory(volume.serverRoot, '.upload-sessions')
        return root
    }

    private async session(input: { knowledgebaseId: string; sessionId: string }) {
        identitySchema.parse(input)
        const root = await this.root(input.knowledgebaseId)
        const dir = await VolumeHandle.resolveExistingPath(root, input.sessionId)
        const manifest = manifestSchema.parse(JSON.parse((await safeRead(dir, 'manifest.json')).toString('utf8')))
        if (manifest.id !== input.sessionId) throw new Error('Invalid upload identity')
        return { dir, manifest }
    }

    async create(input: { knowledgebaseId: string; name: string; size: number }) {
        const manifest = manifestSchema.parse({
            id: randomUUID(),
            name: input.name.slice(0, 512),
            size: input.size,
            chunkSize: CHUNK_SIZE
        })
        const dir = path.join(await this.root(input.knowledgebaseId), manifest.id)
        await mkdir(dir, { mode: 0o700 })
        await writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest), { flag: 'wx', mode: 0o600 })
        return {
            id: manifest.id,
            name: manifest.name,
            size: manifest.size,
            chunkSize: CHUNK_SIZE,
            received: [],
            partHashes: {},
            complete: false
        }
    }

    async status(input: { knowledgebaseId: string; sessionId: string }): Promise<KnowledgeUploadSession> {
        const { dir, manifest } = await this.session(input)
        const files = await readdir(dir)
        const received = files
            .filter((name) => /^\d+\.part$/.test(name))
            .map((name) => Number(name.split('.')[0]))
            .sort((a, b) => a - b)
        const sha256 = files.includes('complete')
            ? (await safeRead(dir, 'complete')).toString('utf8').trim()
            : undefined
        const partHashes: Record<string, string> = {}
        for (const index of received) partHashes[index] = hash(await safeRead(dir, `${index}.part`))
        return {
            id: manifest.id,
            name: manifest.name,
            size: manifest.size,
            chunkSize: CHUNK_SIZE,
            received,
            partHashes,
            complete: Boolean(sha256),
            ...(sha256 ? { sha256 } : {})
        }
    }

    async append(input: { knowledgebaseId: string; sessionId: string; index: number; buffer: Buffer; sha256: string }) {
        const { dir, manifest } = await this.session(input)
        const expected = Math.min(CHUNK_SIZE, manifest.size - input.index * CHUNK_SIZE)
        if (
            !Number.isInteger(input.index) ||
            input.index < 0 ||
            expected <= 0 ||
            input.buffer.length !== expected ||
            hash(input.buffer) !== input.sha256
        )
            throw new Error('Invalid upload part')
        const target = path.join(dir, `${input.index}.part`)
        const temporary = path.join(dir, `${randomUUID()}.pending`)
        await writeFile(temporary, input.buffer, { flag: 'wx', mode: 0o600 })
        try {
            try {
                await link(temporary, target)
            } catch (error) {
                if (!isExistingFile(error)) throw error
                if (hash(await safeRead(dir, `${input.index}.part`)) !== input.sha256)
                    throw new Error('Upload part conflicts with previously received bytes')
            }
        } finally {
            await rm(temporary, { force: true })
        }
    }

    async complete(input: { knowledgebaseId: string; sessionId: string }) {
        const { dir, manifest } = await this.session(input)
        const digest = createHash('sha256')
        for (let index = 0; index < Math.ceil(manifest.size / CHUNK_SIZE); index++) {
            const part = await safeRead(dir, `${index}.part`)
            if (part.length !== Math.min(CHUNK_SIZE, manifest.size - index * CHUNK_SIZE))
                throw new Error('Upload is incomplete')
            digest.update(part)
        }
        const temporary = path.join(dir, `${randomUUID()}.pending`)
        await writeFile(temporary, digest.digest('hex'), { flag: 'wx', mode: 0o600 })
        try {
            await link(temporary, path.join(dir, 'complete'))
        } catch (error) {
            if (!isExistingFile(error)) throw error
        } finally {
            await rm(temporary, { force: true })
        }
        return this.status(input)
    }

    async read(input: { knowledgebaseId: string; sessionId: string; offset: number; length: number }) {
        const { dir, manifest } = await this.session(input)
        if (
            !Number.isSafeInteger(input.offset) ||
            !Number.isSafeInteger(input.length) ||
            input.offset < 0 ||
            input.length < 0 ||
            input.length > CHUNK_SIZE ||
            input.offset + input.length > manifest.size
        )
            throw new Error('Invalid upload read range')
        await safeRead(dir, 'complete')
        const result = Buffer.alloc(input.length)
        for (let written = 0; written < input.length; ) {
            const offset = input.offset + written,
                index = Math.floor(offset / CHUNK_SIZE)
            const part = await safeRead(dir, `${index}.part`)
            const count = Math.min(part.length - (offset % CHUNK_SIZE), input.length - written)
            if (count <= 0) throw new Error('Upload part is incomplete')
            part.copy(result, written, offset % CHUNK_SIZE, (offset % CHUNK_SIZE) + count)
            written += count
        }
        return result
    }

    async remove(input: { knowledgebaseId: string; sessionId: string }) {
        const { dir } = await this.session(input)
        await rm(dir, { recursive: true, force: true })
    }
}
function hash(buffer: Buffer) {
    return createHash('sha256').update(buffer).digest('hex')
}
function isExistingFile(error: unknown) {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST'
}
async function safeRead(root: string, name: string) {
    const opened = await VolumeHandle.openExistingFile(root, name)
    try {
        if (!opened.fileStat.isFile()) throw Error('Invalid upload file')
        return await opened.fileHandle.readFile()
    } finally {
        await opened.fileHandle.close()
    }
}
