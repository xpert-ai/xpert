import { MCP_EXECUTION_CONTROL_EXTENSION_ID, mcpExecutionToolDeclarationSchema } from '@xpert-ai/contracts'

type TaskSupport = 'required' | 'optional' | 'forbidden'

/** 2026 removed Tool.execution; Xpert declares it in its existing namespaced extension.
 * Keep legacy discovery usable, and never downgrade a required task on conflicting metadata.
 * This declaration selects the protocol path; it grants neither authorization nor exit evidence.
 */
export function mcpToolTaskSupport(tool: object): TaskSupport | undefined {
    const meta = field(tool, '_meta')
    const extension = field(meta, MCP_EXECUTION_CONTROL_EXTENSION_ID)
    const parsed = mcpExecutionToolDeclarationSchema.safeParse(extension)
    const modern = parsed.success ? parsed.data.taskSupport : undefined
    const legacy = support(field(field(tool, 'execution'), 'taskSupport'))
    return modern === 'required' || legacy === 'required' ? 'required' : (modern ?? legacy)
}

function field(value: unknown, key: string): unknown {
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? Reflect.get(value, key) : undefined
}

function support(value: unknown): TaskSupport | undefined {
    return value === 'required' || value === 'optional' || value === 'forbidden' ? value : undefined
}
