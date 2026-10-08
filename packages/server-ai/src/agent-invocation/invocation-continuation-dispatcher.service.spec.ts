jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { InvocationContinuationDispatcher } from './invocation-continuation-dispatcher.service'
import { AgentInvocationWaitStore } from './invocation-wait.store'
import { AgentInvocationMonitorService } from './invocation-monitor.service'
import { AgentInvocationWaitEntity } from './invocation.entity'

it('does not hold the dispatcher scan open while a parent is running', async () => {
    let finish: () => void
    const running = new Promise<void>((resolve) => {
        finish = resolve
    })
    const rows = Array.from({ length: 6 }, (_, i) => Object.assign(new AgentInvocationWaitEntity(), { id: String(i) }))
    const waits = { records: { find: jest.fn(async () => rows) } }
    const monitor = { deliver: jest.fn(() => running) }
    const dispatcher = new InvocationContinuationDispatcher(
        waits as unknown as AgentInvocationWaitStore,
        monitor as unknown as AgentInvocationMonitorService
    )
    await dispatcher.dispatch()
    expect(monitor.deliver).toHaveBeenCalledTimes(4)
    await dispatcher.dispatch()
    expect(monitor.deliver).toHaveBeenCalledTimes(4)
    finish!()
    await new Promise<void>((resolve) => setImmediate(resolve))
    rows.splice(0, 4)
    await dispatcher.dispatch()
    expect(monitor.deliver).toHaveBeenCalledTimes(6)
    dispatcher.onModuleDestroy()
    await dispatcher.dispatch()
    expect(monitor.deliver).toHaveBeenCalledTimes(6)
})
