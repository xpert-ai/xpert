// One acknowledged frame at a time bounds wire traffic and avoids replay bursts.
const key = (value) => JSON.stringify([value.operationId, value.type, value.seq, value.state])
class ReportDelivery {
  constructor(send, acknowledge, { delay = 20, retry = 5000 } = {}) {
    this.send = send
    this.acknowledge = acknowledge
    this.delay = delay
    this.retry = retry
    this.queue = new Map()
    this.inflight = null
    this.ready = false
  }
  enqueue(report) {
    this.queue.set(key(report), report)
    this.pump()
  }
  connect() {
    this.reset()
    this.ready = true
  }
  reset() {
    clearTimeout(this.timer)
    this.ready = false
    this.inflight = null
    this.queue.clear()
  }
  pump() {
    if (!this.ready || this.inflight || !this.queue.size) return
    this.inflight = this.queue.keys().next().value
    const send = () => {
      if (!this.ready || !this.inflight) return
      this.send(this.queue.get(this.inflight))
      this.timer = setTimeout(send, this.retry)
      this.timer.unref()
    }
    send()
  }
  ack(message) {
    if (!this.inflight || !this.queue.has(this.inflight) || key(message) !== this.inflight) return
    const report = this.queue.get(this.inflight)
    clearTimeout(this.timer)
    this.queue.delete(this.inflight)
    // Retain the in-flight gate until the rate-limit delay has elapsed.
    this.acknowledge(report)
    this.timer = setTimeout(() => {
      this.inflight = null
      this.pump()
    }, this.delay)
    this.timer.unref()
  }
  async flush(timeout = 2000) {
    const deadline = Date.now() + timeout
    while (this.ready && this.queue.size && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    return this.queue.size === 0
  }
}
module.exports = { ReportDelivery }
