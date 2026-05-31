jest.mock('@xpert-ai/plugin-sdk', () => {
    const actual = jest.requireActual('@xpert-ai/plugin-sdk')
    return {
        ...actual,
        AgentMiddlewareStrategy: () => (target: unknown) => target
    }
})

import { IWFNMiddleware, WorkflowNodeTypeEnum } from '@xpert-ai/contracts'
import { AgentMiddlewareRuntimeApi, IAgentMiddlewareContext, JsonSchemaValidator } from '@xpert-ai/plugin-sdk'
import {
    OfficeAutomationMiddleware,
    OFFICE_AUTOMATION_MIDDLEWARE_NAME,
    OFFICE_AUTOMATION_TOOL_NAMES,
    OFFICE_CLIENT_TOOLS,
    OFFICE_EXCEL_TOOL_NAMES,
    OFFICE_POWERPOINT_TOOL_NAMES,
    OFFICE_WORD_TOOL_NAMES
} from './office-automation.middleware'

function createRuntime(): AgentMiddlewareRuntimeApi {
    return {
        async createModelClient() {
            throw new Error('createModelClient is not used in these tests.')
        },
        async wrapWorkflowNodeExecution(run, params) {
            void params
            return (await run({})).state
        }
    }
}

function createContext(): IAgentMiddlewareContext {
    const node: IWFNMiddleware = {
        id: 'middleware-1',
        key: 'middleware-1',
        type: WorkflowNodeTypeEnum.MIDDLEWARE,
        provider: OFFICE_AUTOMATION_MIDDLEWARE_NAME
    }

    return {
        tenantId: 'tenant-1',
        userId: 'user-1',
        node,
        tools: new Map(),
        runtime: createRuntime()
    }
}

describe('OfficeAutomationMiddleware', () => {
    it('exposes only PowerPoint tools by default', async () => {
        const strategy = new OfficeAutomationMiddleware()
        const middleware = await strategy.createMiddleware({}, createContext())

        expect(middleware.name).toBe(OFFICE_AUTOMATION_MIDDLEWARE_NAME)
        expect(middleware.tools?.map((tool) => tool.name)).toEqual([...OFFICE_POWERPOINT_TOOL_NAMES])
        expect(middleware.wrapToolCall).toBeDefined()
    })

    it('can expose host-specific tool sets on demand', async () => {
        const strategy = new OfficeAutomationMiddleware()

        await expect(strategy.createMiddleware({ host: 'word' }, createContext())).resolves.toMatchObject({
            tools: [...OFFICE_WORD_TOOL_NAMES].map((name) => expect.objectContaining({ name }))
        })

        await expect(strategy.createMiddleware({ host: 'excel' }, createContext())).resolves.toMatchObject({
            tools: [...OFFICE_EXCEL_TOOL_NAMES].map((name) => expect.objectContaining({ name }))
        })

        await expect(strategy.createMiddleware({ host: 'all' }, createContext())).resolves.toMatchObject({
            tools: [...OFFICE_AUTOMATION_TOOL_NAMES].map((name) => expect.objectContaining({ name }))
        })
    })

    it('can hide delete and image insertion tools through config', async () => {
        const strategy = new OfficeAutomationMiddleware()
        const middleware = await strategy.createMiddleware(
            {
                host: 'all',
                allowDeletes: false,
                allowImageInsert: false
            },
            createContext()
        )

        expect(middleware.tools?.map((tool) => tool.name)).toEqual(
            OFFICE_AUTOMATION_TOOL_NAMES.filter(
                (toolName) => !toolName.includes('delete') && toolName !== 'office_powerpoint_insert_image'
            )
        )
    })

    it('keeps all declared client tool schemas valid JSON schema', () => {
        const validator = new JsonSchemaValidator()

        for (const toolItem of OFFICE_CLIENT_TOOLS) {
            expect(() => validator.parseAndValidate(toolItem.schema)).not.toThrow()
        }
    })

    it('requires confirm in delete tool schemas', () => {
        for (const toolName of [
            'office_powerpoint_delete_slide',
            'office_powerpoint_delete_shape',
            'office_excel_delete_worksheet'
        ]) {
            const tool = OFFICE_CLIENT_TOOLS.find((item) => item.name === toolName)
            const schema = JSON.parse(tool?.schema ?? '{}')

            expect(schema.required).toContain('confirm')
            expect(schema.properties.confirm).toEqual(
                expect.objectContaining({
                    type: 'boolean'
                })
            )
        }
    })
})
