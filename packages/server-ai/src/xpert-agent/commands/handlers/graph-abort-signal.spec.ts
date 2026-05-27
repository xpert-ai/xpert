import fs from 'node:fs'
import path from 'node:path'

const handlersDir = __dirname

const readHandler = (fileName: string) => fs.readFileSync(path.join(handlersDir, fileName), 'utf8')

describe('LangGraph abort signal wiring', () => {
    it('does not bind long-lived abort signals directly to nested graph or tool nodes', () => {
        const content = `${readHandler('subgraph.handler.ts')}\n${readHandler('workflow-subgraph.handler.ts')}`

        expect(content).not.toContain('nodes[name].graph.withConfig({ signal: abortController.signal })')
        expect(content).not.toContain(
            '.withConfig({\n                        signal: abortController.signal\n                    })'
        )
    })

    it('uses scoped abort signals for model invocations', () => {
        const content = readHandler('subgraph.handler.ts')

        expect(content).toContain('const createScopedAbortSignal = () =>')
        expect(content).toContain('signal: scopedSignal.signal')
        expect(content).not.toContain('model.invoke(finalMessages, { ...config, signal: abortController.signal })')
    })
})
