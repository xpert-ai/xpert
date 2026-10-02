import { TestBed } from '@angular/core/testing'
import { TranslateService } from '@ngx-translate/core'
import { AiModelTypeEnum, IModelUsageLedger, RequestScopeLevel } from '@xpert-ai/contracts'
import { BehaviorSubject, of, Subject } from 'rxjs'
import { CopilotUsageService, Store, ToastrService } from '../../../../@core'
import { ModelUsageLedgerComponent } from './model-usage-ledger.component'

describe('usage ledger export state', () => {
  afterEach(() => TestBed.resetTestingModule())
  it('disables export as soon as a new scope or filter is loading, including failed requests', () => {
    const scope = { level: RequestScopeLevel.ORGANIZATION, organizationId: 'org' }
    const accounts = new Subject<{ items: []; total: number }>()
    const createObjectURL = jest.fn(() => 'blob:test')
    const original = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL })
    try {
      TestBed.configureTestingModule({
        providers: [
          {
            provide: Store,
            useValue: {
              activeScope: scope,
              selectActiveScope: () => new BehaviorSubject(scope),
              selectedOrganization$: of({ id: 'org', name: 'Org' })
            }
          },
          {
            provide: CopilotUsageService,
            useValue: { getModelUsageAccounts: () => accounts, getModelUsageLedger: () => of({ items: [], total: 0 }) }
          },
          { provide: ToastrService, useValue: { error: jest.fn() } },
          { provide: TranslateService, useValue: { onLangChange: new Subject(), instant: (key: string) => key } }
        ]
      })
      const component = TestBed.runInInjectionContext(() => new ModelUsageLedgerComponent())
      TestBed.flushEffects()
      const item: IModelUsageLedger = {
        requestId: 'attempt',
        revision: 1,
        originType: 'model',
        originId: 'model',
        copilotId: 'copilot',
        providerScopeId: 'scope',
        provider: 'provider',
        modelType: AiModelTypeEnum.LLM,
        modality: 'text',
        operation: AiModelTypeEnum.LLM,
        metricKey: 'tokens',
        unit: 'token',
        authority: 'provider',
        recordedAt: new Date()
      }
      component.items.set([item])
      component.loadPage()
      expect(component.items()).toEqual([])
      component.exportCurrentPage()
      expect(createObjectURL).not.toHaveBeenCalled()
      accounts.error(new Error('failed request'))
      component.exportCurrentPage()
      expect(component.loadFailed()).toBe(true)
      expect(createObjectURL).not.toHaveBeenCalled()
    } finally {
      if (original) Object.defineProperty(URL, 'createObjectURL', original)
      else Reflect.deleteProperty(URL, 'createObjectURL')
    }
  })
})
