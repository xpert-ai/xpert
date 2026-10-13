import { ComponentFixture, TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { ReferralService } from '@cloud/app/@core/state'
import { IReferralRelationView } from '@xpert-ai/contracts'
import { ToastrService } from '../../../@core/services/toastr.service'
import { ReferralRelationsComponent } from './referrals.component'

const relation: IReferralRelationView = {
  id: 'relation-1',
  referrer: { id: 'alice', name: 'Alice', email: 'alice@example.com', deleted: false },
  referred: { id: 'bob', name: 'Bob', email: 'bob@example.com', deleted: false },
  usedCode: 'TEAM234ABC',
  boundAt: new Date('2026-10-10T10:00:00Z')
}
const populated = { items: [relation], total: 42 }
const empty = { items: [], total: 0 }

describe('ReferralRelationsComponent', () => {
  let getRelations: jest.Mock
  let toastr: { error: jest.Mock }
  let fixture: ComponentFixture<ReferralRelationsComponent>
  let component: ReferralRelationsComponent
  let root: HTMLElement

  beforeEach(async () => {
    getRelations = jest.fn().mockResolvedValue(empty)
    toastr = { error: jest.fn() }
    await TestBed.configureTestingModule({
      imports: [ReferralRelationsComponent, TranslateModule.forRoot()],
      providers: [
        { provide: ReferralService, useValue: { getRelations } },
        { provide: ToastrService, useValue: toastr }
      ]
    }).compileComponents()
    fixture = TestBed.createComponent(ReferralRelationsComponent)
    component = fixture.componentInstance
    root = fixture.nativeElement
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    getRelations.mockClear()
  })

  afterEach(() => TestBed.resetTestingModule())

  it('renders read-only relationships, code and timestamp without exposing deleted account details', async () => {
    getRelations.mockResolvedValue({
      items: [
        relation,
        {
          ...relation,
          id: 'deleted',
          referrer: { ...relation.referrer, name: 'Private name', email: 'hidden@example.com', deleted: true }
        }
      ],
      total: 2
    })
    await component.load()
    fixture.detectChanges()
    expect(root.querySelectorAll('thead th')).toHaveLength(4)
    expect(root.querySelectorAll('tbody tr')).toHaveLength(2)
    expect(root.textContent).toContain('Alice')
    expect(root.textContent).toContain('bob@example.com')
    expect(root.textContent).toContain('TEAM234ABC')
    expect(root.querySelector('time')?.getAttribute('datetime')).toContain('2026-10-10')
    expect(root.textContent).toContain('XP.Referral.DeletedAccount')
    expect(root.textContent).not.toContain('Private name')
    expect(root.textContent).not.toContain('hidden@example.com')
    expect(root.querySelector('tbody a')).toBeNull()
    expect(root.querySelector('tbody button')).toBeNull()
  })

  it('distinguishes the empty directory from submitted searches and resets search to the first page', async () => {
    expect(root.textContent).toContain('XP.Referral.EmptyHint')
    expect(root.querySelector('[aria-label="XP.Referral.Next"]')).toBeNull()
    component.filterForm.controls.search.setValue('  absent  ')
    component.search()
    await fixture.whenStable()
    fixture.detectChanges()
    expect(getRelations).toHaveBeenLastCalledWith({ search: 'absent', skip: 0, take: 20 })
    expect(root.textContent).toContain('XP.Referral.NoResults')
    const clearButton = Array.from(root.querySelectorAll('tbody button')).find((b) =>
      b.textContent.includes('XP.Referral.ClearSearch')
    )
    clearButton?.click()
    await fixture.whenStable()
    fixture.detectChanges()
    expect(getRelations).toHaveBeenLastCalledWith({ search: undefined, skip: 0, take: 20 })
    expect(component.filterForm.controls.search.value).toBe('')
    expect(root.textContent).toContain('XP.Referral.EmptyHint')
  })

  it('paginates the submitted query, retains server totals and disables boundary buttons', async () => {
    getRelations.mockResolvedValue(populated)
    component.filterForm.controls.search.setValue('Alice')
    await component.load()
    fixture.detectChanges()
    expect(root.querySelector<HTMLButtonElement>('[aria-label="XP.Referral.Previous"]')?.disabled).toBe(true)
    component.filterForm.controls.search.setValue('unsubmitted draft')
    component.nextPage()
    await fixture.whenStable()
    expect(getRelations).toHaveBeenLastCalledWith({ search: 'Alice', skip: 20, take: 20 })
    component.nextPage()
    await fixture.whenStable()
    fixture.detectChanges()
    expect(component.pageCount()).toBe(3)
    expect(component.pageIndex()).toBe(2)
    expect(root.querySelector<HTMLButtonElement>('[aria-label="XP.Referral.Next"]')?.disabled).toBe(true)
    component.previousPage()
    await fixture.whenStable()
    expect(getRelations).toHaveBeenLastCalledWith({ search: 'Alice', skip: 20, take: 20 })
  })

  it('keeps the last loaded results on failure and retries the failed query and page', async () => {
    getRelations.mockResolvedValue(populated)
    await component.load(0, 'Alice')
    getRelations.mockRejectedValueOnce(new Error('request failed'))
    await expect(component.load(1, 'Alice')).resolves.toBe(false)
    fixture.detectChanges()
    expect(toastr.error).toHaveBeenCalledWith('request failed')
    expect(component.loading()).toBe(false)
    expect(component.pageIndex()).toBe(0)
    expect(component.total()).toBe(42)
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('XP.Referral.LoadError')
    expect(root.querySelectorAll('tbody tr')).toHaveLength(1)
    component.filterForm.controls.search.setValue('draft')
    root.querySelector<HTMLButtonElement>('[role="alert"] button')?.click()
    await fixture.whenStable()
    fixture.detectChanges()
    expect(getRelations).toHaveBeenLastCalledWith({ search: 'Alice', skip: 20, take: 20 })
    expect(component.pageIndex()).toBe(1)
    expect(root.querySelector('[role="alert"]')).toBeNull()
  })

  it('does not let older search results overwrite the latest query or finish its loading state', async () => {
    let resolveOlder: (value: typeof populated) => void
    let resolveNewer: (value: typeof empty) => void
    getRelations
      .mockReturnValueOnce(new Promise((resolve) => (resolveOlder = resolve)))
      .mockReturnValueOnce(new Promise((resolve) => (resolveNewer = resolve)))
    const older = component.load(0, 'old')
    const newer = component.load(0, 'new')
    fixture.detectChanges()
    expect(root.querySelector('[aria-busy="true"]')).not.toBeNull()
    resolveOlder(populated)
    await older
    expect(component.loading()).toBe(true)
    expect(component.relations()).toEqual([])
    resolveNewer(empty)
    await newer
    expect(component.appliedSearch()).toBe('new')
    expect(component.loading()).toBe(false)
  })

  it('refreshes the displayed query and clears the applied search using the Zard search control', async () => {
    getRelations.mockResolvedValue(empty)
    await component.load(0, 'Alice')
    component.filterForm.controls.search.setValue('Alice')
    fixture.detectChanges()
    const input = root.querySelector<HTMLInputElement>('input[type="search"]')
    input.value = 'unsent'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    fixture.detectChanges()
    root.querySelector<HTMLButtonElement>('[aria-label="XP.Referral.Refresh"]')?.click()
    await fixture.whenStable()
    expect(getRelations).toHaveBeenLastCalledWith({ search: 'Alice', skip: 0, take: 20 })
    root.querySelector<HTMLButtonElement>('z-search-input [aria-label="XP.Referral.ClearSearch"]')?.click()
    await fixture.whenStable()
    expect(getRelations).toHaveBeenLastCalledWith({ search: undefined, skip: 0, take: 20 })
    expect(component.filterForm.controls.search.value).toBe('')
  })
})
