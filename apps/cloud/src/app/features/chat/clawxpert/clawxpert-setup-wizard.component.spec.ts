import { Dialog } from '@angular/cdk/dialog'
import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { of } from 'rxjs'
import { IXpert, XpertTypeEnum } from '../../../@core'
import { XpertNewBlankComponent } from '../../xpert/xpert'
import { ClawXpertFacade } from './clawxpert.facade'
import { ClawXpertSetupWizardComponent } from './clawxpert-setup-wizard.component'

function createFacadeMock(options?: { availableXperts?: Partial<IXpert>[]; resolvedPreference?: { assistantId: string } | null }) {
  return {
    availableXperts: signal((options?.availableXperts ?? []) as IXpert[]),
    bindPublishedXpert: jest.fn().mockResolvedValue(undefined),
    cancelWizard: jest.fn(),
    getXpertLabel: jest.fn((xpert?: Partial<IXpert> | null) => xpert?.title || xpert?.name || xpert?.id || ''),
    organizationId: signal('org-1'),
    orphanedPreference: signal(false),
    resolvedPreference: signal(options?.resolvedPreference ?? null),
    savePreference: jest.fn().mockResolvedValue(undefined),
    saving: signal(false)
  }
}

describe('ClawXpertSetupWizardComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('renders the new create button in the setup wizard empty state', async () => {
    const facade = createFacadeMock()
    const dialog = {
      open: jest.fn(() => ({
        closed: of(undefined)
      }))
    }

    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ClawXpertSetupWizardComponent],
      providers: [
        provideRouter([]),
        {
          provide: ClawXpertFacade,
          useValue: facade
        },
        {
          provide: Dialog,
          useValue: dialog
        }
      ]
    }).compileComponents()

    const fixture = TestBed.createComponent(ClawXpertSetupWizardComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    expect(fixture.nativeElement.textContent).toContain('PAC.Chat.ClawXpert.CreateNew')
  })

  it('opens the shared publish-mode blank wizard and auto-binds a published xpert result', async () => {
    const publishedXpert = {
      id: 'xpert-new',
      name: 'New ClawXpert',
      latest: true,
      type: XpertTypeEnum.Agent
    } as IXpert
    const facade = createFacadeMock({
      availableXperts: [
        {
          id: 'xpert-old',
          name: 'Existing',
          latest: true,
          type: XpertTypeEnum.Agent
        }
      ]
    })
    const dialog = {
      open: jest.fn(() => ({
        closed: of({
          status: 'published',
          xpert: publishedXpert
        })
      }))
    }

    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ClawXpertSetupWizardComponent],
      providers: [
        provideRouter([]),
        {
          provide: ClawXpertFacade,
          useValue: facade
        },
        {
          provide: Dialog,
          useValue: dialog
        }
      ]
    }).compileComponents()

    const fixture = TestBed.createComponent(ClawXpertSetupWizardComponent)
    const component = fixture.componentInstance

    fixture.detectChanges()
    await fixture.whenStable()

    component.openCreateWizard()
    await Promise.resolve()

    expect(dialog.open).toHaveBeenCalledWith(
      XpertNewBlankComponent,
      expect.objectContaining({
        disableClose: true,
        data: expect.objectContaining({
          allowWorkspaceSelection: true,
          allowedModes: [XpertTypeEnum.Agent],
          completionMode: 'publish',
          type: XpertTypeEnum.Agent
        })
      })
    )
    expect(facade.bindPublishedXpert).toHaveBeenCalledWith(publishedXpert)
  })
})
