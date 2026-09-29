// Portable discovery is intentionally separate from the native Xpert module loader.
// Validate locally, contain real paths, and isolate component failures per spec 1.0.0.
import Ajv from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import { readFile, readdir, realpath, stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { z } from 'zod/v3'
import type { AgentPluginDiagnostic, AgentPluginXpertExtension } from '@xpert-ai/contracts'
import manifestSchema from './schemas/plugin.schema'
import mcpSchema from './schemas/mcp.schema'
import { agentPluginConnectorsSchema } from './agent-plugin-connector.schema'

const ajv = new Ajv({ strict: false, allErrors: true })
addFormats(ajv)
const validateManifest = ajv.compile(manifestSchema)
ajv.addSchema(mcpSchema)
const validateServer = ajv.getSchema(`${mcpSchema.$id}#/$defs/server`)!
const manifestShape = z.object({
    $schema: z.literal(manifestSchema.$id),
    name: z.string(),
    version: z.string().optional(),
    description: z.string().optional(),
    extensions: z.object({ xpertai: z.unknown().optional() }).passthrough().optional()
})
export const jsonValue: z.ZodType<import('@xpert-ai/contracts').JSONValue> = z.lazy(() =>
    z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValue), z.record(jsonValue)])
)
const extensionShape = z
    .object({
        version: z.literal(1),
        connectors: agentPluginConnectorsSchema.optional(),
        interface: z
            .object({
                displayName: z.string().optional(),
                description: z.string().optional(),
                icon: z.string().optional()
            })
            .strict()
            .optional(),
        middlewares: z
            .array(
                z
                    .object({
                        key: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
                        provider: z.string().min(1),
                        options: z.record(jsonValue).optional()
                    })
                    .strict()
            )
            .optional(),
        experts: z
            .array(z.object({ key: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/), reference: z.string().min(1) }).strict())
            .optional()
    })
    .strict()
    .refine((value) => {
        const keys = [...(value.middlewares ?? []), ...(value.experts ?? [])].map(({ key }) => key)
        return new Set(keys).size === keys.length
    }, 'Extension component keys must be unique')
const remoteShape = z
    .object({ type: z.literal('streamable-http'), url: z.string(), headers: z.record(z.string()).optional() })
    .strict()
export type PortableRemoteServer = z.infer<typeof remoteShape>
export interface PortablePlugin {
    name: string
    version?: string
    description?: string
    extension?: AgentPluginXpertExtension
    skills: Array<{ key: string; description: string; path: string }>
    servers: Array<{ key: string; config: PortableRemoteServer }>
    diagnostics: AgentPluginDiagnostic[]
}

export async function containedPath(root: string, path: string): Promise<string> {
    const [base, target] = await Promise.all([realpath(root), realpath(resolve(root, path))])
    const child = relative(base, target)
    if (isAbsolute(child) || child === '..' || child.startsWith('../'))
        throw new Error('Package path escapes plugin root')
    return target
}

async function readJson(root: string, path: string): Promise<unknown> {
    const file = await containedPath(root, path)
    const info = await stat(file)
    if (!info.isFile() || info.size > 4 * 1024 * 1024) throw new Error('Invalid or oversized JSON file')
    return JSON.parse(await readFile(file, 'utf8'))
}

function object(value: unknown): value is { [key: string]: unknown } {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}
function absent(error: unknown) {
    return !!error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'
}

