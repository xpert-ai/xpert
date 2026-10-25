import { MCP_EXECUTION_CONTROL_EXTENSION_ID } from '@xpert-ai/contracts'
import { mcpToolTaskSupport } from './mcp-tool-task-support'
import { describeReadOnlyTool } from '../runtime/mcp-client-runtime.schema'

const required = { _meta: { [MCP_EXECUTION_CONTROL_EXTENSION_ID]: { version: 1, taskSupport: 'required' } } }
describe('MCP task discovery compatibility', () => {
    it('keeps required task semantics if legacy and modern declarations disagree', () => {
        expect(mcpToolTaskSupport({ ...required, execution: { taskSupport: 'optional' } })).toBe('required')
        expect(
            mcpToolTaskSupport({
                execution: { taskSupport: 'required' },
                _meta: { [MCP_EXECUTION_CONTROL_EXTENSION_ID]: { version: 1, taskSupport: 'forbidden' } }
            })
        ).toBe('required')
    })
    it.each([null, [], 'required', { version: 2, taskSupport: 'required' }, { version: 1, taskSupport: true }])(
        'does not infer task support from invalid extension metadata: %j',
        (value) => {
            expect(mcpToolTaskSupport({ _meta: { [MCP_EXECUTION_CONTROL_EXTENSION_ID]: value } })).toBeUndefined()
        }
    )
    it('does not offer task-required tools through the synchronous read-only client runtime', () => {
        expect(
            describeReadOnlyTool({
                ...required,
                name: 'work',
                inputSchema: { type: 'object' },
                annotations: { readOnlyHint: true }
            })
        ).toBeNull()
    })
})
