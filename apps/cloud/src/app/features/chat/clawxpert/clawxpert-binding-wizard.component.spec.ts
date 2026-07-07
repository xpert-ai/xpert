jest.mock('../../../@core', () => ({
  XpertTypeEnum: {
    Agent: 'agent'
  }
}))

jest.mock('@xpert-ai/headless-ui', () => {
  const { Component, Directive, Input } = jest.requireActual('@angular/core')

  @Directive({
    standalone: true,
    selector: '[z-button]'
  })
  class ZardButtonComponent {
    @Input() zType?: string
    @Input() displayDensity?: string
  }

  @Directive({
    standalone: true,
    selector: '[z-input]'
  })
  class ZardInputDirective {}

  @Component({
    standalone: true,
    selector: 'z-icon',
    template: ''
  })
  class ZardIconComponent {
    @Input() zType?: string
  }

  @Component({
    standalone: true,
    selector: 'z-card',
    template: '<ng-content />'
  })
  class ZCardComponent {}

  @Component({
    standalone: true,
    selector: 'z-card-content',
    template: '<ng-content />'
  })
  class ZCardContentComponent {}

  return {
    ZardButtonComponent,
    ZardCardImports: [ZCardComponent, ZCardContentComponent],
    ZardIconComponent,
    ZardInputDirective
  }
})

jest.mock('../../../@shared/avatar', () => {
  const { Component, Input } = jest.requireActual('@angular/core')

  @Component({
    standalone: true,
    // eslint-disable-next-line @angular-eslint/component-selector
    selector: 'emoji-avatar',
    template: ''
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

jest.mock('../../xpert/xpert', () => {
  const { Component } = jest.requireActual('@angular/core')

  @Component({
    standalone: true,
    selector: 'pac-xpert-new-blank',
    template: ''
  })
  class XpertNewBlankComponent {}

  return {
    BLANK_XPERT_DIALOG_CATEGORY: {
      CLAW: 'claw'
    },
    XpertNewBlankComponent
  }
})

jest.mock('./clawxpert.facade', () => ({
  ClawXpertFacade: class ClawXpertFacade {}
}))

import { Dialog } from '@angular/cdk/dialog'
import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { IXpert } from '../../../@core'
import { XpertNewBlankComponent } from '../../xpert/xpert'
import { ClawXpertBindingWizardComponent } from './clawxpert-binding-wizard.component'
import { ClawXpertFacade } from './clawxpert.facade'

function createFacadeMock(options?: {
  availableXperts?: Partial<IXpert>[]
  resolvedPreference?: { assistantId: string } | null
}) {
  return {
    availableXperts: signal(options?.availableXperts ?? []),
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

async function setup(options?: Parameters<typeof createFacadeMock>[0]) {
  const facade = createFacadeMock(options)
  const dialog = {
    open: jest.fn(() => ({
      closed: {
        subscribe: jest.fn()
      }
    }))
  }

  await TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot(), ClawXpertBindingWizardComponent],
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

  const fixture = TestBed.createComponent(ClawXpertBindingWizardComponent)
  fixture.detectChanges()

  return {
    dialog,
    facade,
    fixture
  }
}

describe('ClawXpertBindingWizardComponent', () => {
  it('renders the legacy binding wizard instead of the onboarding guide', async () => {
    const { fixture } = await setup({
      availableXperts: [
        {
          id: 'xpert-1',
          title: 'Research ClawXpert',
          description: 'Published assistant'
        }
      ]
    })

    const textContent = fixture.nativeElement.textContent

    expect(textContent).toContain('PAC.Chat.ClawXpert.WizardTitle')
    expect(textContent).not.toContain('PAC.Chat.ClawXpert.OnboardingTitle')
    expect(fixture.nativeElement.querySelector('[data-onboarding-step]')).toBeNull()
  })

  it('saves the selected published Xpert binding', async () => {
    const { facade, fixture } = await setup({
      availableXperts: [
        {
          id: 'xpert-1',
          title: 'Research ClawXpert',
          description: 'Published assistant'
        }
      ]
    })

    fixture.componentInstance.selectXpert('xpert-1')
    await fixture.componentInstance.savePreference()

    expect(facade.savePreference).toHaveBeenCalledWith('xpert-1')
  })

  it('opens new ClawXpert creation with the ClawXpert template locked', async () => {
    const { dialog, fixture } = await setup()

    fixture.componentInstance.openCreateWizard()

    expect(dialog.open).toHaveBeenCalledWith(
      XpertNewBlankComponent,
      expect.objectContaining({
        disableClose: true,
        data: expect.objectContaining({
          category: 'claw',
          completionMode: 'publish',
          initialStartMode: 'template',
          initialTemplateId: 'xpert-my-claw-xpert',
          lockStartMode: true,
          type: 'agent'
        })
      })
    )
  })
})
