import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router'
import { TranslateService } from '@ngx-translate/core'
import { AiModelTypeEnum, PluginApplicationDetail } from '@xpert-ai/contracts'
import { of, Subject } from 'rxjs'

jest.mock('@cloud/app/@core', () => ({
  PluginApplicationService: class PluginApplicationService {},
  injectToastr: () => ({ error: jest.fn(), success: jest.fn() }),
  getErrorMessage: (error: Error) => error.message
}))
jest.mock('@cloud/app/@core/state', () => ({
  injectPluginAPI: () => ({ getPluginComponents: () => of({ items: [] }) })
}))
jest.mock('@cloud/app/@shared/avatar', () => ({ IconComponent: class IconComponent {} }))
jest.mock('@cloud/app/@shared/copilot/copilot-model-select/select.component', () => ({
  CopilotModelSelectComponent: class CopilotModelSelectComponent {}
}))
jest.mock('@xpert-ai/headless-ui', () => ({
  XpI18nPipe: class XpI18nPipe {},
  ZardAccordionImports: [],
  ZardAlertDialogService: class ZardAlertDialogService {},
  ZardButtonComponent: class ZardButtonComponent {},
  ZardIconComponent: class ZardIconComponent {}
}))
jest.mock('../../setting/plugins/marketplace/marketplace-mcp-provider.component', () => ({
  PluginMarketplaceMcpProviderComponent: class PluginMarketplaceMcpProviderComponent {}
}))
jest.mock('./app-toolsets.component', () => ({ ApplicationToolsetsComponent: class ApplicationToolsetsComponent {} }))
jest.mock('../explore-scope.service', () => ({ ExploreScopeService: class ExploreScopeService {} }))
jest.mock('../explore-scope.component', () => ({ ExploreScopeComponent: class ExploreScopeComponent {} }))

import { PluginApplicationService } from '@cloud/app/@core'
import { ZardAlertDialogService } from '@xpert-ai/headless-ui'
import { ExploreScopeService } from '../explore-scope.service'
import { ApplicationDetailComponent } from './app-detail.component'

const tenantDetail: PluginApplicationDetail = {
  application: {
    id: 'plugin:app',
    pluginName: 'plugin',
    appName: 'app',
    scope: 'organization',
    assistantTemplateKey: 'assistant',
    config: {
      scope: 'organization',
      assistantTemplateKey: 'assistant',
      workspace: { mode: 'dedicated', name: 'App', sharing: 'organization' }
    }
  },
  status: { appId: 'plugin:app', status: 'not_installed' },
  preflight: {
    supported: true,
    scope: 'organization',
    canInitialize: false,
    reason: 'organization_scope_required',
    embeddingModels: [],
    visionModels: [],
    primaryModelAvailable: false,
    modelRequirements: {}
  }
}
const organizationDetail: PluginApplicationDetail = {
  ...tenantDetail,
  preflight: { ...tenantDetail.preflight, canInitialize: true, reason: undefined, primaryModelAvailable: true }
}

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

