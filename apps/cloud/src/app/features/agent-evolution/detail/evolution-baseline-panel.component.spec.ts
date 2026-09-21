import { signal } from '@angular/core'
import { fakeAsync, flushMicrotasks, TestBed } from '@angular/core/testing'
import { Subject } from 'rxjs'
import type { EvolutionBaselineInspection } from '@xpert-ai/contracts'
import { ScopeService } from '@cloud/app/@core'
import { AgentEvolutionApiService } from '../agent-evolution-api.service'
import { EvolutionBaselinePanelComponent } from './evolution-baseline-panel.component'

jest.mock('@cloud/app/@core', () => ({ ScopeService: class {} }))

describe('EvolutionBaselinePanelComponent', () => {
  it('clears the previous organization and ignores its delayed response after scope changes', fakeAsync(() => {
    const activeScope = signal('organization-a')
    const first = new Subject<EvolutionBaselineInspection>()
    const second = new Subject<EvolutionBaselineInspection>()
    const getRuleBaseline = jest.fn().mockReturnValueOnce(first).mockReturnValueOnce(second)
    TestBed.configureTestingModule({
      imports: [EvolutionBaselinePanelComponent],
      providers: [
        { provide: ScopeService, useValue: { activeScope } },
        { provide: AgentEvolutionApiService, useValue: { getRuleBaseline } }
      ]
    }).overrideComponent(EvolutionBaselinePanelComponent, { set: { template: '', imports: [] } })
    const fixture = TestBed.createComponent(EvolutionBaselinePanelComponent)
    fixture.componentRef.setInput('targetId', 'automotive.rules')
    fixture.detectChanges()
    activeScope.set('organization-b')
    fixture.detectChanges()

    first.next({
      targetId: 'automotive.rules',
      canManage: true,
      status: 'missing',
      current: null,
      preview: { ready: true, hash: 'old', contentJson: '{"scope":"previous"}', issues: [] }
    })
    flushMicrotasks()
    expect(fixture.componentInstance.data()).toBeNull()
    expect(fixture.componentInstance.loading()).toBe(true)

    second.error(new Error('Permission denied in the new scope'))
    flushMicrotasks()
    expect(fixture.componentInstance.data()).toBeNull()
    expect(fixture.componentInstance.loading()).toBe(false)
    expect(fixture.componentInstance.error()).toBe(true)
    expect(getRuleBaseline).toHaveBeenCalledTimes(2)
    fixture.destroy()
  }))
})
