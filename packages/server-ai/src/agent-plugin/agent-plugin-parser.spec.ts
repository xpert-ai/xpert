import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseAgentPlugin } from './agent-plugin-parser'

const schema = 'https://agent-plugins.org/schemas/1.0.0/'
describe('portable Agent Plugins 1.0.0', () => {
    let root: string
    const json = (path: string, value: object) => writeFile(join(root, path), JSON.stringify(value))
    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'agent-plugin-test-'))
        await json('plugin.json', { $schema: schema + 'plugin.schema.json', name: 'example' })
    })
    afterEach(() => rm(root, { recursive: true, force: true }))
    it.each([undefined, 'capability', 'assistant', 'subagent'])(
        'preserves the optional package role %p in both extension versions',
        async (role) => {
            for (const version of [1, 2]) {
                const extension = { version, ...(role ? { role } : {}) }
                await json('plugin.json', {
                    $schema: schema + 'plugin.schema.json',
                    name: 'example',
                    extensions: { xpertai: extension }
                })
                const parsed = await parseAgentPlugin(root)
                expect(parsed.extension).toEqual(extension)
                expect(parsed.diagnostics).toEqual([])
            }
        }
    )
    it.each(['connector', ['assistant'], null, 1])('reports invalid package role %p', async (role) => {
        await json('plugin.json', {
            $schema: schema + 'plugin.schema.json',
            name: 'example',
            extensions: { xpertai: { version: 2, role } }
        })
        const parsed = await parseAgentPlugin(root)
        expect(parsed.extension).toBeUndefined()
        expect(parsed.diagnostics).toEqual([
            expect.objectContaining({ component: 'xpertai', code: 'invalid_extension' })
        ])
    })
    it('accepts localized interface metadata while preserving stable package identity', async () => {
        await json('plugin.json', {
            $schema: schema + 'plugin.schema.json',
            name: 'office',
            extensions: {
                xpertai: {
                    version: 2,
                    interface: {
                        displayName: { en_US: 'Office', zh_Hans: '办公室' },
                        description: { en_US: 'Office work' }
                    }
                }
            }
        })
        const result = await parseAgentPlugin(root)
        expect(result.name).toBe('office')
        expect(result.extension?.interface?.displayName).toEqual({ en_US: 'Office', zh_Hans: '办公室' })
    })
    it('discovers skills without package.json and ignores native manifest overrides', async () => {
        await mkdir(join(root, 'skills/hello'), { recursive: true })
        await writeFile(join(root, 'skills/hello/SKILL.md'), '---\nname: hello\ndescription: Say hello\n---\nHello')
        await mkdir(join(root, '.xpertai-plugin'))
        await json('.xpertai-plugin/plugin.json', { name: 'override', skills: './elsewhere' })
        const parsed = await parseAgentPlugin(root)
        expect(parsed.name).toBe('example')
        expect(parsed.skills.map((skill) => skill.key)).toEqual(['hello'])
    })
    it('rejects unrecognized schema versions', async () => {
        await json('plugin.json', { $schema: schema.replace('1.0.0', '1.1.0') + 'plugin.schema.json', name: 'example' })
        await expect(parseAgentPlugin(root)).rejects.toThrow()
    })
    it('ignores unknown manifest fields and opaque extension namespaces', async () => {
        await json('plugin.json', {
            $schema: schema + 'plugin.schema.json',
            name: 'example',
            skills: './override',
            extensions: { 'com.unknown': 'opaque' }
        })
        const parsed = await parseAgentPlugin(root)
        expect(parsed.diagnostics[0].code).toBe('unknown_field')
    })
    it.each(['xpertai', 'cn.xpertai'])('loads the %s host extension', async (namespace) => {
        const extension = {
            version: 1,
            interface: { displayName: 'Documents', icon: 'data:image/png;base64,example' },
            middlewares: [{ key: 'files', provider: 'SandboxFile', options: {} }],
            experts: [{ key: 'reviewer', reference: 'document-reviewer' }],
            connectors: { search: { type: 'mcp_oauth', scopes: ['read'] } }
        }
        await json('plugin.json', {
            $schema: schema + 'plugin.schema.json',
            name: 'example',
            extensions: { [namespace]: extension, 'com.unknown': 'opaque' }
        })
        const parsed = await parseAgentPlugin(root)
        expect(parsed.extension).toEqual(extension)
        expect(parsed.diagnostics).toEqual([])
    })
    it('prefers xpertai without merging the legacy extension', async () => {
        const extension = { version: 1, interface: { displayName: 'Current' } }
        await json('plugin.json', {
            $schema: schema + 'plugin.schema.json',
            name: 'example',
            extensions: {
                xpertai: extension,
                'cn.xpertai': { version: 1, middlewares: [{ key: 'files', provider: 'SandboxFile' }] }
            }
        })
        const parsed = await parseAgentPlugin(root)
        expect(parsed.extension).toEqual(extension)
        expect(parsed.diagnostics).toEqual([])
    })
    it.each([null, { version: 3 }])(
        'reports invalid xpertai without falling back to the legacy key: %p',
        async (extension) => {
            await json('plugin.json', {
                $schema: schema + 'plugin.schema.json',
                name: 'example',
                extensions: { xpertai: extension, 'cn.xpertai': { version: 1 } }
            })
            const parsed = await parseAgentPlugin(root)
            expect(parsed.extension).toBeUndefined()
            expect(parsed.diagnostics).toEqual([
                expect.objectContaining({ component: 'xpertai', code: 'invalid_extension' })
            ])
        }
    )
    it('attributes invalid legacy extension diagnostics to the legacy key', async () => {
        await json('plugin.json', {
            $schema: schema + 'plugin.schema.json',
            name: 'example',
            extensions: { 'cn.xpertai': { version: 3 } }
        })
        const parsed = await parseAgentPlugin(root)
        expect(parsed.extension).toBeUndefined()
        expect(parsed.diagnostics).toEqual([
            expect.objectContaining({ component: 'cn.xpertai', code: 'invalid_extension' })
        ])
    })
    it.each([undefined, 'engineering'])('discovers version 2 templates with category %s', async (category) => {
        await mkdir(join(root, 'templates'))
        await json('templates/assistant.json', {
            team: { type: 'agent', name: 'Example' },
            nodes: [],
            connections: [],
            template: { schemaVersion: 2 }
        })
        await json('plugin.json', {
            $schema: schema + 'plugin.schema.json',
            name: 'example',
            extensions: {
                xpertai: {
                    version: 2,
                    templates: [{ key: 'example', path: 'templates/assistant.json', ...(category ? { category } : {}) }]
                }
            }
        })
        const result = await parseAgentPlugin(root)
        expect(result.templates).toEqual([
            { key: 'example', path: 'templates/assistant.json', ...(category ? { category } : {}) }
        ])
        expect(result.diagnostics).toEqual([])
    })
    it.each(['', '   ', 42, 'x'.repeat(101)])('rejects an invalid template category %s', async (category) => {
        await json('plugin.json', {
            $schema: schema + 'plugin.schema.json',
            name: 'example',
            extensions: {
                xpertai: { version: 2, templates: [{ key: 'example', path: 'templates/assistant.json', category }] }
            }
        })
        expect((await parseAgentPlugin(root)).diagnostics[0].code).toBe('invalid_extension')
    })
    it('isolates malformed and escaping templates from valid siblings', async () => {
        await mkdir(join(root, 'templates'))
        await json('templates/good.json', {
            team: { type: 'agent' },
            nodes: [],
            connections: [],
            template: { schemaVersion: 2 }
        })
        await json('templates/bad.json', { template: { schemaVersion: 99 } })
        await symlink('/etc/hosts', join(root, 'templates/escape.json'))
        await json('plugin.json', {
            $schema: schema + 'plugin.schema.json',
            name: 'example',
            extensions: {
                xpertai: {
                    version: 2,
                    templates: ['good', 'bad', 'escape'].map((key) => ({ key, path: `templates/${key}.json` }))
                }
            }
        })
        const result = await parseAgentPlugin(root)
        expect(result.templates.map((item) => item.key)).toEqual(['good'])
        expect(result.diagnostics.map((item) => item.code)).toEqual(['invalid_template', 'invalid_template'])
    })
    it('does not accept template declarations under extension version 1', async () => {
        await json('plugin.json', {
            $schema: schema + 'plugin.schema.json',
            name: 'example',
            extensions: { xpertai: { version: 1, templates: [] } }
        })
        expect((await parseAgentPlugin(root)).diagnostics[0].code).toBe('invalid_extension')
    })
    it('isolates invalid and unsupported servers', async () => {
        await json('mcp.json', {
            $schema: schema + 'mcp.schema.json',
            mcpServers: {
                good: { type: 'streamable-http', url: 'https://example.com/mcp' },
                local: { type: 'stdio', command: 'node' },
                bad: { type: 'streamable-http', url: 'http://example.com/mcp' },
                duplicate: {
                    type: 'streamable-http',
                    url: 'https://example.com/mcp',
                    headers: { Test: 'a', test: 'b' }
                }
            }
        })
        const parsed = await parseAgentPlugin(root)
        expect(parsed.servers.map((server) => server.key)).toEqual(['good'])
        expect(parsed.diagnostics).toHaveLength(3)
    })
    it('rejects manifest symlinks outside the package', async () => {
        await rm(join(root, 'plugin.json'))
        await symlink('/etc/hosts', join(root, 'plugin.json'))
        await expect(parseAgentPlugin(root)).rejects.toThrow('escapes')
    })
    it('isolates escaping skill paths', async () => {
        await mkdir(join(root, 'skills'))
        await symlink(tmpdir(), join(root, 'skills/escape'))
        const parsed = await parseAgentPlugin(root)
        expect(parsed.skills).toEqual([])
        expect(parsed.diagnostics[0].code).toBe('invalid_skill')
    })
})