describe('ApplicationDetail scope transitions', () => {
  const scope = { key: signal('tenant'), choose: jest.fn() }
  const applications = { getDetail: jest.fn(), initialize: jest.fn(), discardConfiguration: jest.fn() }
  const router = { navigate: jest.fn().mockResolvedValue(true) }

  beforeEach(async () => {
    jest.clearAllMocks()
    scope.key.set('tenant')
    applications.getDetail.mockReturnValue(of(tenantDetail))
    await TestBed.configureTestingModule({
      imports: [ApplicationDetailComponent],
      providers: [
        { provide: ExploreScopeService, useValue: scope },
        { provide: PluginApplicationService, useValue: applications },
        { provide: Router, useValue: router },
        { provide: TranslateService, useValue: { instant: (key: string) => key } },
        { provide: ZardAlertDialogService, useValue: {} },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: convertToParamMap({ plugin: 'plugin' }),
              paramMap: convertToParamMap({ appName: 'app' })
            }
          }
        }
      ]
    })
      .overrideComponent(ApplicationDetailComponent, { set: { imports: [], template: '' } })
      .compileComponents()
  })

  async function create() {
    const fixture = TestBed.createComponent(ApplicationDetailComponent)
    fixture.detectChanges()
    await settle()
    return fixture
  }

  it('requires a speech selection, submits its authorized ID, and clears it on an organization switch', async () => {
    const speechDetail: PluginApplicationDetail = {
      ...organizationDetail,
      preflight: {
        ...organizationDetail.preflight,
        modelRequirements: { speechToText: true },
        speechToTextModels: [
          {
            id: 'provider/speech%2Fmodel',
            copilotId: 'provider',
            model: 'speech/model',
            label: 'Speech',
            modelType: AiModelTypeEnum.SPEECH2TEXT
          }
        ]
      }
    }
    applications.getDetail.mockReturnValue(of(speechDetail))
    const fixture = await create()
    const component = fixture.componentInstance
    expect(component.speechToTextModelId()).toBe('provider/speech%2Fmodel')
    component.speechToTextModel.set(null)
    expect(component.canSubmit()).toBe(false)
    await component.initialize()
    expect(applications.initialize).not.toHaveBeenCalled()
    component.speechToTextModel.set({
      copilotId: 'provider',
      model: 'speech/model',
      modelType: AiModelTypeEnum.SPEECH2TEXT
    })
    expect(component.canSubmit()).toBe(true)
    applications.initialize.mockReturnValue(of({ appId: 'plugin:app', status: 'initializing' }))
    await component.initialize()
    expect(applications.initialize).toHaveBeenCalledWith(
      expect.objectContaining({ speechToTextModelId: 'provider/speech%2Fmodel' })
    )
    applications.getDetail.mockReturnValue(
      of({
        ...speechDetail,
        preflight: {
          ...speechDetail.preflight,
          canInitialize: false,
          speechToTextModels: [],
          reason: 'speech_to_text_model_required'
        }
      })
    )
    scope.key.set('other-organization')
    fixture.detectChanges()
    await settle()
    expect(component.speechToTextModel()).toBeNull()
    expect(component.canSubmit()).toBe(false)
    expect(component.preflightMessage()).toBe('XP.Explore.Application.Preflight.SpeechToTextModelRequired')
  })

  it('prefers personal installation and clears setup selections when the target changes', async () => {
    const personal: PluginApplicationDetail = {
      ...organizationDetail,
      application: {
        ...organizationDetail.application,
        scope: 'personal',
        config: { ...organizationDetail.application.config, scope: ['organization', 'personal'] }
      },
      status: { appId: 'plugin:app', status: 'not_installed', installationScope: 'personal' }
    }
    applications.getDetail.mockImplementation((_plugin, _app, selected) =>
      of({ ...personal, application: { ...personal.application, scope: selected ?? 'organization' } })
    )
    const fixture = await create()
    fixture.detectChanges()
    await settle()
    expect(fixture.componentInstance.application()?.scope).toBe('personal')
    expect(fixture.componentInstance.applicationInput().installationScope).toBe('personal')
    fixture.componentInstance.toolsetSelections.set([{ key: 'tools', toolsetId: 'personal-tools' }])
    fixture.componentInstance.selectInstallationScope('organization')
    fixture.detectChanges()
    await settle()
    expect(fixture.componentInstance.application()?.scope).toBe('organization')
    expect(fixture.componentInstance.toolsetSelections()).toEqual([])
    expect(applications.getDetail).toHaveBeenLastCalledWith('plugin', 'app', 'organization')
  })

  it('keeps tenant browsing unchanged when organization selection is cancelled', async () => {
    const fixture = await create()
    scope.choose.mockResolvedValue(false)
    void fixture.componentInstance.primaryAction()
    await settle()
    expect(scope.choose).toHaveBeenCalledWith(true)
    expect(fixture.componentInstance.setupOpen()).toBe(false)
    expect(applications.initialize).not.toHaveBeenCalled()
    expect(router.navigate).not.toHaveBeenCalled()
  })

  it('continues setup after loading the selected organization without initializing anything', async () => {
    const fixture = await create()
    applications.getDetail.mockReturnValue(of(organizationDetail))
    scope.choose.mockImplementation(async () => {
      scope.key.set('organization')
      return true
    })
    void fixture.componentInstance.primaryAction()
    await settle()
    fixture.detectChanges()
    await settle()
    expect(fixture.componentInstance.detail()).toEqual(organizationDetail)
    expect(fixture.componentInstance.setupOpen()).toBe(true)
    expect(applications.initialize).not.toHaveBeenCalled()
  })

  it('ignores an old scope detail response after switching scope', async () => {
    const oldResponse = new Subject<PluginApplicationDetail>()
    applications.getDetail.mockReturnValueOnce(oldResponse).mockReturnValue(of(organizationDetail))
    const fixture = await create()
    scope.key.set('organization')
    fixture.detectChanges()
    await settle()
    oldResponse.next(tenantDetail)
    await settle()
    expect(fixture.componentInstance.detail()).toEqual(organizationDetail)
  })

  it('ignores an old toolset refresh after switching scope', async () => {
    const fixture = await create()
    const oldResponse = new Subject<PluginApplicationDetail>()
    applications.getDetail.mockReturnValueOnce(oldResponse).mockReturnValue(of(organizationDetail))
    void fixture.componentInstance.refreshToolsets()
    scope.key.set('organization')
    fixture.detectChanges()
    await settle()
    oldResponse.next(tenantDetail)
    await settle()
    expect(fixture.componentInstance.detail()).toEqual(organizationDetail)
    expect(fixture.componentInstance.refreshingToolsets()).toBe(false)
  })
})
