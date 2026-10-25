import { createHash } from 'node:crypto'
import type { IXpertToolset } from '@xpert-ai/contracts'

/** Hash the saved connection snapshot actually loaded by the client; never persist its secrets. */
export function mcpConnectionVersion(connection: Pick<IXpertToolset, 'schema' | 'options' | 'updatedAt' | 'tools'>) {
    return createHash('sha256')
        .update(
            JSON.stringify({
                schema: connection.schema,
                options: connection.options,
                updatedAt: connection.updatedAt,
                tools: connection.tools
                    ?.map((tool) => ({
                        name: tool.name,
                        enabled: tool.enabled,
                        disabled: tool.disabled,
                        updatedAt: tool.updatedAt
                    }))
                    .sort((a, b) => a.name.localeCompare(b.name))
            })
        )
        .digest('hex')
}
