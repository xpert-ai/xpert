jest.mock('@cloud/app/@core', () => ({
  getErrorMessage: jest.fn((error: unknown) => (error instanceof Error ? error.message : 'Unknown error'))
}))

jest.mock('@cloud/app/@core/state', () => {
  const { inject } = jest.requireActual('@angular/core')

  class PluginAPIService {}

  return {
    PluginAPIService,
    injectPluginAPI: () => inject(PluginAPIService)
  }
})

jest.mock('@cloud/app/@shared/avatar', () => {
  return { IconComponent: class IconComponent {} }
})

jest.mock('@cloud/app/@shared/i18n', () => {
  class I18nService {}

  return { I18nService }
})

jest.mock('@xpert-ai/headless-ui', () => {
  const { signal } = jest.requireActual('@angular/core')

  function myRxResource<TRequest, TValue>(config: {
    request: () => TRequest | null
    loader: (options: { request: TRequest }) => { subscribe: (observer: { next: (value: TValue) => void }) => void }
  }) {
    const value = signal<TValue | undefined>(undefined)
    const request = config.request()
    if (request) {
      config.loader({ request }).subscribe({ next: (result: TValue) => value.set(result) })
    }
    return {
      value,
      status: signal('idle'),
      error: signal(null),
      reload: jest.fn()
    }
  }

  return {
    myRxResource,
    XpI18nPipe: class XpI18nPipe {},
    XpSpinComponent: class XpSpinComponent {},
    ZardBadgeComponent: class ZardBadgeComponent {},
    ZardButtonComponent: class ZardButtonComponent {}
  }
})

jest.mock('../install/install.component', () => ({
  PluginInstallComponent: class PluginInstallComponent {}
}))

jest.mock('../plugin-marketplace-categories', () => ({
  PLUGIN_MARKETPLACE_TARGET_APP: 'xpert'
}))

jest.mock('../plugin-marketplace-metadata', () => ({
  mergeMarketplaceContributions: (contributions: unknown) => contributions ?? []
}))

jest.mock('./marketplace-detail.component', () => ({
  PluginMarketplaceDetailComponent: class PluginMarketplaceDetailComponent {}
}))

jest.mock('../../../xpert/xpert/blank/blank.component', () => {
  return { XpertNewBlankComponent: class XpertNewBlankComponent {} }
})

import { Dialog } from '@angular/cdk/dialog'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import { PluginAPIService } from '@cloud/app/@core/state'
import { I18nService } from '@cloud/app/@shared/i18n'
import { of } from 'rxjs'
import { XpertNewBlankComponent } from '../../../xpert/xpert/blank/blank.component'
import { PluginMarketplaceReadmePageComponent } from './marketplace-readme-page.component'

type PluginDetail = {
  name: string
  packageName: string
  displayName: string
  description: string
  version: string
  category: string
  icon: { type: 'font'; value: string }
  author: { name: string; url: string }
  installed: boolean
  contributions: []
}

function createPluginDetail(installed = true): PluginDetail {
  return {
    name: '@xpert-ai/plugin-docx-editor',
    packageName: '@xpert-ai/plugin-docx-editor',
    displayName: 'DOCX Editor',
    description: 'Review DOCX files.',
    version: '0.1.0',
    category: 'middleware',
    icon: { type: 'font', value: 'ri-file-word-line' },
    author: { name: 'XpertAI', url: 'https://xpertai.cn' },
    installed,
    contributions: []
  }
}

async function createComponent(options: { template?: string | null; installed?: boolean } = {}) {
  const template = options.template === undefined ? 'docx-editor-assistant' : options.template
  const detail = createPluginDetail(options.installed)
  const dialog = {
    open: jest.fn(() => ({
      closed: of({ xpert: { id: 'agent-1' } })
    }))
  }
  const router = {
    navigate: jest.fn()
  }
  const pluginAPI = {
    getMarketplacePluginDetail: jest.fn(() => of(detail))
  }
  const route = {
    paramMap: of(convertToParamMap({ scope: 'xpert-ai', packageName: 'plugin-docx-editor' })),
    queryParamMap: of(convertToParamMap({ action: 'initialize-template', ...(template ? { template } : {}) })),
    snapshot: {
      paramMap: convertToParamMap({ scope: 'xpert-ai', packageName: 'plugin-docx-editor' }),
      queryParamMap: convertToParamMap({ action: 'initialize-template', ...(template ? { template } : {}) })
    }
  }
  const i18n = {
    language: jest.fn(() => 'zh-Hans'),
    instant: jest.fn((key: string, values?: { Default?: string }) => values?.Default ?? key)
  }

  await TestBed.configureTestingModule({
    providers: [
      { provide: ActivatedRoute, useValue: route },
      { provide: Dialog, useValue: dialog },
      { provide: Router, useValue: router },
      { provide: PluginAPIService, useValue: pluginAPI },
      { provide: I18nService, useValue: i18n }
    ]
  })
    .overrideComponent(PluginMarketplaceReadmePageComponent, {
      set: {
        imports: [],
        styles: [],
        template: ''
      }
    })
    .compileComponents()

  const fixture = TestBed.createComponent(PluginMarketplaceReadmePageComponent)
  fixture.detectChanges()
  await fixture.whenStable()
  fixture.detectChanges()

  return {
    component: fixture.componentInstance,
    dialog,
    fixture,
    pluginAPI,
    router
  } satisfies {
    component: PluginMarketplaceReadmePageComponent
    dialog: typeof dialog
    fixture: ComponentFixture<PluginMarketplaceReadmePageComponent>
    pluginAPI: typeof pluginAPI
    router: typeof router
  }
}

describe('PluginMarketplaceReadmePageComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('opens the requested template once and navigates to the created agent', async () => {
    const { dialog, fixture, router } = await createComponent()

    fixture.detectChanges()

    expect(dialog.open).toHaveBeenCalledTimes(1)
    expect(dialog.open).toHaveBeenCalledWith(
      XpertNewBlankComponent,
      expect.objectContaining({
        disableClose: true,
        data: expect.objectContaining({
          allowedModes: [XpertTypeEnum.Agent],
          allowWorkspaceSelection: true,
          completionMode: 'create',
          initialStartMode: 'template',
          initialTemplateId: '@xpert-ai/plugin-docx-editor:docx-editor-assistant',
          lockStartMode: true,
          lockType: true,
          type: XpertTypeEnum.Agent
        })
      })
    )
    expect(router.navigate).toHaveBeenCalledWith(['/xpert/x/', 'agent-1'])
  })

  it('keeps a fully qualified template id unchanged', async () => {
    const { dialog } = await createComponent({ template: '@acme/plugin-docs:document-reviewer' })

    expect(dialog.open).toHaveBeenCalledWith(
      XpertNewBlankComponent,
      expect.objectContaining({
        data: expect.objectContaining({ initialTemplateId: '@acme/plugin-docs:document-reviewer' })
      })
    )
  })

  it('does not open a creation wizard before the plugin is installed', async () => {
    const { dialog } = await createComponent({ installed: false })

    expect(dialog.open).not.toHaveBeenCalled()
  })

  it('does not open a creation wizard without a template parameter', async () => {
    const { dialog } = await createComponent({ template: null })

    expect(dialog.open).not.toHaveBeenCalled()
  })
})
