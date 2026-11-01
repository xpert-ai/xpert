import 'reflect-metadata'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import plugin from './index'

describe('execution overview App packaging', () => {
  it('resolves every App to exactly one included template with the required analysis provider', () => {
    const apps = plugin.meta.targetAppMeta?.xpert?.marketplace?.contents?.filter((entry) => entry.type === 'app') ?? []
    expect(apps).toHaveLength(1)
    if (!Array.isArray(plugin.templates)) throw Error('Expected bundled Assistant templates')
    for (const app of apps) {
      const templates = plugin.templates.filter((template) => template.key === app.appConfig?.assistantTemplateKey)
      expect(templates).toHaveLength(1)
      const dsl = JSON.parse(templates[0].dslContent as string)
      const middleware = dsl.nodes.find((node: { entity: { type: string } }) => node.entity.type === 'middleware')
      expect(middleware.entity.required).toBe(true)
      expect(dsl.connections).toContainEqual(expect.objectContaining({ from: dsl.team.agent.key, to: middleware.key }))
    }
  })

  it('declares and ships every local cover referenced by App and marketplace presentation', () => {
    const root = resolve(__dirname, '..')
    const manifest = JSON.parse(readFileSync(resolve(root, '.xpertai-plugin/plugin.json'), 'utf8'))
    const marketplace = plugin.meta.targetAppMeta?.xpert?.marketplace
    const covers = new Set([
      ...(marketplace?.screenshots ?? []),
      ...(marketplace?.contents?.flatMap((entry) => entry.appConfig?.presentation?.screenshots ?? []) ?? [])
    ])
    expect(covers.size).toBeGreaterThan(0)
    expect(manifest.name).toBe(plugin.meta.name)
    for (const cover of covers) {
      expect(manifest.assets.screenshots).toContain(cover)
      const bytes = readFileSync(resolve(root, cover))
      expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
      expect(bytes.length).toBeLessThanOrEqual(5 * 1024 * 1024)
    }
  })
})
