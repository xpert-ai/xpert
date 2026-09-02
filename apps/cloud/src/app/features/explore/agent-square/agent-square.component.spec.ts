import { Dialog } from '@angular/cdk/dialog'
import { signal } from '@angular/core'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { ActivatedRoute, Router } from '@angular/router'
import { TranslateService } from '@ngx-translate/core'
import { of, Subject } from 'rxjs'

jest.mock('@cloud/app/@core', () => {
  class XpertMarketplaceService {}
  class PluginApplicationService {}
  class XpertTemplateService {}

  return {
    getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : `${error}`),
    injectToastr: () => ({ error: jest.fn(), success: jest.fn() }),
    resolveI18nText: (value: unknown) => {
      if (typeof value === 'string') return value
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const englishUs = Reflect.get(value, 'en-US')
        const english = Reflect.get(value, 'en')
        const chinese = Reflect.get(value, 'zh-Hans')
        return [englishUs, english, chinese].find((item): item is string => typeof item === 'string') ?? null
      }
      return null
    },
    XpertMarketplaceBusinessCategories: ['sales', 'business-operations'],
    XpertMarketplaceCollaborationModes: ['single-agent', 'multi-agent', 'human-in-loop'],
    XpertMarketplaceTechnicalCategories: ['knowledge-retrieval', 'tool-calling', 'workflow'],
    PluginApplicationService,
    XpertMarketplaceService,
    XpertTemplateService,
    XpertTypeEnum: { Agent: 'agent', Copilot: 'copilot' }
  }
})

jest.mock('@cloud/app/@shared/avatar', () => ({
  EmojiAvatarComponent: class EmojiAvatarComponent {},
  IconComponent: class IconComponent {}
}))

jest.mock('@xpert-ai/headless-ui', () => ({
  linkedModel: (options: { compute: () => unknown; update: (value: unknown) => void }) => {
    const state = signal(options.compute())
    const setState = state.set.bind(state)
    state.set = (value: unknown) => {
      setState(value)
      options.update(value)
    }
    return state
  },
  ZardButtonComponent: class ZardButtonComponent {},
  ZardIconComponent: class ZardIconComponent {}
}))

jest.mock('ngxtension/inject-query-params', () => ({
  injectQueryParams: () => signal(null)
}))

jest.mock('../../xpert/xpert', () => ({
  XpertNewBlankComponent: class XpertNewBlankComponent {}
}))

jest.mock('./access-request-dialog.component', () => ({
  AgentSquareAccessRequestDialogComponent: class AgentSquareAccessRequestDialogComponent {}
}))

jest.mock('./review-requests-dialog.component', () => ({
  AgentSquareReviewRequestsDialogComponent: class AgentSquareReviewRequestsDialogComponent {}
}))

import {
  IXpertMarketplaceItem,
  IXpertMarketplaceListResponse,
  PluginApplicationCatalogItem,
  PluginApplicationService,
  TXpertMarketplaceAccessStatus,
  TXpertTemplate,
  XpertMarketplaceService,
  XpertTemplateService,
  XpertTypeEnum
} from '@cloud/app/@core'
import { XpertNewBlankComponent } from '../../xpert/xpert'
import { AgentSquareAccessRequestDialogComponent } from './access-request-dialog.component'
import { ExploreAgentSquareComponent, normalizeAgentSquareCatalog } from './agent-square.component'

const EMPTY_RESPONSE: IXpertMarketplaceListResponse = {
  items: [],
  recommendedTemplates: [],
  total: 0,
  reviewableCount: 0
}

function createTemplate(
  id: string,
  options: Partial<Pick<TXpertTemplate, 'type' | 'source' | 'application' | 'category'>> = {}
): TXpertTemplate {
  return {
    id,
    name: `Template ${id}`,
    title: `Template ${id}`,
    description: `Description ${id}`,
    category: 'Productivity',
    copyright: '',
    export_data: '',
    avatar: {},
    type: XpertTypeEnum.Agent,
    ...options
  }
}

function createPublished(
  id: string,
  accessStatus: TXpertMarketplaceAccessStatus = 'not_requested'
): IXpertMarketplaceItem {
  return {
    xpert: {
      id,
      slug: id,
      name: `Published ${id}`,
      type: XpertTypeEnum.Agent
    },
    marketplace: { summary: `Summary ${id}`, capabilityTags: [] },
    accessStatus,
    canReview: false
  }
}

