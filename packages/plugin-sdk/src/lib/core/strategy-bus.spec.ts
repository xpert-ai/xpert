import { StrategyBus } from './strategy-bus'

describe('StrategyBus removal guards', () => {
  it('allows removal when no guards are registered', async () => {
    await expect(new StrategyBus().assertCanRemove('org-a', ['analyzer'])).resolves.toBeUndefined()
  })

  it('awaits each guard with the requested scope and plugin names', async () => {
    const bus = new StrategyBus()
    const calls: string[] = []
    const first = jest.fn(async () => {
      await Promise.resolve()
      calls.push('first')
    })
    const second = jest.fn(async () => {
      calls.push('second')
    })
    bus.registerRemovalGuard(first)
    bus.registerRemovalGuard(second)

    await bus.assertCanRemove('org-a', ['analyzer', 'parser'])

    expect(first).toHaveBeenCalledWith('org-a', ['analyzer', 'parser'])
    expect(second).toHaveBeenCalledWith('org-a', ['analyzer', 'parser'])
    expect(calls).toEqual(['first', 'second'])
  })

  it('propagates a dependency rejection without invoking later guards or emitting removal', async () => {
    const bus = new StrategyBus()
    const error = new Error('Analyzer is in use')
    const laterGuard = jest.fn(async () => undefined)
    const onEvent = jest.fn()
    const subscription = bus.events$.subscribe(onEvent)
    bus.registerRemovalGuard(async () => {
      throw error
    })
    bus.registerRemovalGuard(laterGuard)

    try {
      await expect(bus.assertCanRemove('org-a', ['analyzer'])).rejects.toBe(error)
      expect(laterGuard).not.toHaveBeenCalled()
      expect(onEvent).not.toHaveBeenCalled()
    } finally {
      subscription.unsubscribe()
    }
  })

  it('unregisters only the disposed guard and permits repeated disposal', async () => {
    const bus = new StrategyBus()
    const removed = jest.fn(async () => undefined)
    const retained = jest.fn(async () => undefined)
    const dispose = bus.registerRemovalGuard(removed)
    bus.registerRemovalGuard(retained)
    dispose()
    dispose()

    await bus.assertCanRemove('org-a', ['analyzer'])

    expect(removed).not.toHaveBeenCalled()
    expect(retained).toHaveBeenCalledTimes(1)
  })

  it('keeps removal events separate from the optional preflight check', async () => {
    const bus = new StrategyBus()
    const guard = jest.fn(async () => undefined)
    const onEvent = jest.fn()
    const subscription = bus.events$.subscribe(onEvent)
    bus.registerRemovalGuard(guard)

    try {
      await bus.assertCanRemove('org-a', ['analyzer'])
      expect(onEvent).not.toHaveBeenCalled()
      bus.remove('org-a', 'analyzer', 'refresh')
      expect(onEvent).toHaveBeenCalledWith({
        type: 'REMOVE',
        orgId: 'org-a',
        pluginName: 'analyzer',
        cause: 'refresh'
      })
      expect(guard).toHaveBeenCalledTimes(1)
    } finally {
      subscription.unsubscribe()
    }
  })
})
