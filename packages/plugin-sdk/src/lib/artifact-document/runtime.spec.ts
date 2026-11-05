import { runInNewContext } from 'node:vm'
import { renderArtifactDocument } from './runtime'

type Dataset = { bindingId: string; value: number }
type Port = {
  onmessage?: (event: { data: object }) => void
  start(): void
  postMessage(value: { requestId: string; bindingId: string }): void
}
const flush = async () => {
  for (let index = 0; index < 10; index++) await Promise.resolve()
}
function runtime() {
  const requests: Array<{ requestId: string; bindingId: string }> = []
  const listeners: Array<(event: object) => void> = []
  const parent = { postMessage() {} },
    port: Port = {
      start() {},
      postMessage(value) {
        requests.push(value)
      }
    }
  const window: {
    addEventListener: (type: string, listener: (event: object) => void) => void
    xpertLiveArtifact?: {
      queryMany(ids: string[], controls: Record<string, number>): Promise<{ datasets: Dataset[]; failures: object[] }>
      query(id: string, controls: Record<string, number>): Promise<Dataset>
      subscribe(id: string, callback: (data: Dataset) => void): void
    }
  } = {
    addEventListener(_type, listener) {
      listeners.push(listener)
    }
  }
  const html = renderArtifactDocument('<html><body>Test</body></html>', 'a'.repeat(32))
  const script = html.slice(html.indexOf('<script>') + 8, html.indexOf('</script>'))
  runInNewContext(script, {
    window,
    parent,
    console,
    setTimeout,
    clearTimeout,
    document: { documentElement: { dataset: {}, style: {} } }
  })
  listeners[0]({
    source: parent,
    data: {
      type: 'init',
      channel: 'xpert.artifact-document',
      version: 1,
      sessionId: 'a'.repeat(32),
      context: { bindingIds: ['a', 'b'], defaults: {}, theme: 'light', locale: 'en' }
    },
    ports: [port]
  })
  const respond = (index: number, value: number) =>
    port.onmessage!({
      data: {
        type: 'result',
        requestId: requests[index].requestId,
        ok: true,
        dataset: { bindingId: requests[index].bindingId, value }
      }
    })
  return { live: window.xpertLiveArtifact!, requests, respond }
}
describe('Artifact document result rounds', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())
  it('delivers a multi-source filter round only after its members settle', async () => {
    const { live, respond } = runtime(),
      delivered: Dataset[] = []
    live.subscribe('a', (value) => delivered.push(value))
    live.subscribe('b', (value) => delivered.push(value))
    const result = live.queryMany(['a', 'b'], { region: 1 })
    await flush()
    respond(0, 1)
    await flush()
    expect(delivered).toHaveLength(0)
    respond(1, 2)
    await result
    expect(delivered.map((value) => value.value)).toEqual([1, 2])
    expect(jest.getTimerCount()).toBe(0)
  })
  it('a newer group prevents late old controls from being delivered', async () => {
    const { live, respond } = runtime(),
      delivered: Dataset[] = []
    live.subscribe('a', (value) => delivered.push(value))
    live.subscribe('b', (value) => delivered.push(value))
    const old = live.queryMany(['a', 'b'], { region: 1 }).catch((error) => error.code)
    await flush()
    const current = live.queryMany(['a', 'b'], { region: 2 })
    await flush()
    respond(2, 20)
    respond(3, 21)
    await current
    respond(0, 10)
    respond(1, 11)
    expect(await old).toBe('DOCUMENT_QUERY_SUPERSEDED')
    expect(delivered.map((value) => value.value)).toEqual([20, 21])
    expect(jest.getTimerCount()).toBe(0)
  })
})
