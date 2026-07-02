jest.mock('./clawxpert-binding-wizard.component', () => {
  const { Component } = jest.requireActual('@angular/core')

  @Component({
    standalone: true,
    selector: 'pac-clawxpert-binding-wizard',
    template: '<div data-testid="clawxpert-inline-binding-wizard"></div>'
  })
  class ClawXpertBindingWizardComponent {}

  return {
    ClawXpertBindingWizardComponent
  }
})

jest.mock('./clawxpert.facade', () => ({
  ClawXpertFacade: class ClawXpertFacade {}
}))

jest.mock('../../../@core', () => ({
  AiModelTypeEnum: {
    LLM: 'llm'
  },
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
    @Input() zSize?: string
  }

  @Component({
    standalone: true,
    selector: 'z-divider',
    template: ''
  })
  class ZardDividerComponent {
    @Input() zSpacing?: string
  }

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
    selector: '[z-menu]'
  })
  class ZMenuDirective {
    @Input() zMenuTriggerFor?: unknown
  }

  @Directive({
    standalone: true,
    selector: '[z-menu-item]'
  })
  class ZMenuItemDirective {}

  @Directive({
    standalone: true,
    selector: '[z-menu-content]'
  })
  class ZMenuContentDirective {}

  return {
    ZardButtonComponent,
    ZardDividerComponent,
    ZardIconComponent,
    ZardMenuImports: [ZMenuDirective, ZMenuItemDirective, ZMenuContentDirective],
    ZardCardImports: []
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

jest.mock('../../../@shared/copilot', () => {
  const { Component, Input } = jest.requireActual('@angular/core')

  @Component({
    standalone: true,
    selector: 'copilot-model-select',
    template: ''
  })
  class CopilotModelSelectComponent {
    @Input() hiddenLabel?: boolean
    @Input() readonly?: boolean
    @Input() modelType?: unknown
    @Input() ngModel?: unknown
  }

  return {
    CopilotModelSelectComponent
  }
})

function mockOverviewChild(selector: string) {
  const { Component } = jest.requireActual('@angular/core')

  @Component({
    standalone: true,
    selector,
    template: ''
  })
  class MockOverviewChildComponent {}

  return MockOverviewChildComponent
}

jest.mock('./clawxpert-preferences-editor.component', () => ({
  ClawXpertPreferencesEditorComponent: mockOverviewChild('pac-clawxpert-preferences-editor')
}))

jest.mock('./clawxpert-scheduled-tasks.component', () => ({
  ClawXpertScheduledTasksComponent: mockOverviewChild('pac-clawxpert-scheduled-tasks')
}))

jest.mock('./clawxpert-trigger-config-editor.component', () => ({
  ClawXpertTriggerConfigEditorComponent: mockOverviewChild('pac-clawxpert-trigger-config-editor')
}))

jest.mock('./clawxpert-tool-preferences.component', () => ({
  ClawXpertToolPreferencesComponent: mockOverviewChild('pac-clawxpert-tool-preferences')
}))

import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { buildHeatmapLegend } from './clawxpert-heatmap.utils'
import { ClawXpertFacade } from './clawxpert.facade'
import { ClawXpertOverviewComponent } from './clawxpert-overview.component'

describe('ClawXpertOverviewComponent', () => {
  it('builds unique heatmap legend keys while preserving repeated success colors', () => {
    const legend = buildHeatmapLegend()

    expect(new Set(legend.map((cell) => cell.key)).size).toBe(legend.length)
    expect(legend.filter((cell) => cell.background === 'var(--sys-success)')).toHaveLength(3)
  })

  it('renders the inline binding wizard when the overview is in setup state', async () => {
    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ClawXpertOverviewComponent],
      providers: [
        provideRouter([]),
        {
          provide: ClawXpertFacade,
          useValue: {
            loading: signal(false),
            organizationId: signal('org-1'),
            viewState: signal('wizard')
          }
        }
      ]
    }).compileComponents()

    const fixture = TestBed.createComponent(ClawXpertOverviewComponent)
    fixture.detectChanges()

    expect(fixture.nativeElement.querySelector('[data-testid="clawxpert-inline-binding-wizard"]')).not.toBeNull()
  })
})
