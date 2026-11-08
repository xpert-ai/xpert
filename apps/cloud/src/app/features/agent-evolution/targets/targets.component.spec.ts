import { computed, signal } from '@angular/core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { defaultTargetFilters, type TargetFilters } from './target-directory'
import { TestBed } from '@angular/core/testing'
import type { ActiveCapabilityPointer, EvolutionTargetDescriptor } from '@xpert-ai/contracts'
import { AgentEvolutionFacade } from '../agent-evolution.facade'
import { AgentEvolutionTargetsComponent } from './targets.component'

jest.mock('../agent-evolution.facade', () => ({ AgentEvolutionFacade: class {} }))

function target(targetId: string, status: EvolutionTargetDescriptor['status'] = 'active'): EvolutionTargetDescriptor {
  return {
    targetId,
    displayName: targetId,
    status,
    targetType: 'extraction_policy',
    providerKey: 'example.rules',
    providerVersion: '1.0.0',
    artifactSchemaVersion: '1.0.0',
    riskLevel: 'R2',
    metricSetId: 'accuracy',
    supportedScopes: ['organization'],
    strategies: [],
    capabilities: { candidateBuild: true, replay: true, shadow: true, canary: true, install: true, rollback: true }
  }
}

function pointer(
  channel: ActiveCapabilityPointer['channel'],
  scopeKey: string,
  version: string
): ActiveCapabilityPointer {
  return {
    pointerId: `${channel}:${scopeKey}`,
    targetId: 'example.mapping',
    channel,
    scope: { type: 'organization', key: scopeKey },
    activeVersionId: version,
    revision: 1,
    updatedAt: '2026-09-20T00:00:00Z',
    updatedBy: 'test-admin'
  }
}

describe('AgentEvolutionTargetsComponent', () => {
  const targets = signal<EvolutionTargetDescriptor[]>([])
  const selectedTargetId = signal('all')
  const dashboard = signal<{ pointers: ActiveCapabilityPointer[] }>({ pointers: [] })
  const facade = {
    dashboard,
    visibleTargets: targets,
    directoryFilters: signal<TargetFilters>({ ...defaultTargetFilters }),
    directoryScrollTop: 0,
    contextPointers: computed(() => dashboard().pointers),
    contextTargets: computed(() =>
      targets().filter((item) => selectedTargetId() === 'all' || item.targetId === selectedTargetId())
    ),
    selectTarget: (value: string) => selectedTargetId.set(value)
  }

  beforeEach(() => {
    facade.directoryFilters.set({ ...defaultTargetFilters })
    targets.set([target('example.mapping'), target('example.routing', 'disabled')])
    selectedTargetId.set('all')
    dashboard.set({ pointers: [] })
    TestBed.configureTestingModule({
      imports: [AgentEvolutionTargetsComponent, TranslateModule.forRoot()],
      providers: [{ provide: AgentEvolutionFacade, useValue: facade }]
    }).overrideComponent(AgentEvolutionTargetsComponent, { set: { template: '', imports: [] } })
  })

  it('shows production versions across scopes without treating shadow or canary as production', () => {
    dashboard.set({
      pointers: [
        pointer('production', 'a', 'v1'),
        pointer('production', 'b', 'v1'),
        pointer('production', 'c', 'v2'),
        pointer('canary', 'a', 'candidate'),
        pointer('shadow', 'a', 'shadow')
      ]
    })
    const component = TestBed.createComponent(AgentEvolutionTargetsComponent).componentInstance
    expect(component.rows()[0]).toMatchObject({ versions: ['v1', 'v2'], scopeCount: 3 })
    expect(component.rows()[1]).toMatchObject({ versions: [], scopeCount: 0 })
  })

  it('combines search and status filters with the selected target context', () => {
    const component = TestBed.createComponent(AgentEvolutionTargetsComponent).componentInstance
    component.update({ query: ' EXAMPLE.RULES ', status: 'disabled' })
    expect(component.rows().map((row) => row.target.targetId)).toEqual(['example.routing'])
    selectedTargetId.set('example.mapping')
    expect(component.rows()).toEqual([])
    component.resetFilters()
    expect(selectedTargetId()).toBe('example.mapping')
    expect(component.rows().map((row) => row.target.targetId)).toEqual(['example.mapping'])
  })

  it('searches translated names, original registration names, stable IDs and providers', () => {
    targets.set([
      {
        ...target('route.intent'),
        displayName: 'Customer intent',
        label: { en_US: 'Customer intent', zh_Hans: '客服意图路由' }
      },
      target('legacy')
    ])
    TestBed.inject(TranslateService).use('zh-Hans')
    const component = TestBed.createComponent(AgentEvolutionTargetsComponent).componentInstance
    for (const query of ['客服意图', 'Customer intent', 'route.intent']) {
      component.update({ query })
      expect(component.rows().map((row) => row.name)).toEqual(['客服意图路由'])
    }
    component.update({ query: 'legacy' })
    expect(component.rows()[0].name).toBe('legacy')
  })

  it('keeps target counts independent of the selected version group or number of pointers', () => {
    dashboard.set({ pointers: [pointer('production', 'a', 'v1'), pointer('production', 'b', 'v2')] })
    const component = TestBed.createComponent(AgentEvolutionTargetsComponent).componentInstance
    component.update({ group: 'unversioned' })
    expect(component.counts()).toEqual({ all: 2, live: 1, unversioned: 1 })
    expect(component.rows().map((row) => row.target.targetId)).toEqual(['example.routing'])
    component.update({ status: 'disabled' })
    expect(component.counts()).toEqual({ all: 1, live: 0, unversioned: 1 })
  })

  it('clears target and production data when the shared facade changes organization', () => {
    const component = TestBed.createComponent(AgentEvolutionTargetsComponent).componentInstance
    expect(component.rows()).toHaveLength(2)
    targets.set([])
    dashboard.set({ pointers: [] })
    expect(component.rows()).toEqual([])
  })
})
