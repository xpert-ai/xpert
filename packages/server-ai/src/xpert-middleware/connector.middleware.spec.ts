import { ConnectorMiddleware, CONNECTOR_MIDDLEWARE_NAME, connectorRuntimeMiddlewareProvider } from './connector.middleware'

describe('ConnectorMiddleware', () => {
    it('exposes a generic connector config schema without provider-specific values', () => {
        const strategy = new ConnectorMiddleware({ get: jest.fn() } as any)
        const properties = (strategy.meta.configSchema as any).properties

        expect(strategy.meta.name).toBe(CONNECTOR_MIDDLEWARE_NAME)
        expect(strategy.meta.label.zh_Hans).toBe('连接器')
        expect(strategy.meta.icon).toEqual({
            type: 'font',
            value: 'ri-plug-line'
        })
        expect(properties.provider['x-ui'].selectUrl).toBe('/api/connector/provider-options')
        expect(properties.connectorId).toBeUndefined()
        expect(properties.provider.enum).toBeUndefined()
        expect(properties.provider['x-ui'].enumLabels).toBeUndefined()
    })

    it('delegates runtime creation to the selected connector provider implementation', async () => {
        const runtimeMiddleware = {
            name: 'ConnectorRuntime:lark',
            tools: []
        }
        const runtimeStrategy = {
            createMiddleware: jest.fn().mockReturnValue(runtimeMiddleware)
        }
        const registry = {
            get: jest.fn().mockReturnValue(runtimeStrategy)
        }
        const strategy = new ConnectorMiddleware(registry as any)

        const middleware = await Promise.resolve(strategy.createMiddleware(
            {
                provider: 'lark'
            },
            {
                organizationId: 'org-1'
            } as any
        ))

        expect(registry.get).toHaveBeenCalledWith(connectorRuntimeMiddlewareProvider('lark'), 'org-1')
        expect(runtimeStrategy.createMiddleware).toHaveBeenCalledWith(
            {
                provider: 'lark'
            },
            {
                organizationId: 'org-1'
            }
        )
        expect(middleware).toEqual({
            ...runtimeMiddleware,
            name: CONNECTOR_MIDDLEWARE_NAME
        })
    })

    it('keeps the middleware loadable before provider and connector are selected', () => {
        const registry = {
            get: jest.fn()
        }
        const strategy = new ConnectorMiddleware(registry as any)

        expect(strategy.createMiddleware({}, {} as any)).toEqual({
            name: CONNECTOR_MIDDLEWARE_NAME
        })
        expect(registry.get).not.toHaveBeenCalled()
    })

    it('keeps legacy connector ids when an old draft still has one', async () => {
        const runtimeStrategy = {
            createMiddleware: jest.fn().mockReturnValue({
                name: 'ConnectorRuntime:lark'
            })
        }
        const registry = {
            get: jest.fn().mockReturnValue(runtimeStrategy)
        }
        const strategy = new ConnectorMiddleware(registry as any)

        await Promise.resolve(strategy.createMiddleware(
            {
                provider: 'lark',
                connectorId: 'connector-1'
            },
            {} as any
        ))

        expect(runtimeStrategy.createMiddleware).toHaveBeenCalledWith(
            {
                provider: 'lark',
                connectorId: 'connector-1'
            },
            {}
        )
    })

    it('keeps tool preview loadable when the provider runtime plugin is missing', async () => {
        const registry = {
            get: jest.fn(() => {
                throw new Error("No strategy found for type 'ConnectorRuntime:lark'")
            })
        }
        const strategy = new ConnectorMiddleware(registry as any)

        const middleware = await Promise.resolve(strategy.createMiddleware(
            {
                provider: 'lark'
            },
            {} as any
        ))

        expect(middleware).toEqual(
            expect.objectContaining({
                name: CONNECTOR_MIDDLEWARE_NAME
            })
        )
        expect(middleware.tools).toBeUndefined()
        expect(() => (middleware.beforeAgent as any)({} as any, {} as any)).toThrow(
            "Connector runtime 'ConnectorRuntime:lark' is not registered"
        )
    })
})
