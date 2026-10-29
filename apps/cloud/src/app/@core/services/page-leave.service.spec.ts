import { DestroyRef } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { PageLeaveService } from './page-leave.service'

describe('Full-page leave checks', () => {
  let service: PageLeaveService
  let destroy: () => void
  let owner: DestroyRef
  beforeEach(() => {
    service = TestBed.inject(PageLeaveService)
    owner = {
      onDestroy: (callback) => {
        destroy = callback
        return () => undefined
      }
    }
  })
  afterEach(() => {
    TestBed.resetTestingModule()
    jest.useRealTimers()
  })

  it('runs the mounted editor check and unregisters it on destruction', async () => {
    const check = jest.fn(async () => false)
    service.register(check, owner)
    expect(await service.prepareLeave()).toBe(false)
    destroy()
    expect(await service.prepareLeave()).toBe(true)
    expect(check).toHaveBeenCalledTimes(1)
  })

  it('does not open another editor prompt after cancellation', async () => {
    const next = jest.fn(async () => true)
    service.register(async () => false, owner)
    service.register(next, owner)
    expect(await service.prepareLeave()).toBe(false)
    expect(next).not.toHaveBeenCalled()
  })

  it('fails closed when an editor throws', async () => {
    service.register(async () => {
      throw new Error('Save failed')
    }, owner)
    expect(await service.prepareLeave()).toBe(false)
  })

  it('does not authorize a late result after timeout', async () => {
    jest.useFakeTimers()
    let done: (value: boolean) => void = () => undefined
    service.register(
      () =>
        new Promise((resolve) => {
          done = resolve
        }),
      owner
    )
    const result = service.prepareLeave()
    await jest.advanceTimersByTimeAsync(15000)
    expect(await result).toBe(false)
    done(true)
    expect(await result).toBe(false)
  })
})
