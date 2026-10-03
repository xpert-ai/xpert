import { TestBed } from '@angular/core/testing'
import { BehaviorSubject, of, Subject } from 'rxjs'
import { ModelExecutionCallView, ModelGatewayCallStatusEnum, ModelGatewayUsageSourceEnum } from '@xpert-ai/contracts'
import { TranslateModule } from '@ngx-translate/core'
import { By } from '@angular/platform-browser'
import { ZardSelectComponent } from '@xpert-ai/headless-ui'
import { Store } from '../../../@core/state'
import { CopilotUsageService } from '../../../@core/services/copilot-usage.service'
import { ExecutionUsageComponent } from './execution-usage.component'

describe('personal execution usage', () => {
  const organization = new BehaviorSubject<string | null>('org-a')
  let component: ExecutionUsageComponent
  const usage = { getExecutionCalls: jest.fn(), getExecutionCallOptions: jest.fn() }
  beforeEach(() => {
    organization.next('org-a')
    usage.getExecutionCalls.mockReset().mockReturnValue(of({ items: [], total: 0 }))
    usage.getExecutionCallOptions.mockReset().mockReturnValue(of({ assistants: [], models: [], tools: [] }))
    TestBed.configureTestingModule({
      imports: [ExecutionUsageComponent, TranslateModule.forRoot()],
      providers: [
        { provide: Store, useValue: { selectOrganizationId: () => organization.asObservable() } },
        { provide: CopilotUsageService, useValue: usage }
      ]
    })
    component = TestBed.runInInjectionContext(() => new ExecutionUsageComponent())
    TestBed.flushEffects()
  })
  afterEach(() => TestBed.resetTestingModule())

  it('renders points with Zard filters, accepts a typed choice and can reset to all', async () => {
    const fixture = TestBed.createComponent(ExecutionUsageComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    const view = fixture.componentInstance
    const receipt: ModelExecutionCallView = {
      id: 'call',
      callId: 'call',
      attemptId: 'attempt',
      modelId: 'model',
      model: 'model-a',
      status: ModelGatewayCallStatusEnum.Succeeded,
      usageSource: ModelGatewayUsageSourceEnum.Provider,
      points: 1.25,
      pricingStatus: 'priced',
      delivered: true,
      startedAt: '2026-10-03T00:00:00Z',
      completedAt: '2026-10-03T00:00:01Z',
      context: {
        tenantId: 'tenant',
        runtimeOrganizationId: 'org-a',
        actorUserId: 'user',
        billableUserId: 'user',
        xpertId: 'assistant',
        assistantName: 'Assistant',
        assistantVersion: '1',
        conversationId: 'conversation',
        source: { type: 'cli_session', cliSessionId: 'session' },
        environment: { type: 'computer', environmentId: 'environment', instanceId: 'instance' },
        tool: { id: 'codex', version: '1.0.0' }
      }
    }
    view.items.set([Object.assign(receipt, { totalTokens: 6751, priceAmount: 0.5, priceCurrency: 'RMB' })])
    fixture.detectChanges()
    const host: HTMLElement = fixture.nativeElement
    expect(host.querySelector('select')).toBeNull()
    expect(host.querySelectorAll('z-select')).toHaveLength(8)
    expect(host.textContent).toContain('1.25')
    expect(host.textContent).not.toMatch(
      /6,751|6751|RMB|ExecutionActualTokens|ExecutionEstimatedTokens|ExecutionReservedTokens/
    )
    const modelSelect: ZardSelectComponent = fixture.debugElement.query(
      By.css('z-select[formControlName="model"]')
    ).componentInstance
    modelSelect.searchTerm.set('custom-model')
    fixture.detectChanges()
    expect(modelSelect.selectItems().some((option) => option.zValue() === 'custom-model')).toBe(true)
    modelSelect.selectItem('custom-model', 'custom-model')
    expect(view.filters.controls.model.value).toBe('custom-model')
    modelSelect.selectItem(view.all, 'All')
    view.applyFilters()
    expect(usage.getExecutionCalls).toHaveBeenLastCalledWith(20, 0, expect.objectContaining({ model: undefined }))
    fixture.destroy()
  })

  it('normalizes filters and keeps pagination on the last applied query', async () => {
    component.filters.patchValue({
      model: ' model-a ',
      tool: '  ',
      startedAfter: '2026-10-01',
      startedBefore: '2026-10-02'
    })
    component.applyFilters()
    await Promise.resolve()
    expect(usage.getExecutionCalls).toHaveBeenLastCalledWith(
      20,
      0,
      expect.objectContaining({
        model: 'model-a',
        tool: undefined,
        startedAfter: new Date('2026-10-01T00:00:00').toISOString(),
        startedBefore: new Date('2026-10-02T23:59:59.999').toISOString()
      })
    )
    component.filters.controls.model.setValue('unapplied-model')
    component.changePage(1)
    expect(usage.getExecutionCalls).toHaveBeenLastCalledWith(20, 20, expect.objectContaining({ model: 'model-a' }))
    component.applyFilters()
    expect(usage.getExecutionCalls).toHaveBeenLastCalledWith(
      20,
      0,
      expect.objectContaining({ model: 'unapplied-model' })
    )
  })

  it.each([
    { executionId: 'invalid-id' },
    { tool: 'x'.repeat(81) },
    { startedAfter: 'invalid-date' },
    { startedAfter: '2026-10-02', startedBefore: '2026-10-01' }
  ])('does not request invalid filters: %j', (value) => {
    usage.getExecutionCalls.mockClear()
    component.filters.patchValue(value)
    expect(component.filters.invalid).toBe(true)
    component.applyFilters()
    expect(usage.getExecutionCalls).not.toHaveBeenCalled()
  })

  it('discards obsolete options even after switching A to B and back to A', async () => {
    const oldOptions = new Subject<{
      assistants: Array<{ id: string; name: string }>
      models: string[]
      tools: string[]
    }>()
    usage.getExecutionCallOptions.mockReturnValueOnce(oldOptions)
    void component.loadOptions()
    organization.next('org-b')
    TestBed.flushEffects()
    usage.getExecutionCallOptions.mockReturnValueOnce(
      of({ assistants: [{ id: 'new', name: 'Current' }], models: ['current-model'], tools: ['codex'] })
    )
    organization.next('org-a')
    TestBed.flushEffects()
    await Promise.resolve()
    oldOptions.next({ assistants: [{ id: 'old', name: 'Obsolete' }], models: ['old-model'], tools: ['old-tool'] })
    await Promise.resolve()
    expect(component.assistants()).toEqual([{ id: 'new', name: 'Current' }])
    expect(component.models()).toEqual(['current-model'])
    expect(component.tools()).toEqual(['codex'])
  })

  it('discards prior organization responses and clears data when leaving organization scope', async () => {
    const pending = new Subject<{ items: ModelExecutionCallView[]; total: number }>()
    usage.getExecutionCalls.mockReturnValueOnce(pending)
    void component.load()
    organization.next('org-b')
    TestBed.flushEffects()
    await Promise.resolve()
    pending.next({ items: [], total: 999 })
    await Promise.resolve()
    expect(component.total()).toBe(0)
    organization.next(null)
    TestBed.flushEffects()
    expect(component.loading()).toBe(false)
    expect(component.assistants()).toEqual([])
    expect(component.models()).toEqual([])
    expect(component.tools()).toEqual([])
    expect(component.items()).toEqual([])
  })
})
