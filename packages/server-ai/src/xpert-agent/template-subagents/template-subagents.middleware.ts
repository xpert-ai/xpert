import { tool } from '@langchain/core/tools'
import type { RunnableConfig } from '@langchain/core/runnables'
import type { AgentMiddleware } from '@xpert-ai/plugin-sdk'
import { createHash } from 'node:crypto'
import z from 'zod'
import type { RuntimeTemplateDescriptor } from '../../agent-plugin/templates/runtime-template'
import { templateParametersSchema } from './template-parameters'

export type TemplateSubagentExecutor = (
    template: RuntimeTemplateDescriptor,
    input: { input: string; [key: string]: unknown },
    config: RunnableConfig
) => Promise<string>

export function templateSubagentToolName(template: RuntimeTemplateDescriptor) {
    return `delegate_template_${createHash('sha256')
        .update(JSON.stringify([template.bindingId, template.version, template.templateKey]))
        .digest('hex')
        .slice(0, 24)}`
}

/** Presentation only: the host executor owns template loading, authorization and execution. */
export function createTemplateSubagentsMiddleware(
    templates: RuntimeTemplateDescriptor[],
    execute: TemplateSubagentExecutor
): AgentMiddleware {
    return {
        name: '__template_subagents__',
        tools: templates.map((template) =>
            tool((input, config) => execute(template, input, config), {
                name: templateSubagentToolName(template),
                description: `${template.title}: ${template.description}`,
                schema: z
                    .object({
                        ...templateParametersSchema(template.parameters),
                        input: z.string().min(1).describe('The task to delegate')
                    })
                    .strict(),
                metadata: { toolName: template.title }
            })
        )
    }
}
