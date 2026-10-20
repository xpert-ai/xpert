import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { ForbiddenException } from '@nestjs/common'
import { RequestContext, type RestClientScope } from '@xpert-ai/plugin-sdk'
import { XpertToolset } from '../xpert-toolset.entity'
import { XpertWorkspaceAccessService } from '../../xpert-workspace/workspace-access.service'
import { RestClientRuntimeService } from './rest-client-runtime.service'
import { RestClientTransport } from './rest-client.transport'
import { operationCatalog, serializeRequest } from './rest-client.schema'

const actor = {
    tenantId: '00000000-0000-4000-8000-000000000001',
    organizationId: '00000000-0000-4000-8000-000000000002',
    userId: '00000000-0000-4000-8000-000000000003'
}
const scope = (): RestClientScope => ({
    actor,
    workspaceId: '00000000-0000-4000-8000-000000000004',
    toolsetId: '00000000-0000-4000-8000-000000000005',
    signal: new AbortController().signal,
    deadlineAt: Date.now() + 5000
})
const tool = () => ({
    id: 'sales-tool',
    name: 'sales',
    description: 'Net sales',
    disabled: false,
    options: {
        api_bundle: {
            server_url: 'https://business.example/orders/{id}',
            method: 'get',
            openapi: {
                parameters: [
                    { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
                    { name: 'region', in: 'query', required: true, schema: { type: 'string', enum: ['East', 'West'] } }
                ]
            }
        }
    }
})
const args = { path: { id: 'customer 1' }, query: { region: 'East' } }

describe('REST client runtime', () => {
    beforeEach(() => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(actor.tenantId)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(actor.organizationId)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(actor.userId)
    })
    afterEach(() => jest.restoreAllMocks())
    async function fixture() {
        const connection: XpertToolset = Object.assign(new XpertToolset(), {
            tools: [tool()],
            options: {},
            credentials: {
                auth_type: 'api_key',
                api_key_header: 'Authorization',
                api_key_header_prefix: 'bearer',
                api_key_value: 'private-token'
            }
        })
        const repo = { findOne: jest.fn(async () => connection) }
        const workspaces = { assertCanRead: jest.fn(async () => ({})) }
        const transport = {
            request: jest.fn(async (..._args: Parameters<RestClientTransport['request']>) => ({
                body: { rows: [{ region: 'East', amount: '100.00' }] },
                sourceFetchedAt: new Date().toISOString()
            }))
        }
        const module = await Test.createTestingModule({
            providers: [
                RestClientRuntimeService,
                { provide: getRepositoryToken(XpertToolset), useValue: repo },
                { provide: XpertWorkspaceAccessService, useValue: workspaces },
                { provide: RestClientTransport, useValue: transport }
            ]
        }).compile()
        return { connection, repo, workspaces, transport, service: module.get(RestClientRuntimeService) }
    }
    it('discovers safe descriptors, validates typed groups and resolves saved credentials only in the host', async () => {
        const f = await fixture(),
            [descriptor] = await f.service.operations.list(scope())
        expect(descriptor.method).toBe('GET')
        expect(JSON.stringify(descriptor)).not.toMatch(/private-token|business\.example/)
        expect(f.repo.findOne).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    id: scope().toolsetId,
                    ...{ tenantId: actor.tenantId, organizationId: actor.organizationId },
                    workspaceId: scope().workspaceId,
                    category: 'api',
                    type: 'openapi'
                }
            })
        )
        await f.service.operations.call(scope(), {
            operationId: 'sales',
            contractHash: descriptor.contractHash,
            arguments: args
        })
        expect(f.transport.request).toHaveBeenCalledWith(
            { url: 'https://business.example/orders/customer%201?region=East', method: 'GET', body: undefined },
            f.connection.credentials,
            expect.any(AbortSignal),
            expect.any(Number)
        )
    })
    it('denies foreign viewers, inaccessible workspaces and missing connections before HTTP', async () => {
        for (const mode of ['actor', 'workspace', 'connection']) {
            const f = await fixture(),
                s = scope()
            if (mode === 'actor') s.actor = { ...actor, userId: '00000000-0000-4000-8000-000000000099' }
            if (mode === 'workspace') f.workspaces.assertCanRead.mockRejectedValue(new ForbiddenException())
            if (mode === 'connection') f.repo.findOne.mockResolvedValue(null)
            await expect(f.service.operations.list(s)).rejects.toThrow()
            expect(f.transport.request).not.toHaveBeenCalled()
        }
    })
    it('rejects URL, credentials and policy overrides, unknown fields and wrong parameter types', async () => {
        const f = await fixture(),
            [d] = await f.service.operations.list(scope())
        const request = { operationId: 'sales', contractHash: d.contractHash, arguments: args }
        for (const extra of [
            { url: 'https://evil.example' },
            { headers: {} },
            { readOnly: false },
            { credentials: {} }
        ])
            await expect(f.service.operations.call(scope(), { ...request, ...extra })).rejects.toThrow()
        for (const input of [
            { ...args, query: { region: 1 } },
            { ...args, headers: { Authorization: 'override' } },
            { ...args, query: { region: 'East', unknown: true } },
            { ...args, path: { id: '../admin' } },
            { ...args, path: { id: '%2e%2e' } }
        ])
            await expect(f.service.operations.call(scope(), { ...request, arguments: input })).rejects.toThrow()
        expect(f.transport.request).not.toHaveBeenCalled()
    })
    it('does not expose disabled, writable, cookie or header-parameter operations', async () => {
        const f = await fixture()
        for (const candidate of [
            { ...tool(), disabled: true },
            {
                ...tool(),
                options: { api_bundle: { ...tool().options.api_bundle, openapi: { 'x-xpert-read-only': false } } }
            },
            { ...tool(), options: { api_bundle: { ...tool().options.api_bundle, method: 'post' } } },
            {
                ...tool(),
                options: {
                    api_bundle: {
                        ...tool().options.api_bundle,
                        openapi: {
                            parameters: [
                                { name: 'Authorization', in: 'header', required: true, schema: { type: 'string' } }
                            ]
                        }
                    }
                }
            }
        ]) {
            f.connection.tools = [Object.assign(f.connection.tools[0], candidate)]
            expect(await f.service.operations.list(scope())).toEqual([])
        }
    })
    it('allows explicitly declared read-only JSON POST operations with the saved body schema', async () => {
        const f = await fixture()
        const post = {
            ...tool(),
            options: {
                api_bundle: {
                    server_url: 'https://business.example/report',
                    method: 'post',
                    openapi: {
                        'x-xpert-read-only': true,
                        requestBody: {
                            required: true,
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: { region: { type: 'string' } },
                                        required: ['region'],
                                        additionalProperties: false
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        f.connection.tools = [Object.assign(f.connection.tools[0], post)]
        const [d] = await f.service.operations.list(scope())
        await f.service.operations.call(scope(), {
            operationId: 'sales',
            contractHash: d.contractHash,
            arguments: { body: { region: 'West' } }
        })
        expect(f.transport.request.mock.calls[0][0]).toMatchObject({ method: 'POST', body: { region: 'West' } })
    })
    it('pins endpoint, behavior and schema and denies revoked tools on fresh calls', async () => {
        for (const change of ['endpoint', 'schema', 'disabled']) {
            const f = await fixture(),
                [d] = await f.service.operations.list(scope())
            if (change === 'endpoint') f.connection.tools[0].options.api_bundle.server_url += '/changed'
            if (change === 'schema')
                f.connection.tools[0].options.api_bundle.openapi.parameters[1].schema.enum = ['North']
            if (change === 'disabled') f.connection.tools[0].disabled = true
            await expect(
                f.service.operations.call(scope(), {
                    operationId: 'sales',
                    contractHash: d.contractHash,
                    arguments: args
                })
            ).rejects.toMatchObject({ response: { code: 'REST_CLIENT_OPERATION_CHANGED' } })
            expect(f.transport.request).not.toHaveBeenCalled()
        }
    })
    it('discards an in-flight response after permission or connection revocation', async () => {
        for (const mode of ['connection', 'permission']) {
            const f = await fixture(),
                [d] = await f.service.operations.list(scope())
            f.transport.request.mockImplementationOnce(async () => {
                if (mode === 'connection') f.connection.tools[0].disabled = true
                else f.workspaces.assertCanRead.mockRejectedValue(new ForbiddenException())
                return { body: { rows: [] }, sourceFetchedAt: new Date().toISOString() }
            })
            await expect(
                f.service.operations.call(scope(), {
                    operationId: 'sales',
                    contractHash: d.contractHash,
                    arguments: args
                })
            ).rejects.toThrow()
        }
    })
    it('does not invoke HTTP for an expired budget or aborted parent', async () => {
        const f = await fixture(),
            [d] = await f.service.operations.list(scope()),
            controller = new AbortController()
        controller.abort()
        for (const s of [
            { ...scope(), deadlineAt: 0 },
            { ...scope(), signal: controller.signal }
        ])
            await expect(
                f.service.operations.call(s, { operationId: 'sales', contractHash: d.contractHash, arguments: args })
            ).rejects.toThrow()
        expect(f.transport.request).not.toHaveBeenCalled()
    })
    it('serializes array queries using declared form/explode without turning data into new query keys', async () => {
        const f = await fixture()
        f.connection.tools[0].options.api_bundle.openapi.parameters = [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'tags', in: 'query', schema: { type: 'array', items: { type: 'string' } }, explode: true }
        ]
        const [op] = operationCatalog(f.connection)
        const result = serializeRequest(op, { path: { id: 'one' }, query: { tags: ['a&secret=1', 'b'] } })
        expect(new URL(result.url).searchParams.getAll('tags')).toEqual(['a&secret=1', 'b'])
        expect(new URL(result.url).searchParams.has('secret')).toBe(false)
    })
})
