/** Serialize writes; only adjacent identical requests may share a pending save. */
export class DraftSaveQueue<T> {
  private tail: Promise<unknown> = Promise.resolve()
  private lastKey: string | null = null
  private lastRequest: Promise<T> | null = null

  save(value: T, write: (snapshot: T) => Promise<T>): Promise<T> {
    const snapshot = structuredClone(value)
    const key = JSON.stringify(snapshot)
    if (key === this.lastKey && this.lastRequest) return this.lastRequest
    const request = this.tail.then(() => write(snapshot))
    this.lastKey = key
    this.lastRequest = request
    const finished = () => {
      if (this.lastRequest === request) {
        this.lastKey = null
        this.lastRequest = null
      }
    }
    this.tail = request.then(finished, finished)
    return request
  }
}
