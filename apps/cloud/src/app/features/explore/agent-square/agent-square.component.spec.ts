import { Dialog } from '@angular/cdk/dialog'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { Router } from '@angular/router'
import { of, Subject } from 'rxjs'

jest.mock('@cloud/app/@core', () => {
  class XpertMarketplaceService {}

  return {
    getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : `${error}`),
    injectToastr: () => ({
      error: jest.fn(),
      success: jest.fn()
    }),
    XpertMarketplaceBusinessCategories: ['sales'],
    XpertMarketplaceCollaborationModes: ['single-agent', 'multi-agent', 'human-in-loop'],
    XpertMarketplaceTechnicalCategories: ['knowledge-retrieval', 'tool-calling', 'workflow'],
    XpertMarketplaceService,
    XpertTypeEnum: {
      Agent: 'agent'
    }
  }
})

jest.mock('@cloud/app/@shared/avatar', () => ({
  EmojiAvatarComponent: class EmojiAvatarComponent {}
}))

jest.mock('@xpert-ai/headless-ui', () => ({
  ZardButtonComponent: class ZardButtonComponent {},
  ZardCheckboxComponent: class ZardCheckboxComponent {},
  ZardIconComponent: class ZardIconComponent {}
}))

jest.mock('../agents/agents.component', () => ({
  ExploreAgentsComponent: class ExploreAgentsComponent {}
}))

jest.mock('../agents/install/install.component', () => ({
  ExploreAgentInstallComponent: class ExploreAgentInstallComponent {}
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
  TXpertMarketplaceAccessStatus,
  TXpertTemplate,
  XpertMarketplaceService,
  XpertTypeEnum
} from '@cloud/app/@core'
import { ExploreAgentInstallComponent } from '../agents/install/install.component'
import { AgentSquareAccessRequestDialogComponent } from './access-request-dialog.component'
import { ExploreAgentSquareComponent } from './agent-square.component'

const EMPTY_RESPONSE: IXpertMarketplaceListResponse = {
  items: [],
  recommendedTemplates: [],
  total: 0,
  reviewableCount: 0
}

function createTemplate(id: string): TXpertTemplate {
  return {
    id,
    name: `Template ${id}`,
    title: `Template ${id}`,
    description: `Description ${id}`,
    category: 'Productivity',
    copyright: '',
    export_data: '',
    avatar: {},
    type: XpertTypeEnum.Agent
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
    marketplace: {
      summary: `Summary ${id}`,
      capabilityTags: []
    },
    accessStatus,
    canReview: false
  }
}

describe('ExploreAgentSquareComponent', () => {
  let fixture: ComponentFixture<ExploreAgentSquareComponent>
  let service: {
    findMarketplace: jest.Mock
    requestAccess: jest.Mock
  }
  let dialog: {
    open: jest.Mock
  }
  let matchMedia: jest.Mock

  beforeEach(async () => {
    service = {
      findMarketplace: jest.fn(() => of(EMPTY_RESPONSE)),
      requestAccess: jest.fn(() => of({}))
    }
    dialog = {
      open: jest.fn(() => ({ closed: of(null) }))
    }
    matchMedia = jest.fn(() => ({ matches: false }))
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: matchMedia
    })

    await TestBed.configureTestingModule({
      imports: [ExploreAgentSquareComponent],
      providers: [
        { provide: XpertMarketplaceService, useValue: service },
        { provide: Dialog, useValue: dialog },
        { provide: Router, useValue: { navigate: jest.fn() } }
      ]
    })
      .overrideComponent(ExploreAgentSquareComponent, {
        set: {
          imports: [],
          template: ''
        }
      })
      .compileComponents()

    fixture = TestBed.createComponent(ExploreAgentSquareComponent)
  })

  afterEach(() => {
    fixture.destroy()
    jest.useRealTimers()
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('keeps published agents and recommended templates in separate display collections', () => {
    const published = createPublished('published-1')
    const template = createTemplate('template-1')

    fixture.componentInstance.items.set([published])
    fixture.componentInstance.recommendedTemplates.set([template])

    expect(fixture.componentInstance.displayItems()).toEqual([
      { kind: 'published', id: 'published:published-1', published }
    ])
    expect(fixture.componentInstance.recommendedItems()).toEqual([
      { kind: 'template', id: 'template:template-1', template }
    ])
  })

  it('opens the existing agent install dialog for a recommended template', async () => {
    const template = createTemplate('template-1')
    fixture.componentInstance.recommendedTemplates.set([template])

    await fixture.componentInstance.handlePrimaryAction(fixture.componentInstance.recommendedItems()[0])

    expect(dialog.open).toHaveBeenCalledWith(ExploreAgentInstallComponent, { data: template })
    expect(service.requestAccess).not.toHaveBeenCalled()
  })

  it('requests access for a published agent that is not yet accessible', async () => {
    const published = createPublished('published-1')
    fixture.componentInstance.items.set([published])
    dialog.open.mockReturnValue({ closed: of('Need access') })

    await fixture.componentInstance.handlePrimaryAction(fixture.componentInstance.displayItems()[0])

    expect(dialog.open).toHaveBeenCalledWith(AgentSquareAccessRequestDialogComponent, {
      data: { item: published }
    })
    expect(service.requestAccess).toHaveBeenCalledWith('published-1', { reason: 'Need access' })
  })

  it('does not let an older marketplace request overwrite a newer result', async () => {
    const older = new Subject<IXpertMarketplaceListResponse>()
    const newer = new Subject<IXpertMarketplaceListResponse>()
    service.findMarketplace.mockReturnValueOnce(older.asObservable()).mockReturnValueOnce(newer.asObservable())

    const olderLoad = fixture.componentInstance.loadMarketplace({ search: 'older' })
    const newerLoad = fixture.componentInstance.loadMarketplace({ search: 'newer' })

    const newerItem = createPublished('newer')
    newer.next({ ...EMPTY_RESPONSE, items: [newerItem], total: 1 })
    newer.complete()
    await newerLoad

    older.next({ ...EMPTY_RESPONSE, items: [createPublished('older')], total: 1 })
    older.complete()
    await olderLoad

    expect(fixture.componentInstance.items()).toEqual([newerItem])
    expect(fixture.componentInstance.total()).toBe(1)
  })

  it('stops the hero carousel timer when the component is destroyed', () => {
    jest.useFakeTimers()
    fixture.componentInstance.recommendedTemplates.set([createTemplate('one'), createTemplate('two')])

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
    fixture.componentInstance.recommendedTemplates.set([createTemplate('one'), createTemplate('two')])

    fixture.componentInstance.resumeHeroCarousel()
    jest.advanceTimersByTime(12000)

    expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)')
    expect(fixture.componentInstance.featuredIndex()).toBe(0)
  })
})
