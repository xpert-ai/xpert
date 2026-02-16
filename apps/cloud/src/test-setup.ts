import { setupZoneTestEnv } from 'jest-preset-angular/setup-env/zone'
import { ReadableStream, TransformStream, WritableStream } from 'node:stream/web'

if (!(globalThis as any).ReadableStream) {
  ;(globalThis as any).ReadableStream = ReadableStream
}

if (!(globalThis as any).WritableStream) {
  ;(globalThis as any).WritableStream = WritableStream
}

if (!(globalThis as any).TransformStream) {
  ;(globalThis as any).TransformStream = TransformStream
}

if (!(globalThis as any).ResizeObserver) {
  ;(globalThis as any).ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

setupZoneTestEnv({
  teardown: { destroyAfterEach: false }
})
