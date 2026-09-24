const { test } = require('node:test')
const assert = require('node:assert/strict')
const { ReportDelivery } = require('../electron/shell/delivery.cjs')
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const report = (seq) => ({ operationId: 'operation', type: 'output', state: 'running', seq, data: String(seq) })
test('requires matching ACK and paces frames; duplicate ACK cannot release the next frame', async (t) => {
  const sent = [],
    confirmed = []
  const delivery = new ReportDelivery(
    (value) => sent.push(value),
    (value) => confirmed.push(value),
    { delay: 10, retry: 1000 }
  )
  t.after(() => delivery.reset())
  delivery.connect()
  delivery.enqueue(report(1))
  delivery.enqueue(report(2))
  assert.deepEqual(
    sent.map((r) => r.seq),
    [1]
  )
  delivery.ack(report(2))
  assert.equal(confirmed.length, 0)
  delivery.ack(report(1))
  delivery.ack(report(1))
  assert.equal(confirmed.length, 1)
  assert.equal(sent.length, 1)
  await sleep(30)
  assert.deepEqual(
    sent.map((r) => r.seq),
    [1, 2]
  )
  delivery.ack(report(2))
  assert.equal(confirmed.length, 2)
})
test('lost ACK retries the same frame; reconnect discards obsolete epoch queue', async (t) => {
  const sent = []
  const delivery = new ReportDelivery(
    (value) => sent.push(value),
    () => {},
    { delay: 5, retry: 15 }
  )
  t.after(() => delivery.reset())
  delivery.connect()
  delivery.enqueue(report(1))
  await sleep(40)
  assert.ok(sent.length >= 2)
  assert.ok(sent.every((r) => r.seq === 1))
  delivery.reset()
  const count = sent.length
  await sleep(30)
  assert.equal(sent.length, count)
  delivery.connect()
  delivery.enqueue(report(2))
  assert.equal(sent.at(-1).seq, 2)
})

test('graceful shutdown waits for a durable final ACK with a bounded deadline', async (t) => {
  const delivery = new ReportDelivery(
    () => {},
    () => {},
    { delay: 5, retry: 1000 }
  )
  t.after(() => delivery.reset())
  delivery.connect()
  delivery.enqueue(report(1))
  assert.equal(await delivery.flush(20), false)
  delivery.ack(report(1))
  assert.equal(await delivery.flush(100), true)
})
