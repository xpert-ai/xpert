import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'
import { IXpertAgent, TXpertGraph } from '@xpert-ai/contracts'
import { getRuntimeEnabledMiddlewareNodes } from '../shared/agent/middleware'

describe('Bosi Desktop Assistant template', () => {
    it('keeps local shell and skill discovery available without selecting optional plugins', () => {
        const graph: TXpertGraph = parse(readFileSync(join(__dirname, 'templates/xpert-bosi-desktop.yaml'), 'utf8'))
        const agent = graph.nodes.find((node) => node.type === 'agent')?.entity as IXpertAgent
        const nodes = getRuntimeEnabledMiddlewareNodes(graph, agent, {
            runtimeCapabilities: { mode: 'allowlist', skills: { ids: [] }, plugins: { nodeKeys: [] } }
        })
        expect(nodes.map(({ key }) => key)).toEqual([
            'Middleware_ContextCompression',
            'Middleware_Todos',
            'Middleware_DesktopShell',
            'Middleware_Skills',
            'Middleware_Files'
        ])
        expect(nodes.find(({ key }) => key === 'Middleware_DesktopShell')?.entity).toMatchObject({
            provider: 'DesktopShell',
            tools: { desktop_shell: true }
        })
        expect(agent.prompt).toContain('desktop_shell only')
        expect(agent.prompt).toContain('Never pass local paths to present_files')
        expect(agent.prompt).toContain('Do not repeat the command or switch tools to bypass it')
    })
})
