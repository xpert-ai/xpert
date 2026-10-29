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
  const { myRxResource } = jest.requireActual('@xpert-ai/headless-ui/ui/compat/core/signal/resource')

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

jest.mock('./plugin-marketplace-categories', () => ({
  PLUGIN_MARKETPLACE_TARGET_APP: 'xpert'
}))

jest.mock('./plugin-marketplace-metadata', () => ({
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
import { NO_ERRORS_SCHEMA, Pipe, PipeTransform } from '@angular/core'
import { CommonModule } from '@angular/common'
import { HttpErrorResponse } from '@angular/common/http'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ActivatedRoute, Router, RouterModule, provideRouter, convertToParamMap } from '@angular/router'
import { PluginMarketplaceDetailErrorCode, XpertTypeEnum } from '@xpert-ai/contracts'
import { PluginAPIService } from '@cloud/app/@core/state'
import { I18nService } from '@cloud/app/@shared/i18n'
import { of, throwError } from 'rxjs'
import { XpertNewBlankComponent } from '../../../xpert/xpert/blank/blank.component'
import { PluginMarketplaceReadmePageComponent } from './marketplace-readme-page.component'

@Pipe({ name: 'i18n', standalone: true })
class TestI18nPipe implements PipeTransform {
  transform(value: unknown) {
    return value
  }
}

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
  readme: { content: string; source: string; locale: string }
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
    contributions: [],
    readme: { content: '# DOCX Editor', source: 'marketplace-metadata', locale: 'en' }
  }
}

async function createComponent(
  options: { template?: string | null; installed?: boolean; failure?: unknown; locale?: string } = {}
) {
  const template = options.template === undefined ? 'docx-editor-assistant' : options.template
  const detail = createPluginDetail(options.installed)
  const dialog = {
    open: jest.fn(() => ({
      closed: of({ xpert: { id: 'agent-1' } })
    }))
  }
  const pluginAPI = {
    getMarketplacePluginDetail: jest.fn(() => (options.failure ? throwError(() => options.failure) : of(detail)))
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
    language: jest.fn(() => options.locale ?? 'zh-Hans'),
    instant: jest.fn((key: string, values?: { Default?: string }) => values?.Default ?? key)
  }

  await TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot()],
    providers: [
      provideRouter([]),
      { provide: ActivatedRoute, useValue: route },
      { provide: Dialog, useValue: dialog },
      { provide: PluginAPIService, useValue: pluginAPI },
      { provide: I18nService, useValue: i18n }
    ]
  })
    .overrideComponent(PluginMarketplaceReadmePageComponent, {
      set: {
        imports: [CommonModule, RouterModule, TranslateModule, TestI18nPipe],
        schemas: [NO_ERRORS_SCHEMA],
        styles: []
      }
    })
    .compileComponents()

  const translate = TestBed.inject(TranslateService)
  for (const language of ['en', 'en-US', 'zh-Hans', 'zh-CN', 'zh-Hant']) {
    translate.setTranslation(
      language,
      JSON.parse(readFileSync(resolve(__dirname, '../../../../../assets/i18n', `${language}.json`), 'utf8'))
    )
  }
  translate.use(options.locale ?? 'zh-Hans')
  const router = TestBed.inject(Router)
  jest.spyOn(router, 'navigate').mockResolvedValue(true)

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

  it.each([
    ['en', 'Plugin details unavailable', 'could not be found or accessed', 'Back to marketplace'],
    ['en-US', 'Plugin details unavailable', 'could not be found or accessed', 'Back to marketplace'],
    ['zh-Hans', '无法获取插件详情', '未找到此软件包或无法访问', '返回插件市场'],
    ['zh-CN', '无法获取插件详情', '未找到此软件包或无法访问', '返回插件市场'],
    ['zh-Hant', '無法取得外掛詳情', '找不到此套件或無法存取', '返回']
  ])(
    'renders an inaccessible package in %s without exposing the raw English error',
    async (locale, title, explanation, back) => {
      const { fixture } = await createComponent({
        locale,
        failure: new HttpErrorResponse({
          status: 404,
          error: {
            code: PluginMarketplaceDetailErrorCode.Unavailable,
            message: 'Plugin "@xpert-ai/plugin-server-inspection" was not found'
          }
        })
      })
      const element: HTMLElement = fixture.nativeElement
      expect(element.querySelector('[role="alert"]')?.textContent).toContain(title)
      expect(element.textContent).toContain(explanation)
      expect(element.textContent).not.toContain('was not found')
      expect(element.querySelector('[role="alert"] button')).toBeNull()
      const link = element.querySelector('a')
      expect(link?.textContent).toContain(back)
      expect(link?.getAttribute('href')).toBe('/plugins?category=marketplace')
    }
  )

  it('handles a missing package from an older server neutrally', async () => {
    const { fixture } = await createComponent({
      locale: 'en',
      failure: new HttpErrorResponse({
        status: 404,
        error: { message: 'Plugin "@example/missing" was not found' }
      })
    })
    const element: HTMLElement = fixture.nativeElement
    expect(element.textContent).toContain('could not be found or accessed')
    expect(element.textContent).toContain('contact your administrator')
    expect(element.querySelector('[role="alert"] button')).toBeNull()
  })

  it.each([0, 408, 429, 500, 503])(
    'offers retry for transient HTTP %s and recovers after a successful request',
    async (status) => {
      const { fixture, pluginAPI } = await createComponent({
        template: null,
        locale: 'en',
        failure: new HttpErrorResponse({
          status,
          error: { message: 'Internal upstream diagnostics' }
        })
      })
      const element: HTMLElement = fixture.nativeElement
      expect(element.textContent).not.toContain('Internal upstream diagnostics')
      const retry = element.querySelector<HTMLButtonElement>('[role="alert"] button')
      expect(retry?.textContent).toContain('Try again')
      pluginAPI.getMarketplacePluginDetail.mockReturnValue(of(createPluginDetail()))
      retry?.click()
      fixture.detectChanges()
      await fixture.whenStable()
      fixture.detectChanges()
      expect(pluginAPI.getMarketplacePluginDetail).toHaveBeenCalledTimes(2)
      expect(element.querySelector('[role="alert"]')).toBeNull()
      expect(element.querySelector('h1')?.textContent).toContain('DOCX Editor')
    }
  )

  it('shows source availability guidance for a structured lookup failure', async () => {
    const { fixture } = await createComponent({
      locale: 'zh-Hans',
      failure: new HttpErrorResponse({
        status: 503,
        error: { code: PluginMarketplaceDetailErrorCode.LookupFailed }
      })
    })
    const element: HTMLElement = fixture.nativeElement
    expect(element.textContent).toContain('无法加载插件市场来源')
    expect(element.querySelector('[role="alert"] button')?.textContent).toContain('重试')
  })

  it.each([
    [401, 'Sign in again'],
    [403, 'do not have permission']
  ])('gives access guidance only for an explicit HTTP %s response', async (status, message) => {
    const { fixture } = await createComponent({ locale: 'en', failure: new HttpErrorResponse({ status }) })
    const element: HTMLElement = fixture.nativeElement
    expect(element.textContent).toContain(message)
    expect(element.querySelector('[role="alert"] button')).toBeNull()
  })

  it('renders a public plugin successfully without an error panel', async () => {
    const { fixture } = await createComponent({ installed: false, template: null, locale: 'en' })
    const element: HTMLElement = fixture.nativeElement
    expect(element.querySelector('h1')?.textContent).toContain('DOCX Editor')
    expect(element.querySelector('[role="alert"]')).toBeNull()
    expect(element.textContent).toContain('Install')
  })
})
