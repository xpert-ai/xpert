import { Controller, Get, INestApplication, Logger, ServiceUnavailableException, UseInterceptors } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { AddressInfo } from 'node:net'
import { ThreadReadDiagnosticsInterceptor } from './thread-read-diagnostics.interceptor'

let unavailable = true
const backend = { status: 'running', toolCalls: 1, progress: 0 }
@Controller('threads')
@UseInterceptors(ThreadReadDiagnosticsInterceptor)
class StatusController {
    @Get('thread/runs/run')
    getRun() {
        if (unavailable) throw new ServiceUnavailableException('private diagnostic text')
        return backend
    }
}

describe('running task with temporarily unavailable status reads', () => {
    let app: INestApplication
    afterEach(async () => {
        await app?.close()
        jest.restoreAllMocks()
    })
    it('keeps execution independent of repeated HTTP 503 and records only backend diagnostics', async () => {
        unavailable = true
        const logs = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
        const module = await Test.createTestingModule({
            controllers: [StatusController],
            providers: [ThreadReadDiagnosticsInterceptor]
        }).compile()
        app = module.createNestApplication()
        await app.listen(0, '127.0.0.1')
        const origin = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`
        for (let n = 0; n < 3; n++) {
            backend.progress++
            const response = await fetch(`${origin}/threads/thread/runs/run`)
            expect(response.status).toBe(503)
            expect(response.headers.get('x-request-id')).toMatch(/^[\da-f-]{36}$/)
            expect(backend.status).toBe('running')
        }
        unavailable = false
        const response = await fetch(`${origin}/threads/thread/runs/run`)
        expect(await response.json()).toEqual({ status: 'running', toolCalls: 1, progress: 3 })
        expect(logs).toHaveBeenCalledTimes(3)
        expect(logs.mock.calls[0][0]).toContain('chat.read.failed')
        expect(logs.mock.calls[0][0]).toContain('"status":503')
        expect(JSON.stringify(logs.mock.calls)).not.toContain('private diagnostic text')
    })
})
