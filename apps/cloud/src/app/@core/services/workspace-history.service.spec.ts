import { effect } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { WorkspaceHistoryService } from './workspace-history.service'

describe('WorkspaceHistoryService', () => {
  let history: WorkspaceHistoryService

  beforeEach(() => {
    localStorage.clear()
    history = TestBed.inject(WorkspaceHistoryService)
  })

  afterEach(() => jest.restoreAllMocks())

  it('persists usage order across instances and promotes revisited workspaces without duplicates', () => {
    history.remember('user-1', 'org-1', 'workspace-1')
    history.remember('user-1', 'org-1', 'workspace-2')
    history.remember('user-1', 'org-1', 'workspace-1')
    const restored = TestBed.runInInjectionContext(() => new WorkspaceHistoryService())

    expect(restored.recent('user-1', 'org-1')).toEqual(['workspace-1', 'workspace-2'])
  })

  it('isolates users, organizations and tenant scope and ignores anonymous visits', () => {
    history.remember('user-1', 'org-1', 'org-workspace')
    history.remember('user-1', null, 'tenant-workspace')
    history.remember(null, 'org-1', 'anonymous-workspace')

    expect(history.recent('user-1', 'org-1')).toEqual(['org-workspace'])
    expect(history.recent('user-1', null)).toEqual(['tenant-workspace'])
    expect(history.recent('user-1', 'org-2')).toEqual([])
    expect(history.recent('user-2', 'org-1')).toEqual([])
    expect(history.recent(null, 'org-1')).toEqual([])
  })

  it('bounds stored history and tolerates malformed storage', () => {
    localStorage.setItem('xpert.workspace-history.v1:user-1:org-1', 'invalid json')
    localStorage.setItem('xpert.workspace-history.v1:user-2:org-1', '[null, 42, {}, "", "  ", "valid", "valid"]')
    expect(history.recent('user-1', 'org-1')).toEqual([])
    expect(history.recent('user-2', 'org-1')).toEqual(['valid'])

    for (let index = 0; index < 60; index++) history.remember('user-1', 'org-1', `workspace-${index}`)
    expect(history.recent('user-1', 'org-1')).toHaveLength(50)
    expect(history.recent('user-1', 'org-1')[0]).toBe('workspace-59')
    expect(history.recent('user-1', 'org-1')[49]).toBe('workspace-10')
  })

  it('keeps history usable when browser storage is unavailable', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage blocked')
    })
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage blocked')
    })
    expect(() => history.remember('user-1', 'org-1', 'workspace-1')).not.toThrow()
    expect(history.recent('user-1', 'org-1')).toEqual(['workspace-1'])
  })

  it('does not subscribe workspace-selection effects to history writes', () => {
    const selected = jest.fn(() => history.remember('user-1', 'org-1', 'workspace-1'))
    const ref = TestBed.runInInjectionContext(() => effect(selected))
    TestBed.flushEffects()
    history.remember('user-1', 'org-1', 'workspace-2')
    TestBed.flushEffects()

    expect(selected).toHaveBeenCalledTimes(1)
    expect(history.recent('user-1', 'org-1')).toEqual(['workspace-2', 'workspace-1'])
    ref.destroy()
  })
})