function createApplication(
  id: string,
  status: PluginApplicationCatalogItem['status']['status'] = 'not_installed'
): PluginApplicationCatalogItem {
  return {
    application: {
      id: `@acme/plugin:${id}`,
      pluginName: '@acme/plugin',
      appName: id,
      displayName: `Application ${id}`,
      scope: 'organization',
      assistantTemplateKey: `${id}-assistant`,
      config: {
        scope: 'organization',
        assistantTemplateKey: `${id}-assistant`,
        workspace: { mode: 'dedicated', name: `Workspace ${id}`, sharing: 'organization' }
      }
    },
    marketplace: {
      category: 'business-operations',
      tags: ['factory'],
      featured: true
    },
    status: {
      appId: `@acme/plugin:${id}`,
      status,
      initializationAccess: 'allowed'
    }
  }
}

describe('ExploreAgentSquareComponent', () => {
  let fixture: ComponentFixture<ExploreAgentSquareComponent>
  let marketplaceService: { findMarketplace: jest.Mock; requestAccess: jest.Mock }
  let applicationService: { getCatalog: jest.Mock }
  let templateService: { getAll: jest.Mock }
  let dialog: { open: jest.Mock }
  let router: { navigate: jest.Mock }
  let matchMedia: jest.Mock

  beforeEach(async () => {
    marketplaceService = {
      findMarketplace: jest.fn(() => of(EMPTY_RESPONSE)),
      requestAccess: jest.fn(() => of({}))
    }
    applicationService = { getCatalog: jest.fn(() => of([])) }
    templateService = { getAll: jest.fn(() => of({ categories: [], recommendedApps: [] })) }
    dialog = { open: jest.fn(() => ({ closed: of(null) })) }
    router = { navigate: jest.fn() }
    matchMedia = jest.fn(() => ({ matches: false }))
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: matchMedia })

    await TestBed.configureTestingModule({
      imports: [ExploreAgentSquareComponent],
      providers: [
        { provide: XpertMarketplaceService, useValue: marketplaceService },
        { provide: PluginApplicationService, useValue: applicationService },
        { provide: XpertTemplateService, useValue: templateService },
        { provide: Dialog, useValue: dialog },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: {} },
        {
          provide: TranslateService,
          useValue: {
            currentLang: 'en-US',
            instant: (_key: string, params?: Record<string, unknown>) =>
              `${params?.['Default'] ?? _key}`.replace(
                /\{\{(\w+)\}\}/g,
                (_match, key: string) => `${params?.[key] ?? ''}`
              )
          }
        }
      ]
    })
      .overrideComponent(ExploreAgentSquareComponent, { set: { imports: [], template: '' } })
      .compileComponents()

    fixture = TestBed.createComponent(ExploreAgentSquareComponent)
    await Promise.resolve()
    marketplaceService.findMarketplace.mockClear()
  })

  afterEach(() => {
    if (fixture && !fixture.componentRef.hostView.destroyed) {
      fixture.destroy()
    }
    jest.useRealTimers()
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('normalizes catalog deep links and falls back to experts', () => {
    expect(normalizeAgentSquareCatalog('applications')).toBe('applications')
    expect(normalizeAgentSquareCatalog('apps')).toBe('applications')
    expect(normalizeAgentSquareCatalog('templates')).toBe('templates')
    expect(normalizeAgentSquareCatalog('unsupported')).toBe('experts')
  })

  it('keeps App-bound and project templates out of the Assistant template catalog', () => {
    const builtin = createTemplate('builtin')
    const plugin = createTemplate('plugin', { source: 'plugin', type: XpertTypeEnum.Copilot })
    const appTemplate = createTemplate('app', {
      source: 'plugin',
      application: createApplication('app').application
    })
    const project = createTemplate('project', { type: 'project' })

    fixture.componentInstance.templates.set([builtin, plugin, appTemplate, project])

    expect(fixture.componentInstance.assistantTemplates()).toEqual([builtin, plugin])
  })

  it('renders legacy JSON-string i18n descriptions as localized catalog text', () => {
    const template = createTemplate('localized')
    template.description = JSON.stringify({ 'en-US': 'Localized summary', 'zh-Hans': '本地化简介' })

    expect(fixture.componentInstance.templateSummary(template)).toBe('Localized summary')
  })

  it('does not label a plugin template as built in when its display name is missing', () => {
    const template = createTemplate('plugin-provider', { source: 'plugin' })

    expect(fixture.componentInstance.templateProvider(template)).toBe('Plugin provided')
  })

  it('filters App catalog entries by category, tags, status and scope', () => {
    const application = createApplication('factory')
    fixture.componentInstance.applications.set([application])

    fixture.componentInstance.selectedApplicationCategories.set(['business-operations'])
    fixture.componentInstance.selectedApplicationTags.set(['factory'])
    fixture.componentInstance.selectedApplicationStatuses.set(['not_installed'])
    fixture.componentInstance.selectedApplicationScopes.set(['organization'])

    expect(fixture.componentInstance.filteredApplications()).toEqual([application])
    fixture.componentInstance.selectedApplicationStatuses.set(['ready'])
    expect(fixture.componentInstance.filteredApplications()).toEqual([])
  })

  it('exposes valid application screenshots and a localized accessible label for catalog cards', () => {
    const application = createApplication('factory')
    application.application.config.presentation = {
      screenshots: ['data:image/png;base64,preview', '  ', 'https://cdn.example.com/detail.webp']
    }

    expect(fixture.componentInstance.applicationScreenshots(application)).toEqual([
      'data:image/png;base64,preview',
      'https://cdn.example.com/detail.webp'
    ])
    expect(fixture.componentInstance.applicationScreenshotAlt(application)).toBe('Screenshot of Application factory')
  })

  it('links a featured expert to its initialized App so the hero can show App screenshots', () => {
    const featured = createPublished('factory-xpert')
    const application = createApplication('factory', 'ready')
    application.status.xpertId = featured.xpert.id
    application.application.config.presentation = { screenshots: ['data:image/jpeg;base64,preview'] }

    fixture.componentInstance.featuredExperts.set([featured])
    fixture.componentInstance.applications.set([application])

    const linkedApplication = fixture.componentInstance.featuredApplication()
    expect(linkedApplication).toBe(application)
    expect(linkedApplication && fixture.componentInstance.applicationScreenshots(linkedApplication)).toEqual([
      'data:image/jpeg;base64,preview'
    ])
    expect(fixture.componentInstance.featuredApplicationPreview()).toEqual({
      application,
      screenshot: 'data:image/jpeg;base64,preview'
    })
  })

  it('links a featured expert to one uniquely named App when legacy status has no Xpert reference', () => {
    const featured = createPublished('legacy-factory-xpert')
    const application = createApplication('factory', 'ready')
    featured.xpert.title = 'Application factory'
    application.status.xpertId = undefined
    application.status.assistantSlug = undefined

    fixture.componentInstance.featuredExperts.set([featured])
    fixture.componentInstance.applications.set([application])

    expect(fixture.componentInstance.featuredApplication()).toBe(application)
  })

  it('applies the shared business category rail to App and Assistant template cards', () => {
    const matchingApplication = createApplication('factory')
    const otherApplication = createApplication('sales')
    otherApplication.marketplace.category = 'sales'
    const matchingTemplate = createTemplate('factory-template', { category: 'business-operations' })
    const otherTemplate = createTemplate('sales-template', { category: 'sales' })

    fixture.componentInstance.applications.set([matchingApplication, otherApplication])
    fixture.componentInstance.templates.set([matchingTemplate, otherTemplate])
    fixture.componentInstance.selectedBusinessCategories.set(['business-operations'])

    expect(fixture.componentInstance.filteredApplications()).toEqual([matchingApplication])
    expect(fixture.componentInstance.filteredTemplates()).toEqual([matchingTemplate])
  })

  it('keeps the shared business category rail single-select', () => {
    fixture.componentInstance.toggleBusinessCategory('sales')
    expect(fixture.componentInstance.selectedBusinessCategories()).toEqual(['sales'])

    fixture.componentInstance.toggleBusinessCategory('business-operations')
    expect(fixture.componentInstance.selectedBusinessCategories()).toEqual(['business-operations'])

    fixture.componentInstance.toggleBusinessCategory('business-operations')
    expect(fixture.componentInstance.selectedBusinessCategories()).toEqual([])
  })

  it('keeps expert totals and review actions available on non-expert catalogs', async () => {
    fixture.componentInstance.catalog.set('applications')
    marketplaceService.findMarketplace.mockReturnValueOnce(
      of({ ...EMPTY_RESPONSE, total: 129, reviewableCount: 3, items: [createPublished('featured')] })
    )

    await fixture.componentInstance.loadFeaturedExperts(true)

    expect(fixture.componentInstance.expertTotal()).toBe(129)
    expect(fixture.componentInstance.reviewableCount()).toBe(3)
  })

  it('opens the digital expert wizard for a reusable Assistant template', () => {
    const template = createTemplate('template-1')

    fixture.componentInstance.openTemplate(template)

    expect(dialog.open).toHaveBeenCalledWith(XpertNewBlankComponent, {
      disableClose: true,
      data: expect.objectContaining({ initialTemplateId: template.id, skipTemplateSelectionStep: true })
    })
  })

  it('requests access for a published expert that is not yet accessible', async () => {
    const published = createPublished('published-1')
    dialog.open.mockReturnValue({ closed: of('Need access') })

    await fixture.componentInstance.handleExpertAction(published)

    expect(dialog.open).toHaveBeenCalledWith(AgentSquareAccessRequestDialogComponent, { data: { item: published } })
    expect(marketplaceService.requestAccess).toHaveBeenCalledWith('published-1', { reason: 'Need access' })
  })

  it('opens an accessible expert directly from the catalog card', async () => {
    const published = createPublished('published-2', 'accessible')

    await fixture.componentInstance.handleExpertAction(published)

    expect(router.navigate).toHaveBeenCalledWith(['/chat/x', 'published-2', 'c'])
    expect(dialog.open).not.toHaveBeenCalled()
  })

  it('filters experts only by marketplace business category', async () => {
    fixture.componentInstance.selectedBusinessCategories.set(['sales'])

    await fixture.componentInstance.loadExperts()

    expect(marketplaceService.findMarketplace).toHaveBeenCalledWith({
      search: '',
      businessCategories: ['sales'],
      sort: 'match',
      take: 60
    })
    expect(fixture.componentInstance.activeExpertFilterCount()).toBe(1)
  })

  it('opens a ready App directly and routes an uninitialized App to setup', () => {
    const ready = createApplication('ready', 'ready')
    ready.status.assistantSlug = 'ready-assistant'
    const uninitialized = createApplication('new')

    fixture.componentInstance.handleApplicationAction(ready)
    fixture.componentInstance.handleApplicationAction(uninitialized)

    expect(router.navigate).toHaveBeenNthCalledWith(1, ['/chat/x', 'ready-assistant', 'c'])
    expect(router.navigate).toHaveBeenNthCalledWith(2, ['/explore/apps', 'new'], {
      queryParams: { plugin: '@acme/plugin', setup: 1 }
    })
  })

  it('does not let an older expert request overwrite a newer result', async () => {
    const older = new Subject<IXpertMarketplaceListResponse>()
    const newer = new Subject<IXpertMarketplaceListResponse>()
    marketplaceService.findMarketplace
      .mockReturnValueOnce(older.asObservable())
      .mockReturnValueOnce(newer.asObservable())

    const olderLoad = fixture.componentInstance.loadExperts({ search: 'older' })
    const newerLoad = fixture.componentInstance.loadExperts({ search: 'newer' })
    const newerItem = createPublished('newer')
    newer.next({ ...EMPTY_RESPONSE, items: [newerItem], total: 1 })
    newer.complete()
    await newerLoad
    older.next({ ...EMPTY_RESPONSE, items: [createPublished('older')], total: 1 })
    older.complete()
    await olderLoad

    expect(fixture.componentInstance.experts()).toEqual([newerItem])
    expect(fixture.componentInstance.expertTotal()).toBe(1)
  })

  it('stops the hero carousel timer when the component is destroyed', () => {
    jest.useFakeTimers()
    fixture.componentInstance.featuredExperts.set([createPublished('one'), createPublished('two')])

    fixture.componentInstance.resumeHeroCarousel()
    jest.advanceTimersByTime(6000)
    expect(fixture.componentInstance.featuredIndex()).toBe(1)

    fixture.destroy()
    jest.advanceTimersByTime(6000)
    expect(fixture.componentInstance.featuredIndex()).toBe(1)
  })

  it('does not start the hero carousel when reduced motion is requested', () => {
    jest.useFakeTimers()
    matchMedia.mockReturnValue({ matches: true })
    fixture.componentInstance.featuredExperts.set([createPublished('one'), createPublished('two')])

    fixture.componentInstance.resumeHeroCarousel()
    jest.advanceTimersByTime(12000)

    expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)')
    expect(fixture.componentInstance.featuredIndex()).toBe(0)
  })
})
