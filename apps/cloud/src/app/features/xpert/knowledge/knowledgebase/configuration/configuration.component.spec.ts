import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { ActivatedRoute, Router } from '@angular/router'
import { EMPTY, of, throwError } from 'rxjs'
import { I18nService } from '@cloud/app/@shared/i18n'
import { IKnowledgebase, KnowledgebaseService, Store, ToastrService } from '../../../../../@core'
import { KnowledgebaseComponent } from '../knowledgebase.component'
import { KnowledgeConfigurationComponent } from './configuration.component'

jest.mock('../knowledgebase.component', () => ({ KnowledgebaseComponent: class {} }))
jest.mock('apps/cloud/src/app/@shared/copilot', () => ({ CopilotModelSelectComponent: class {} }))
jest.mock('@cloud/app/@shared/knowledge', () => ({ KnowledgeRetrievalSettingsComponent: class {} }))
jest.mock('../../../../../@shared/avatar/', () => ({ EmojiAvatarComponent: class {} }))

describe('knowledgebase configuration save', () => {
  afterEach(() => TestBed.resetTestingModule())

  function createHarness() {
    const knowledgebase = {
      id: 'kb-1',
      documentNum: 0,
      description: 'Before',
      chatModel: { id: 'llm-1', model: 'llm' },
      wikiConfig: { enabled: true, extractionGranularity: 'standard' }
    } as IKnowledgebase
    const api = {
      update: jest.fn(() => of(knowledgebase)),
      updateWikiConfiguration: jest.fn(() => of(knowledgebase)),
      getGraphStatus: jest.fn(() => EMPTY)
    }
    const parent = { knowledgebase: signal(knowledgebase), refresh: jest.fn() }
    const toastr = { error: jest.fn(), success: jest.fn() }
    TestBed.configureTestingModule({
      providers: [
        { provide: KnowledgebaseService, useValue: api },
        { provide: KnowledgebaseComponent, useValue: parent },
        { provide: ToastrService, useValue: toastr },
        { provide: Store, useValue: { selectOrganizationId: () => of('org-1') } },
        { provide: Router, useValue: {} },
        { provide: ActivatedRoute, useValue: {} },
        { provide: I18nService, useValue: { instant: (key: string) => key, language: signal('en') } }
      ]
    })
    const component = TestBed.runInInjectionContext(() => new KnowledgeConfigurationComponent())
    TestBed.flushEffects()
    return { component, api, parent, toastr }
  }

  it('includes ordinary settings in the single Wiki configuration request', () => {
    const { component, api, parent } = createHarness()
    component.description.set('After')
    TestBed.flushEffects()

    component.save()

    expect(api.update).not.toHaveBeenCalled()
    expect(api.updateWikiConfiguration).toHaveBeenCalledTimes(1)
    expect(api.updateWikiConfiguration).toHaveBeenCalledWith(
      'kb-1',
      expect.objectContaining({
        settings: expect.objectContaining({ description: 'After' }),
        wikiConfig: expect.objectContaining({ enabled: true }),
        wikiModel: null
      })
    )
    expect(parent.refresh).toHaveBeenCalledTimes(1)
    expect(component.loading()).toBe(false)
  })

  it('does not issue a separate settings update or report success after rejected Wiki validation', () => {
    const { component, api, parent, toastr } = createHarness()
    api.updateWikiConfiguration.mockReturnValue(throwError(() => new Error('Wiki validation failed')))

    component.save()

    expect(api.update).not.toHaveBeenCalled()
    expect(api.updateWikiConfiguration).toHaveBeenCalledTimes(1)
    expect(parent.refresh).not.toHaveBeenCalled()
    expect(toastr.error).toHaveBeenCalled()
    expect(toastr.success).not.toHaveBeenCalled()
    expect(component.loading()).toBe(false)
  })
})
