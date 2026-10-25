import { Injectable } from '@angular/core'

/** Page lifecycle only: ChatKit owns the meaning of "ready to leave" and all editor state. */
@Injectable({ providedIn: 'root' })
export class ChatkitLifecycleService {
  private readonly participants = new Map<HTMLElement, () => Promise<boolean>>()

  register(host: HTMLElement) {
    this.participants.set(host, async () => {
      // Resolve on demand because the web component may mount after its Angular container.
      const element = host.tagName.toLowerCase() === 'xpertai-chatkit'
        ? host : host.querySelector<HTMLElement>('xpertai-chatkit')
      if (!element) return true
      if (!('prepareLeave' in element) || typeof element.prepareLeave !== 'function') return false
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        // A stalled frame must not hang routing forever or implicitly allow data loss.
        return await Promise.race([
          element.prepareLeave(),
          new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), 15000) })
        ]) === true
      } catch {
        return false
      } finally {
        clearTimeout(timer)
      }
    })
    return () => this.participants.delete(host)
  }

  async prepareLeave(): Promise<boolean> {
    return (await Promise.all([...this.participants.values()].map((prepare) => prepare()))).every(Boolean)
  }
}