export async function parseAgentPlugin(root: string): Promise<PortablePlugin> {
    const diagnostics: AgentPluginDiagnostic[] = []
    const report = (component: string, code: string, error: unknown) =>
        diagnostics.push({
            component,
            code,
            message: error instanceof Error ? error.message : String(error)
        })
    const raw = await readJson(root, 'plugin.json')
    if (!object(raw)) throw new Error('plugin.json must be an object')
    const manifest = { ...raw }
    for (const key of Object.keys(manifest)) {
        if (!(key in manifestSchema.properties)) {
            report('manifest', 'unknown_field', `Ignoring unknown field: ${key}`)
            delete manifest[key]
        }
    }
    // Unknown namespaces are opaque, including values with client-specific shapes.
    const extensions = object(manifest.extensions) ? manifest.extensions : undefined
    // Prefer the current namespace, including invalid values; only old packages use the alias.
    const extensionNamespace =
        extensions && Object.prototype.hasOwnProperty.call(extensions, 'xpertai') ? 'xpertai' : 'cn.xpertai'
    const extension = extensions?.[extensionNamespace]
    if (manifest.extensions !== undefined && !object(manifest.extensions))
        report('manifest', 'invalid_extensions', 'Ignoring non-object extensions')
    delete manifest.extensions
    if (!validateManifest(manifest)) throw new Error(ajv.errorsText(validateManifest.errors))
    const parsed = manifestShape.parse(manifest)
    const plugin: PortablePlugin = {
        name: parsed.name,
        version: parsed.version,
        description: parsed.description,
        skills: [],
        servers: [],
        diagnostics
    }
    if (extension !== undefined) {
        const result = extensionShape.safeParse(extension)
        if (result.success) plugin.extension = result.data as AgentPluginXpertExtension
        else report(extensionNamespace, 'invalid_extension', result.error)
    }
    try {
        const directory = await containedPath(root, 'skills')
        if (!(await stat(directory)).isDirectory()) throw new Error('skills must be a directory')
        for (const entry of await readdir(directory)) {
            const path = `skills/${entry}/SKILL.md`
            try {
                const dir = await containedPath(root, `skills/${entry}`)
                if (!(await stat(dir)).isDirectory()) continue
                const file = await containedPath(root, path)
                if (!(await stat(file)).isFile() || (await stat(file)).size > 1024 * 1024)
                    throw new Error('Invalid SKILL.md')
                const content = await readFile(file, 'utf8')
                const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content)
                if (!frontmatter) throw new Error('Missing skill frontmatter')
                const skill = z
                    .object({
                        name: z
                            .string()
                            .min(1)
                            .max(64)
                            .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
                        description: z.string().min(1).max(1024)
                    })
                    .parse(parseYaml(frontmatter[1]))
                if (skill.name !== entry) throw new Error('Skill name must match its directory')
                plugin.skills.push({ key: skill.name, description: skill.description, path })
            } catch (error) {
                if (!absent(error)) report(path, 'invalid_skill', error)
            }
        }
    } catch (error) {
        if (!absent(error)) report('skills', 'invalid_component', error)
    }
    try {
        const config = await readJson(root, 'mcp.json')
        if (
            !object(config) ||
            config.$schema !== mcpSchema.$id ||
            !object(config.mcpServers) ||
            Object.keys(config).some((key) => !['$schema', 'mcpServers'].includes(key))
        )
            throw new Error('Invalid mcp.json schema or configuration')
        for (const [key, server] of Object.entries(config.mcpServers)) {
            try {
                if (!validateServer(server)) throw new Error(ajv.errorsText(validateServer.errors))
                if (!object(server)) throw new Error('Invalid server')
                if (server.type !== 'streamable-http') {
                    report(key, 'unsupported_transport', `Transport ${server.type} is not supported`)
                    continue
                }
                const remote = remoteShape.parse(server)
                const url = new URL(remote.url)
                const loopback =
                    url.hostname === 'localhost' ||
                    url.hostname === '[::1]' ||
                    /^127\.(?:\d{1,3}\.){2}\d{1,3}$/.test(url.hostname)
                if (
                    url.username ||
                    url.password ||
                    url.hash ||
                    !(url.protocol === 'https:' || (url.protocol === 'http:' && loopback))
                )
                    throw new Error(
                        'MCP requires HTTPS (HTTP allowed only on loopback) without credentials or fragment'
                    )
                const names = new Set<string>()
                for (const [name, value] of Object.entries(remote.headers ?? {})) {
                    if (
                        !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) ||
                        /[\r\n\0]/.test(value) ||
                        names.has(name.toLowerCase())
                    )
                        throw new Error('Invalid or duplicate MCP header')
                    if (['authorization', 'proxy-authorization', 'cookie', 'x-api-key'].includes(name.toLowerCase()))
                        throw new Error('Configure credentials through the host, not package headers')
                    names.add(name.toLowerCase())
                }
                plugin.servers.push({ key, config: remote })
            } catch (error) {
                report(key, 'invalid_server', error)
            }
        }
    } catch (error) {
        if (!absent(error)) report('mcp', 'invalid_component', error)
    }
    return plugin
}
