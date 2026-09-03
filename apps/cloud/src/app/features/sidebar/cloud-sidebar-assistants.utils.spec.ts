import { Component, signal, type WritableSignal } from '@angular/core'
import { discardPeriodicTasks, fakeAsync, TestBed, tick } from '@angular/core/testing'
import { provideRouter, Router } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { BehaviorSubject, Observable, of, Subject } from 'rxjs'
import {
  AiFeatureEnum,
  AssistantBindingService,
  ChatConversationService,
  OrderTypeEnum,
  ScopeService,
  Store,
  ViewExtensionApiService,
  XpertAPIService
} from '../../@core'
import { CloudSidebarAssistantsComponent, formatConversationUpdatedAt } from './cloud-sidebar-assistants.component'
import {
  type AssistantXpertLike,
  filterAssistantXperts,
  getAssistantBusinessArea,
  getAssistantBusinessAreaInitial,
  getAssistantDescription,
  getAssistantLabel,
  getAssistantName,
  getAssistantRouteId,
  isAssistantRouteActive,
  normalizeAssistantXperts,
  orderAssistantXperts
} from './cloud-sidebar-assistants.utils'

jest.mock('@xpert-ai/headless-ui', () => {
  const { Component, Directive, Input } = jest.requireActual('@angular/core')

  @Component({
    standalone: true,
    selector: 'z-icon',
    template: ''
  })
  class ZardIconComponent {
    @Input() zType?: string
  }

  @Directive({
    standalone: true,
    // eslint-disable-next-line @angular-eslint/directive-selector
    selector: '[zTooltip]'
  })
  class ZTooltipDirective {
    @Input() zTooltip?: string
    @Input() zPosition?: string
    @Input() zDisabled?: boolean
  }

  return {
    ZardIconComponent,
    ZardTooltipImports: [ZTooltipDirective]
  }
})

jest.mock('../../@core', () => {
  class AssistantBindingService {}
  class ChatConversationService {}
  class Store {}
  class XpertAPIService {}
  class ViewExtensionApiService {}

  return {
    AiFeatureEnum: {
      FEATURE_XPERT: 'FEATURE_XPERT',
      FEATURE_XPERT_CLAWXPERT: 'FEATURE_XPERT_CLAWXPERT'
    },
    AIPermissionsEnum: {
      XPERT_EDIT: 'XPERT_EDIT'
    },
    AssistantBindingScope: {
      TENANT: 'tenant',
      ORGANIZATION: 'organization',
      USER: 'user'
    },
    AssistantCode: {
      CHAT_COMMON: 'chat_common',
      XPERT_SHARED: 'xpert_shared',
      CLAWXPERT: 'clawxpert'
    },
    RequestScopeLevel: {
      TENANT: 'tenant',
      ORGANIZATION: 'organization'
    },
    OrderTypeEnum: {
      DESC: 'DESC'
    },
    AssistantBindingService,
    ChatConversationService,
    ScopeService: class ScopeService {},
    Store,
    XpertAPIService,
    ViewExtensionApiService
  }
})

jest.mock('../../@shared/avatar/emoji-avatar/avatar.component', () => {
  const { Component, Input } = jest.requireActual('@angular/core')

  @Component({
    standalone: true,
    // eslint-disable-next-line @angular-eslint/component-selector
    selector: 'emoji-avatar',
    template: '<span data-testid="emoji-avatar"></span>'
  })
  class EmojiAvatarComponent {
    @Input() avatar?: unknown
    @Input() alt?: string
    @Input() fallbackLabel?: string
  }

  return {
    EmojiAvatarComponent
  }
})

function xpert(item: Partial<AssistantXpertLike>): AssistantXpertLike {
  return item
}

