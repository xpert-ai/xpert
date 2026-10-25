import { Controller, Get, INestApplication, Logger } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { mkdtemp, rm, writeFile, chmod } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { assertAgentPluginStorage } from './agent-plugin-storage-error'
import { portablePackageDigest } from './portable-package-files'

let stored: { rootPath: string; digest: string }
@Controller()
class StorageFixtureController {
    @Get('/package')
    async package() {
        await assertAgentPluginStorage(stored)
        return { ready: true }
    }
    @Get('/unrelated')
    unrelated() {
        return { ready: true }
    }
}

describe('package storage HTTP errors', () => {
    let app: INestApplication
    let root: string
    let origin: string
    beforeAll(async () => {
        jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
        app = (
            await Test.createTestingModule({ controllers: [StorageFixtureController] }).compile()
        ).createNestApplication()
        await app.listen(0, '127.0.0.1')
        origin = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`
    })
    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'plugin-http-'))
        await writeFile(join(root, 'plugin.json'), '{"name":"example"}')
        stored = { rootPath: root, digest: await portablePackageDigest(root) }
    })
    afterEach(async () => {
        await chmod(root, 0o700).catch(() => undefined)
        await rm(root, { recursive: true, force: true })
    })
    afterAll(async () => {
        await app.close()
        jest.restoreAllMocks()
    })
    it.each(['missing', 'unreadable', 'corrupt'] as const)(
        'returns safe %s classification while unrelated requests stay available',
        async (fault) => {
            if (fault === 'missing') await rm(root, { recursive: true })
            if (fault === 'unreadable') await chmod(root, 0)
            if (fault === 'corrupt') await writeFile(join(root, 'plugin.json'), 'corrupt')
            const response = await fetch(`${origin}/package`)
            expect(response.status).toBe(fault === 'corrupt' ? 409 : 503)
            const body = await response.json()
            expect(body).toMatchObject({
                code: `AGENT_PLUGIN_STORAGE_${fault.toUpperCase()}`,
                message: expect.any(String)
            })
            expect(JSON.stringify(body)).not.toContain(root)
            expect(JSON.stringify(body)).not.toContain(stored.digest)
            const unrelated = await fetch(`${origin}/unrelated`)
            expect(unrelated.status).toBe(200)
            expect(await unrelated.json()).toEqual({ ready: true })
        }
    )
})
