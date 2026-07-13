import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { resolveLoadedPluginBundleRoot } from '@xpert-ai/server-core'
import { SandboxActionRegistry } from './sandbox-action.registry'

describe('SandboxActionRegistry', () => {
    it('resolves and verifies a system plugin Action Bundle', async () => {
        const root = createPlugin('system')
        try {
            const plugin = loadedPlugin(root, 'system')
            expect(resolveLoadedPluginBundleRoot(plugin)).toBe(root)
            const registry = new SandboxActionRegistry([plugin])
            const action = await registry.get({
                pluginName: '@acme/plugin-export',
                action: 'document.export',
                actionVersion: '1.0.0'
            })
            expect(action).toMatchObject({
                runtimeProfile: 'browser/playwright-1.61/v1',
                entrypoint: 'runner.mjs',
                files: [{ relativePath: 'runner.mjs' }]
            })
            const first = await registry.getCachedBundle(action!)
            fs.rmSync(path.join(root, 'dist', 'sandbox-actions', 'document-export', 'bundle', 'runner.mjs'))
            await expect(registry.getCachedBundle(action!)).resolves.toBe(first)
        } finally {
            fs.rmSync(root, { recursive: true, force: true })
        }
    })

    it('does not expose organization plugin actions', async () => {
        const root = createPlugin('organization')
        try {
            const registry = new SandboxActionRegistry([loadedPlugin(root, 'organization')])
            await expect(
                registry.get({
                    pluginName: '@acme/plugin-export',
                    action: 'document.export',
                    actionVersion: '1.0.0'
                })
            ).resolves.toBeNull()
        } finally {
            fs.rmSync(root, { recursive: true, force: true })
        }
    })

    it('rejects Action attempts to override Runtime-provided Playwright', async () => {
        const root = createPlugin('system')
        try {
            const override = path.join(
                root,
                'dist',
                'sandbox-actions',
                'document-export',
                'bundle',
                'node_modules',
                'playwright-core'
            )
            fs.mkdirSync(override, { recursive: true })
            fs.writeFileSync(path.join(override, 'package.json'), '{}')
            const registry = new SandboxActionRegistry([loadedPlugin(root, 'system')])
            await expect(
                registry.get({
                    pluginName: '@acme/plugin-export',
                    action: 'document.export',
                    actionVersion: '1.0.0'
                })
            ).rejects.toThrow('cannot override Runtime-provided playwright-core')
        } finally {
            fs.rmSync(root, { recursive: true, force: true })
        }
    })
})

function createPlugin(_level: 'system' | 'organization'): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-action-plugin-'))
    const manifestDirectory = path.join(root, '.xpertai-plugin')
    const actionDirectory = path.join(root, 'dist', 'sandbox-actions', 'document-export')
    const bundleDirectory = path.join(actionDirectory, 'bundle')
    fs.mkdirSync(manifestDirectory, { recursive: true })
    fs.mkdirSync(bundleDirectory, { recursive: true })
    const runner = Buffer.from('process.stdout.write("ok")\n')
    fs.writeFileSync(path.join(bundleDirectory, 'runner.mjs'), runner)
    const fileHash = createHash('sha256').update(runner).digest('hex')
    const treeHash = createHash('sha256').update(`runner.mjs\0${runner.length}\0${fileHash}\n`).digest('hex')
    fs.writeFileSync(
        path.join(actionDirectory, 'action.json'),
        JSON.stringify({
            name: 'document.export',
            version: '1.0.0',
            runtimeProfile: 'browser/playwright-1.61/v1',
            runtimeContractVersion: '1',
            playwrightVersion: '1.61.0',
            bundle: './bundle',
            entrypoint: 'runner.mjs',
            bundleSha256: treeHash
        })
    )
    fs.writeFileSync(
        path.join(manifestDirectory, 'plugin.json'),
        JSON.stringify({
            name: '@acme/plugin-export',
            sandboxActions: './dist/sandbox-actions/document-export/action.json'
        })
    )
    return root
}

function loadedPlugin(root: string, level: 'system' | 'organization') {
    return {
        organizationId: 'global',
        name: '@acme/plugin-export',
        packageName: '@acme/plugin-export',
        baseDir: root,
        level,
        instance: null,
        ctx: null
    }
}
