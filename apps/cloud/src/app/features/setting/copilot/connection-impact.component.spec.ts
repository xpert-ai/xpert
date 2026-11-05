import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { TestBed } from '@angular/core/testing'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ConnectionImpact, ConnectionImpactReference } from '@xpert-ai/contracts'
import { of, Subject, throwError } from 'rxjs'
import { CopilotServerService } from '../../../@core'
import { ConnectionImpactDialogComponent } from './connection-impact.component'
import en from '../../../../assets/i18n/en-US.json'
import zh from '../../../../assets/i18n/zh-Hans.json'

const row: ConnectionImpactReference = {
  resourceType: 'assistant',
  resourceId: 'assistant-1',
  resourceName: 'Example assistant',
  organizationId: 'org-1',
  version: '2',
  status: 'published',
  evidence: 'relation',
  field: 'copilotModelId',
  bindingId: 'binding-1',
  model: 'test-llm',
  modelType: 'llm'
}
const impact: ConnectionImpact = {
  scope: { tenantId: 'tenant-1' },
  defaults: 1,
  bindings: 3,
  drafts: 1,
  bindingUsage: { current: 1, historicalOnly: 1, unresolved: 1 },
  currentResources: 1,
  historicalResources: 1,
  jsonMatches: 1,
  references: [
    {
      ...row,
      resourceType: 'default',
      resourceId: 'default-1',
      resourceName: 'primary',
      evidence: 'default',
      field: 'role-defaults.primary',
      bindingId: null
    },
    row,
    { ...row, resourceId: 'old-1', status: 'historical', version: '1' },
    { ...row, status: 'draft', evidence: 'json', field: 'draft.team.graph.nodes[0].copilotModel' }
  ]
}
describe('connection disable impact', () => {
  function setup() {
    const server = { getConnectionReferences: jest.fn().mockReturnValue(of(impact)) }
    const dialog = { close: jest.fn() }
    TestBed.configureTestingModule({
      imports: [ConnectionImpactDialogComponent, TranslateModule.forRoot()],
      providers: [
        { provide: DIALOG_DATA, useValue: { id: 'connection-1', name: 'Test connection' } },
        { provide: DialogRef, useValue: dialog },
        { provide: CopilotServerService, useValue: server }
      ]
    })
    const translate = TestBed.inject(TranslateService)
    translate.setTranslation('en', en)
    translate.setTranslation('zh', zh)
    translate.use('en')
    const fixture = TestBed.createComponent(ConnectionImpactDialogComponent)
    return { fixture, component: fixture.componentInstance, server, dialog, translate }
  }
  afterEach(() => TestBed.resetTestingModule())
  it('shows units, scope, model, field, version and actionable default blockers in both languages', async () => {
    const { fixture, component, dialog, translate } = setup()
    await fixture.whenStable()
    fixture.detectChanges()
    expect(fixture.nativeElement.textContent).toContain('tenant-1')
    expect(fixture.nativeElement.textContent).toContain('Saved model bindings (records)')
    expect(fixture.nativeElement.textContent).toContain('role-defaults.primary')
    expect(fixture.nativeElement.textContent).toContain('test-llm')
    expect(fixture.nativeElement.textContent).toContain('Version 2')
    expect(fixture.nativeElement.querySelector('details').open).toBe(true)
    component.confirm()
    expect(dialog.close).not.toHaveBeenCalled()
    expect(fixture.nativeElement.querySelector('footer button:last-child').disabled).toBe(true)
    translate.use('zh')
    fixture.detectChanges()
    expect(fixture.nativeElement.textContent).toContain('已保存的模型绑定（条记录）')
    expect(fixture.nativeElement.textContent).toContain('实际使用待确认')
    expect(fixture.nativeElement.textContent).not.toContain('XP.Copilot.Impact.')
  })
  it('keeps nested snapshot matches out of current and historical direct groups', async () => {
    const { fixture, component } = setup()
    await fixture.whenStable()
    expect(component.groups().map((g) => [g.key, g.count])).toEqual([
      ['defaults', 1],
      ['current', 1],
      ['historical', 1],
      ['unresolved', 1]
    ])
    component.search.set('draft.team.graph')
    fixture.detectChanges()
    expect(component.groups().map((g) => g.count)).toEqual([0, 0, 0, 1])
    expect(fixture.nativeElement.textContent).toContain('Effective usage is unconfirmed')
  })
  it('fails closed after a failed reload and permits retry without stale default data', async () => {
    const { fixture, component, server, dialog } = setup()
    await fixture.whenStable()
    server.getConnectionReferences.mockReturnValueOnce(throwError(() => new Error('Unavailable')))
    await component.load()
    fixture.detectChanges()
    component.confirm()
    expect(component.references()).toBeNull()
    expect(component.error()).toBeTruthy()
    expect(dialog.close).not.toHaveBeenCalled()
    server.getConnectionReferences.mockReturnValue(of({ ...impact, defaults: 0 }))
    await component.load()
    component.confirm()
    expect(dialog.close).toHaveBeenCalledWith(true)
  })
  it('cannot confirm during loading and cancels without changing the connection', async () => {
    const { fixture, component, server, dialog } = setup()
    await fixture.whenStable()
    const response = new Subject<ConnectionImpact>()
    server.getConnectionReferences.mockReturnValue(response)
    const pending = component.load()
    component.confirm()
    expect(dialog.close).not.toHaveBeenCalled()
    fixture.detectChanges()
    fixture.nativeElement.querySelector('footer button').click()
    expect(dialog.close).toHaveBeenCalledWith()
    response.next(impact)
    response.complete()
    await pending
  })
  it('pages large reference groups and searches all entries', async () => {
    const { fixture, component, server } = setup()
    await fixture.whenStable()
    server.getConnectionReferences.mockReturnValue(
      of({
        ...impact,
        references: Array.from({ length: 45 }, (_, i) => ({
          ...row,
          resourceName: `Resource ${i}`,
          resourceId: `resource-${i}`
        }))
      })
    )
    await component.load()
    expect(component.groups().find((g) => g.key === 'current').rows).toHaveLength(20)
    component.limit.update(component.addPage)
    expect(component.groups().find((g) => g.key === 'current').rows).toHaveLength(40)
    component.search.set('Resource 44')
    expect(component.groups().find((g) => g.key === 'current').rows[0].resourceName).toBe('Resource 44')
  })
})
