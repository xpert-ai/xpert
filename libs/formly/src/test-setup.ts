import { setupZoneTestEnv } from 'jest-preset-angular/setup-env/zone'

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

(globalThis as typeof globalThis & { ResizeObserver?: typeof ResizeObserverMock }).ResizeObserver = ResizeObserverMock

setupZoneTestEnv({
  teardown: { destroyAfterEach: false }
})
