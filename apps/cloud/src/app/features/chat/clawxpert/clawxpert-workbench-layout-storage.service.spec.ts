import { TestBed } from '@angular/core/testing'
import {
  ClawXpertWorkbenchLayoutStorage,
  getClawXpertWorkbenchLayoutStorageKey
} from './clawxpert-workbench-layout-storage.service'

const ASSISTANT_IDS = ['assistant-1', 'assistant-2']

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

  it('stores layout states under assistant-specific local storage keys', () => {
    expect(storage.save('assistant-1', 'maximized')).toBe(true)
    expect(storage.save('assistant-2', 'minimized')).toBe(true)

    expect(storage.load('assistant-1')).toBe('maximized')
    expect(storage.load('assistant-2')).toBe('minimized')
    expect(localStorage.getItem(getClawXpertWorkbenchLayoutStorageKey('assistant-1'))).toBe('maximized')
    expect(localStorage.getItem(getClawXpertWorkbenchLayoutStorageKey('assistant-2'))).toBe('minimized')
  })

  it('ignores empty assistant ids and unsupported stored values', () => {
    localStorage.setItem(getClawXpertWorkbenchLayoutStorageKey('assistant-1'), 'expanded')

    expect(storage.load('assistant-1')).toBeNull()
    expect(storage.load('  ')).toBeNull()
    expect(storage.save('  ', 'normal')).toBe(false)
  })
})

function clearTestStorage() {
  ASSISTANT_IDS.forEach((assistantId) => {
    localStorage.removeItem(getClawXpertWorkbenchLayoutStorageKey(assistantId))
  })
}
