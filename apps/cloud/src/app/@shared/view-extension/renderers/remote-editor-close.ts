/** Acknowledge only messages already validated by the frame's instance and scope boundary. */
export type RemoteEditorCloseRequest = { kind: 'prepareClose'; resourceId: string; requestId: string }
export class RemoteEditorClose {
  private pending = new Map<string, (ready: boolean) => void>()
  constructor(private readonly send: (body: RemoteEditorCloseRequest) => void) {}
  prepare(resourceId: string) {
    return new Promise<boolean>((resolve) => {
      const requestId = crypto.randomUUID()
      const finish = (ready: boolean) => {
        clearTimeout(timer)
        this.pending.delete(requestId)
        resolve(ready)
      }
      const timer = setTimeout(() => finish(false), 10000)
      this.pending.set(requestId, finish)
      try {
        this.send({ kind: 'prepareClose', resourceId, requestId })
      } catch {
        finish(false)
      }
    })
  }
  acknowledge(requestId: unknown, ready: unknown) {
    if (typeof requestId === 'string') this.pending.get(requestId)?.(ready === true)
  }
  cancel() {
    for (const finish of this.pending.values()) finish(false)
  }
}
