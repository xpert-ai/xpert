// Independent API-process fixture: use the production storage and Volume implementations.
require('ts-node').register({ project: process.env.TS_NODE_PROJECT, transpileOnly: true })
require('tsconfig-paths/register')
const path = require('node:path')
const { VolumeHandle } = require('../volume.ts')
const { VolumeWorkspaceStorage } = require('../workspace-storage.ts')

async function main() {
    const root = process.argv[2]
    const scope = { tenantId: 'tenant', catalog: 'user-xperts', userId: 'alice', xpertId: 'assistant' }
    const volume = new VolumeHandle(scope, path.join(root, 'workspace'), '', '', root)
    const store = new VolumeWorkspaceStorage(async () => volume, 'meetings')
    for (let i = 0; i < 8; i++) {
        await store.withLock('counter', async () => {
            const n = Number((await store.read('counter')).toString())
            await new Promise((resolve) => setTimeout(resolve, 10))
            await store.write('counter', String(n + 1))
        })
    }
}
main().catch((error) => {
    console.error(error)
    process.exitCode = 1
})
