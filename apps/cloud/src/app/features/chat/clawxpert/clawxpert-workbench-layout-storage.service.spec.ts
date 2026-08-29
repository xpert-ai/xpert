import { TestBed } from '@angular/core/testing'
import {
  ClawXpertWorkbenchLayoutStorage,
  getClawXpertWorkbenchLayoutStorageKey
} from './clawxpert-workbench-layout-storage.service'

const USER_IDS = ['user-1', 'user-2']
const ASSISTANT_IDS = ['assistant-1', 'assistant-2']
const LEGACY_ASSISTANT_ONE_KEY = 'xpert.clawxpert.workbench.layout.v1:assistant-1'

describe('ClawXpertWorkbenchLayoutStorage', () => {
  let storage: ClawXpertWorkbenchLayoutStorage

  beforeEach(() => {
    clearTestStorage()
    TestBed.configureTestingModule({})
    storage = TestBed.inject(ClawXpertWorkbenchLayoutStorage)
  })

  afterEach(() => {
    TestBed.resetTestingModule()
    clearTestStorage()
  })

  it('stores layout states under user- and assistant-specific local storage keys', () => {
    expect(storage.save('user-1', 'assistant-1', 'maximized')).toBe(true)
    expect(storage.save('user-1', 'assistant-2', 'minimized')).toBe(true)
    expect(storage.save('user-2', 'assistant-1', 'normal')).toBe(true)
    expect(storage.save('user-2', 'assistant-2', 'overlay')).toBe(true)

    expect(storage.load('user-1', 'assistant-1')).toBe('maximized')
    expect(storage.load('user-1', 'assistant-2')).toBe('minimized')
    expect(storage.load('user-2', 'assistant-1')).toBe('normal')
    expect(storage.load('user-2', 'assistant-2')).toBe('overlay')
    expect(localStorage.getItem(getClawXpertWorkbenchLayoutStorageKey('user-1', 'assistant-1'))).toBe('maximized')
    expect(localStorage.getItem(getClawXpertWorkbenchLayoutStorageKey('user-1', 'assistant-2'))).toBe('minimized')
  })

  it('ignores empty ids and unsupported stored values', () => {
    localStorage.setItem(getClawXpertWorkbenchLayoutStorageKey('user-1', 'assistant-1'), 'expanded')

    expect(storage.load('user-1', 'assistant-1')).toBeNull()
    expect(storage.load('  ', 'assistant-1')).toBeNull()
    expect(storage.load('user-1', '  ')).toBeNull()
    expect(storage.save('  ', 'assistant-1', 'normal')).toBe(false)
    expect(storage.save('user-1', '  ', 'normal')).toBe(false)
  })

  it('does not reuse legacy assistant-only layout preferences', () => {
    localStorage.setItem(LEGACY_ASSISTANT_ONE_KEY, 'maximized')

    expect(storage.load('user-1', 'assistant-1')).toBeNull()
  })
})

function clearTestStorage() {
  localStorage.removeItem(LEGACY_ASSISTANT_ONE_KEY)
  USER_IDS.forEach((userId) => {
    ASSISTANT_IDS.forEach((assistantId) => {
      localStorage.removeItem(getClawXpertWorkbenchLayoutStorageKey(userId, assistantId))
    })
  })
}
