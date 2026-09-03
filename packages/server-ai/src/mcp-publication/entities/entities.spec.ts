import { getMetadataArgsStorage } from 'typeorm'
import {
    MCP_PUBLICATION_ENTITIES,
    McpApiKey,
    McpCapabilityCatalog,
    McpInvocationAudit,
    McpOAuthPolicy,
    McpPublication,
    McpPublicationAccess,
    McpPublicationCapability,
    McpTask
} from './index'

describe('MCP publication persistence entities', () => {
    it('registers every persisted architecture record with its stable table name', () => {
        const tables = getMetadataArgsStorage()
            .tables.filter((table) =>
                MCP_PUBLICATION_ENTITIES.includes(table.target as (typeof MCP_PUBLICATION_ENTITIES)[number])
            )
            .map((table) => table.name)

        expect(tables).toEqual(
            expect.arrayContaining([
                'mcp_publication',
                'mcp_capability_catalog',
                'mcp_publication_capability',
                'mcp_publication_access',
                'mcp_api_key',
                'mcp_oauth_policy',
                'mcp_invocation_audit',
                'mcp_task'
            ])
        )
    })

    it('keeps secret and structured columns explicit at the database seam', () => {
        const columns = getMetadataArgsStorage().columns
        const column = (target: object, propertyName: string) =>
            columns.find((item) => item.target === target && item.propertyName === propertyName)?.options

        expect(column(McpPublication, 'authMethods')).toMatchObject({ type: 'json' })
        expect(column(McpCapabilityCatalog, 'descriptor')).toMatchObject({ type: 'json' })
        expect(column(McpPublicationCapability, 'descriptorSnapshot')).toMatchObject({ type: 'json' })
        expect(column(McpPublicationAccess, 'enabled')).toMatchObject({ type: 'boolean', default: true })
        expect(column(McpApiKey, 'keyHash')).toMatchObject({ type: 'char', select: false })
        expect(column(McpOAuthPolicy, 'subjectMapping')).toMatchObject({ type: 'json' })
        expect(column(McpInvocationAudit, 'argumentSummary')).toMatchObject({ type: 'json', select: false })
        expect(column(McpTask, 'requestPayload')).toMatchObject({ type: 'json', select: false })
        expect(column(McpTask, 'inputRequests')).toMatchObject({ type: 'json', select: false })
        expect(column(McpTask, 'resultRef')).toMatchObject({ type: 'json', select: false })
    })
})