describe('cloud sidebar assistants helpers', () => {
  it('formats the local conversation update date and time', () => {
    const updatedAt = new Date(2026, 7, 23, 9, 5)

    expect(formatConversationUpdatedAt(updatedAt)).toBe('2026-08-23 09:05')
    expect(formatConversationUpdatedAt('invalid-date')).toBe('')
  })

  it('keeps latest unique xperts with an id', () => {
    const items = normalizeAssistantXperts([
      xpert({ id: 'a', slug: 'alpha' }),
      xpert({ id: 'a', slug: 'alpha-copy' }),
      xpert({ id: 'b', latest: false }),
      xpert({ slug: 'missing-id' })
    ])

    expect(items.map((item) => item.slug)).toEqual(['alpha'])
  })

  it('uses the expected label, description and route id fallbacks', () => {
    const item = xpert({
      id: 'assistant-id',
      slug: 'assistant-slug',
      name: 'Assistant Name',
      titleCN: '中文标题'
    })

    expect(getAssistantLabel(item)).toBe('中文标题')
    expect(getAssistantDescription(item)).toBe('Assistant Name')
    expect(getAssistantRouteId(item)).toBe('assistant-slug')
  })

  it('prefixes assistant menu labels with the assigned business area', () => {
    const item = xpert({
      id: 'assistant-id',
      title: 'Planning Assistant',
      businessAreaId: 'operations-id',
      businessArea: { id: 'operations-id', name: 'Operations' }
    })

    expect(getAssistantLabel(item)).toBe('Operations / Planning Assistant')
    expect(getAssistantName(item)).toBe('Planning Assistant')
    expect(getAssistantBusinessArea(item)).toEqual({ id: 'operations-id', name: 'Operations' })
    expect(getAssistantBusinessAreaInitial('销售')).toBe('销')
    expect(getAssistantLabel({ ...item, businessArea: null })).toBe('Planning Assistant')
  })

  it('filters assistants by label or description', () => {
    const items = [
      xpert({ id: 'documents', title: 'Documents Assistant', description: 'Word and sheets' }),
      xpert({ id: 'tools', title: 'Tool Runner', description: 'Workspace calls' })
    ]

    expect(filterAssistantXperts(items, 'sheet').map((item) => item.id)).toEqual(['documents'])
    expect(filterAssistantXperts(items, 'tool').map((item) => item.id)).toEqual(['tools'])
  })

  it('places assistants missing from the saved order first by newest creation time', () => {
    const items = [
      xpert({ id: 'ordered-first', createdAt: new Date('2026-01-03T00:00:00Z') }),
      xpert({ id: 'newer', createdAt: new Date('2026-01-05T00:00:00Z') }),
      xpert({ id: 'ordered-second', createdAt: new Date('2026-01-04T00:00:00Z') }),
      xpert({ id: 'newest', createdAt: new Date('2026-01-06T00:00:00Z') })
    ]

    expect(orderAssistantXperts(items, ['ordered-first', 'ordered-second']).map((item) => item.id)).toEqual([
      'newest',
      'newer',
      'ordered-first',
      'ordered-second'
    ])
  })

  it('orders all assistants by newest creation time when no saved order exists', () => {
    const items = [
      xpert({ id: 'oldest', createdAt: new Date('2026-01-01T00:00:00Z') }),
      xpert({ id: 'newest', createdAt: new Date('2026-01-03T00:00:00Z') }),
      xpert({ id: 'middle', createdAt: new Date('2026-01-02T00:00:00Z') })
    ]

    expect(orderAssistantXperts(items, []).map((item) => item.id)).toEqual(['newest', 'middle', 'oldest'])
  })

  it('matches assistant categories from tag names instead of label or description keywords', () => {
    const items = [
      xpert({ id: 'finance', title: 'General Assistant', tags: [{ name: 'Finance' }] }),
      xpert({ id: 'support', title: 'General Assistant', tags: [{ name: 'Support' }] }),
      xpert({
        id: 'untagged',
        title: 'Finance Support Assistant',
        description: 'report ticket workflow',
        tags: []
      })
    ]

    expect(filterAssistantXperts(items, '', 'finance').map((item) => item.id)).toEqual(['finance'])
    expect(filterAssistantXperts(items, '', 'support').map((item) => item.id)).toEqual(['support'])
  })

  it('does not use tag labels as category identity', () => {
    const items = [xpert({ id: 'localized-tag', tags: [{ name: 'finance', label: { zh: '财务' } }] })]

    expect(filterAssistantXperts(items, '', 'finance').map((item) => item.id)).toEqual(['localized-tag'])
    expect(filterAssistantXperts(items, '', '财务')).toEqual([])
  })

  it('matches exact normalized tag names without aliases', () => {
    const items = [xpert({ id: 'localized-tag', tags: [{ name: '财务' }] })]

    expect(filterAssistantXperts(items, '', 'finance')).toEqual([])
    expect(filterAssistantXperts(items, '', '财务').map((item) => item.id)).toEqual(['localized-tag'])
  })

  it('does not infer categories from titles or descriptions', () => {
    const items = [
      xpert({
        id: 'keyword-only',
        title: 'Finance Support Assistant',
        description: 'Handles finance tickets',
        tags: []
      })
    ]

    expect(filterAssistantXperts(items, '', 'finance')).toEqual([])
    expect(filterAssistantXperts(items, '', 'support')).toEqual([])
  })

  it('keeps untagged assistants visible only in the all category', () => {
    const items = [
      xpert({
        id: 'untagged',
        title: 'Finance Support Assistant',
        description: 'report ticket workflow'
      })
    ]

    expect(filterAssistantXperts(items, '', 'all').map((item) => item.id)).toEqual(['untagged'])
    expect(filterAssistantXperts(items, '', 'finance')).toEqual([])
    expect(filterAssistantXperts(items, '', 'support')).toEqual([])
  })

  it('matches the active assistant route', () => {
    const item = xpert({ id: 'assistant-id', slug: 'mcp-tools-agent-01' })

    expect(isAssistantRouteActive('/chat/x/mcp-tools-agent-01/c', item)).toBe(true)
    expect(isAssistantRouteActive('/chat/x/common/c', item)).toBe(false)
  })
})
