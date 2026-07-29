import { NsjailSandboxProvider, NsjailWorkspacePathMapper } from './nsjail-sandbox.provider'

describe('NsjailSandboxProvider', () => {
    const fetchSpy = jest.spyOn(global, 'fetch')
    const originalUrl = process.env.NSJAIL_RUNNER_URL
    const originalToken = process.env.NSJAIL_RUNNER_TOKEN

    beforeEach(() => {
        fetchSpy.mockReset()
        delete process.env.NSJAIL_RUNNER_URL
        delete process.env.NSJAIL_RUNNER_TOKEN
    })

    afterAll(() => {
        fetchSpy.mockRestore()
        if (originalUrl === undefined) {
            delete process.env.NSJAIL_RUNNER_URL
        } else {
            process.env.NSJAIL_RUNNER_URL = originalUrl
        }
        if (originalToken === undefined) {
            delete process.env.NSJAIL_RUNNER_TOKEN
        } else {
            process.env.NSJAIL_RUNNER_TOKEN = originalToken
        }
    })

    it('stays unavailable until the configured Runner is healthy', async () => {
        const provider = new NsjailSandboxProvider()
        await expect(provider.isAvailable()).resolves.toBe(false)

        process.env.NSJAIL_RUNNER_URL = 'http://runner:8090'
        process.env.NSJAIL_RUNNER_TOKEN = 'secret'
        fetchSpy.mockResolvedValue(
            new Response(JSON.stringify({ status: 'ok' }), {
                headers: { 'content-type': 'application/json' },
                status: 200
            })
        )

        await expect(provider.isAvailable()).resolves.toBe(true)
        await expect(provider.isAvailable()).resolves.toBe(true)
        expect(fetchSpy).toHaveBeenCalledTimes(1)
    })

    it('stays unavailable when the Runner rejects the configured token', async () => {
        process.env.NSJAIL_RUNNER_URL = 'http://runner:8090'
        process.env.NSJAIL_RUNNER_TOKEN = 'invalid'
        fetchSpy.mockResolvedValue(
            new Response(JSON.stringify({ error: 'Unauthorized' }), {
                headers: { 'content-type': 'application/json' },
                status: 401
            })
        )

        await expect(new NsjailSandboxProvider().isAvailable()).resolves.toBe(false)
    })

    it('creates a stable Runner runtime from the existing workspace binding', async () => {
        process.env.NSJAIL_RUNNER_URL = 'http://runner:8090'
        process.env.NSJAIL_RUNNER_TOKEN = 'secret'
        fetchSpy
            .mockResolvedValueOnce(
                new Response(JSON.stringify({ status: 'ok' }), {
                    headers: { 'content-type': 'application/json' },
                    status: 200
                })
            )
            .mockResolvedValueOnce(
                new Response(JSON.stringify({ runtimeId: 'runtime' }), {
                    headers: { 'content-type': 'application/json' },
                    status: 201
                })
            )

        const sandbox = await new NsjailSandboxProvider().create({
            environmentId: 'environment-1',
            tenantId: 'tenant-1',
            workFor: { id: 'project-1', type: 'project' },
            workingDirectory: '/workspace/session',
            workspaceBinding: {
                bindSource: '/host/sandbox/project-1',
                containerMountPath: '/workspace',
                volumeRoot: '/sandbox/tenant-1/project/project-1',
                workspacePath: '/workspace/session',
                workspaceRoot: '/workspace'
            }
        })

        expect(sandbox.id).toMatch(/^nsjail-[a-f0-9]{32}$/)
        expect(sandbox.environmentId).toBe('environment-1')
        expect(sandbox.workingDirectory).toBe('/workspace/session')
        expect(fetchSpy).toHaveBeenLastCalledWith(
            'http://runner:8090/v1/runtimes',
            expect.objectContaining({
                body: expect.stringContaining('"workspacePath":"/sandbox/tenant-1/project/project-1"'),
                method: 'POST'
            })
        )
    })

    it('uses distinct runtime ids for different normalized working directories', async () => {
        process.env.NSJAIL_RUNNER_URL = 'http://runner:8090'
        process.env.NSJAIL_RUNNER_TOKEN = 'secret'
        fetchSpy
            .mockResolvedValueOnce(
                new Response(JSON.stringify({ status: 'ok' }), {
                    headers: { 'content-type': 'application/json' },
                    status: 200
                })
            )
            .mockImplementation(() =>
                Promise.resolve(
                    new Response(JSON.stringify({ runtimeId: 'runtime' }), {
                        headers: { 'content-type': 'application/json' },
                        status: 201
                    })
                )
            )

        const provider = new NsjailSandboxProvider()
        const createOptions = {
            tenantId: 'tenant-1',
            workFor: { id: 'project-1', type: 'project' as const },
            workspaceBinding: {
                volumeRoot: '/sandbox/tenant-1/project/project-1',
                workspacePath: '/workspace',
                workspaceRoot: '/workspace'
            }
        }

        const first = await provider.create({ ...createOptions, workingDirectory: '/workspace/a/' })
        const second = await provider.create({ ...createOptions, workingDirectory: '/workspace/b' })

        expect(first.id).not.toBe(second.id)
        expect(first.workingDirectory).toBe('/workspace/a')
    })

    it('does not fall back to a host directory when the workspace binding is missing', async () => {
        process.env.NSJAIL_RUNNER_URL = 'http://runner:8090'
        process.env.NSJAIL_RUNNER_TOKEN = 'secret'

        await expect(
            new NsjailSandboxProvider().create({ workFor: { id: 'project-1', type: 'project' } })
        ).rejects.toThrow('explicit workspace binding')
        expect(fetchSpy).not.toHaveBeenCalled()
    })
})

describe('NsjailWorkspacePathMapper', () => {
    const mapper = new NsjailWorkspacePathMapper()

    it('maps a host volume into the NsJail workspace contract', () => {
        const binding = mapper.mapVolumeToWorkspace(
            {
                hostRoot: '/mnt/sandbox/tenant-1/project/project-1',
                serverRoot: '/sandbox/tenant-1/project/project-1'
            },
            { serverPath: '/sandbox/tenant-1/project/project-1/sessions/conversation-1' }
        )

        expect(binding).toEqual({
            bindSource: '/mnt/sandbox/tenant-1/project/project-1',
            containerMountPath: '/workspace',
            volumeRoot: '/sandbox/tenant-1/project/project-1',
            workspacePath: '/workspace/sessions/conversation-1',
            workspaceRoot: '/workspace'
        })
        expect(mapper.mapWorkspaceToVolume(binding, '/workspace/sessions/conversation-1')).toBe(
            '/sandbox/tenant-1/project/project-1/sessions/conversation-1'
        )
    })

    it('rejects paths outside the mapped workspace', () => {
        expect(() =>
            mapper.mapVolumeToWorkspace(
                {
                    hostRoot: '/mnt/sandbox/tenant-1/project/project-1',
                    serverRoot: '/sandbox/tenant-1/project/project-1'
                },
                { serverPath: '/sandbox/tenant-1/project/project-2' }
            )
        ).toThrow('outside of the mapped volume root')
    })
})
