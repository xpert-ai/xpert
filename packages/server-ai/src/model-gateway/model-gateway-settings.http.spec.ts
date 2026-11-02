import { INestApplication } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { AIPermissionsEnum } from '@xpert-ai/contracts'
import { RequestContextMiddleware } from '@xpert-ai/plugin-sdk'
import { RequestContextMiddleware as PlatformContextMiddleware, TenantSetting } from '@xpert-ai/server-core'
import { NextFunction, Request, Response } from 'express'
import { FindOperator } from 'typeorm'
import { ModelAccessService } from '../model-access/model-access.service'
import { ModelGatewayController } from './model-gateway.controller'
import { ModelGatewayService } from './model-gateway.service'
import { ModelGatewaySettings } from './model-gateway-settings.entity'

const settingsInput = { storeBodies: false, bodyRetentionDays: 7, requestsPerMinute: 60, maxConcurrentRequests: 5 }

describe('model gateway settings HTTP boundary', () => {
    let app: INestApplication
    let origin: string

    beforeEach(async () => {
        const rows: TenantSetting[] = []
        const tenantSettings = {
            find: async ({ where }: { where: { tenantId: string; name: FindOperator<string> } }) =>
                rows.filter((row) => row.tenantId === where.tenantId && where.name.value.includes(row.name)),
            findOne: async ({ where }: { where: { tenantId: string; name: string } }) =>
                rows.find((row) => row.tenantId === where.tenantId && row.name === where.name) ?? null,
            create: (input: Partial<TenantSetting>) => Object.assign(new TenantSetting(), input),
            save: async (input: TenantSetting | TenantSetting[]) => {
                for (const row of Array.isArray(input) ? input : [input]) {
                    const existing = rows.findIndex((item) => item.tenantId === row.tenantId && item.name === row.name)
                    if (existing < 0) rows.push(row)
                    else rows[existing] = row
                }
                return input
            }
        }
        const storedSettings = new Map<string, ModelGatewaySettings>()
        const settingsRepository = {
            findOne: async ({ where }: { where: { tenantId: string } }) => storedSettings.get(where.tenantId) ?? null,
            create: (input: Partial<ModelGatewaySettings>) => Object.assign(new ModelGatewaySettings(), input),
            save: async (input: ModelGatewaySettings) => {
                storedSettings.set(input.tenantId, input)
                return input
            }
        }
        const service = new ModelGatewayService(
            {} as never,
            {} as never,
            settingsRepository as never,
            {} as never,
            {} as never,
            tenantSettings as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never
        )
        const module = await Test.createTestingModule({
            controllers: [ModelGatewayController],
            providers: [
                { provide: ModelGatewayService, useValue: service },
                { provide: ModelAccessService, useValue: {} },
                { provide: CommandBus, useValue: { execute: jest.fn() } }
            ]
        }).compile()
        app = module.createNestApplication({ logger: false })
        // Authentication is the fixture boundary; controller permissions and tenant scope run normally.
        const identities = new Map([
            ['admin', { tenantId: 'tenant-1', manage: true }],
            ['member', { tenantId: 'tenant-1', manage: false }],
            ['other-admin', { tenantId: 'tenant-2', manage: true }]
        ])
        app.use((req: Request, res: Response, next: NextFunction) => {
            const identity = identities.get(req.headers.authorization?.replace('Bearer ', '') ?? '')
            if (!identity) {
                res.sendStatus(401)
                return
            }
            Object.assign(req, {
                user: {
                    id: 'user-1',
                    tenantId: identity.tenantId,
                    roleId: 'role-1',
                    role: {
                        rolePermissions: identity.manage
                            ? [
                                  {
                                      tenantId: identity.tenantId,
                                      roleId: 'role-1',
                                      enabled: true,
                                      permission: AIPermissionsEnum.MODEL_GATEWAY_MANAGE
                                  }
                              ]
                            : []
                    }
                }
            })
            next()
        })
        const platformContext = new PlatformContextMiddleware()
        const pluginContext = new RequestContextMiddleware()
        app.use(platformContext.use.bind(platformContext))
        app.use(pluginContext.use.bind(pluginContext))
        app.setGlobalPrefix('api')
        await app.listen(0, '127.0.0.1')
        origin = await app.getUrl()
    })

    afterEach(async () => {
        await app?.close()
    })

    const request = (path: string, token = 'admin', body?: object, headers: Record<string, string> = {}) =>
        fetch(`${origin}/api/model-gateway/${path}`, {
            method: body ? 'PUT' : 'GET',
            headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...headers },
            ...(body ? { body: JSON.stringify(body) } : {})
        })

    it('persists an external URL and exposes only that client setting to an organization member', async () => {
        const saved = await request('admin/settings', 'admin', {
            ...settingsInput,
            externalApiBaseUrl: 'http://10.0.0.15:8088/api/openai/v1'
        })
        expect(saved.status).toBe(200)
        expect(await saved.json()).toMatchObject({ externalApiBaseUrl: 'http://10.0.0.15:8088/api/openai/v1' })
        const admin = await request('admin/settings')
        expect(await admin.json()).toMatchObject({ externalApiBaseUrl: 'http://10.0.0.15:8088/api/openai/v1' })
        const client = await request('client-config', 'member', undefined, { 'organization-id': 'org-1' })
        expect(client.status).toBe(200)
        expect(await client.json()).toEqual({ externalApiBaseUrl: 'http://10.0.0.15:8088/api/openai/v1' })
    })

    it.each([
        'ftp://example.com/v1',
        '/api/openai/v1',
        '/',
        '///',
        'http://',
        'https://user:password@example.com/v1',
        'https://example.com/v1?key=secret',
        'https://example.com/v1#fragment',
        'https://example.com/a b',
        'https://example.com/\\evil',
        `https://example.com/${'x'.repeat(2048)}`,
        42,
        { url: 'https://example.com' }
    ])('rejects invalid external URLs without changing the saved setting: %p', async (externalApiBaseUrl) => {
        const response = await request('admin/settings', 'admin', { ...settingsInput, externalApiBaseUrl })
        expect(response.status).toBe(400)
        expect(await (await request('client-config', 'member')).json()).toEqual({ externalApiBaseUrl: null })
    })

    it('normalizes whitespace and trailing slashes, preserves omission and permits clearing', async () => {
        const saved = await request('admin/settings', 'admin', {
            ...settingsInput,
            externalApiBaseUrl: '  https://gateway.example/custom/openai/v1///  '
        })
        expect(saved.status).toBe(200)
        expect(await saved.json()).toMatchObject({ externalApiBaseUrl: 'https://gateway.example/custom/openai/v1' })
        await request('admin/settings', 'admin', settingsInput)
        expect(await (await request('client-config')).json()).toEqual({
            externalApiBaseUrl: 'https://gateway.example/custom/openai/v1'
        })
        for (const externalApiBaseUrl of ['', null, '   ']) {
            const cleared = await request('admin/settings', 'admin', { ...settingsInput, externalApiBaseUrl })
            expect(cleared.status).toBe(200)
            expect(await (await request('client-config')).json()).toEqual({ externalApiBaseUrl: null })
        }
    })

    it('keeps the configured URL tenant-scoped and restricts changes to tenant administrators', async () => {
        await request('admin/settings', 'admin', {
            ...settingsInput,
            externalApiBaseUrl: 'http://gateway.internal:8088/api/openai/v1',
            tenantId: 'tenant-2'
        })
        expect(await (await request('client-config', 'other-admin')).json()).toEqual({ externalApiBaseUrl: null })
        expect(
            (
                await request('admin/settings', 'member', {
                    ...settingsInput,
                    externalApiBaseUrl: 'https://other.example/v1'
                })
            ).status
        ).toBe(403)
        expect(
            (
                await request(
                    'admin/settings',
                    'admin',
                    { ...settingsInput, externalApiBaseUrl: '' },
                    { 'organization-id': 'org-1' }
                )
            ).status
        ).toBe(403)
        expect((await request('client-config', 'unknown')).status).toBe(401)
        expect(await (await request('client-config', 'member')).json()).toEqual({
            externalApiBaseUrl: 'http://gateway.internal:8088/api/openai/v1'
        })
    })
})
