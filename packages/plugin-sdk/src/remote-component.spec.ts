/** @jest-environment jsdom */
import { connect, request, scopedRequest } from './remote-component'

const channel = 'xpertai.remote_component'
function message(type: string, body: object = {}) {
  window.dispatchEvent(
    new MessageEvent('message', {
      source: window.parent,
      data: { channel, protocolVersion: 1, instanceId: 'view', type, ...body }
    })
  )
}

describe('remote component browser transport', () => {
  let close: () => void
  beforeEach(() => {
    jest.useFakeTimers()
    jest.spyOn(window.parent, 'postMessage').mockImplementation(() => {})
  })
  afterEach(() => {
    close()
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('passes host appearance to the UI and correlates replies to the active invocation', async () => {
    const init = jest.fn()
    close = connect(init, jest.fn())
    const theme = { mode: 'dark', density: 'compact', tokens: { fontSize: 14 } }
    message('init', { scopeRevision: 1, locale: 'zh-Hans', theme })
    expect(init).toHaveBeenCalledWith({ locale: 'zh-Hans', theme }, true)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    const pending = request('requestData', { query: {} })
    const calls = jest.mocked(window.parent.postMessage).mock.calls
    const { requestId } = calls[calls.length - 1][0]
    message('data', { requestId, protocolVersion: 2, data: 'unsupported protocol' })
    message('data', { requestId, instanceId: 'other', data: 'wrong instance' })
    message('data', { requestId, scopeRevision: 0, data: 'old scope' })
    message('data', { requestId, scopeRevision: 1, data: null })
    await expect(pending).resolves.toBeNull()
  })

  it('invalidates pending and pinned requests on scope changes and releases them on close', async () => {
    const reset = jest.fn()
    close = connect(jest.fn(), reset)
    message('init', { scopeRevision: 1 })
    const pinned = scopedRequest()
    const beforeChange = request('requestData')
    message('hostEvent', {
      event: { type: 'view.context.changed', data: { revision: 2, runtimeScope: { projectId: 'new' } } }
    })
    await expect(beforeChange).rejects.toThrow('View context changed')
    await expect(pinned('executeFileAction')).rejects.toThrow('View context changed')
    expect(reset).toHaveBeenCalledTimes(1)
    const stillCurrent = scopedRequest()
    message('init', { scopeRevision: 1 })
    const beforeClose = stillCurrent('requestData')
    close()
    await expect(beforeClose).rejects.toThrow('View closed')
    await expect(request('requestData')).rejects.toThrow('not connected')
    expect(jest.getTimerCount()).toBe(0)
  })
})
