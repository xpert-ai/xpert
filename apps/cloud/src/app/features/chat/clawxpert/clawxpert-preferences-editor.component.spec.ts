import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { signal } from '@angular/core'
import { ClawXpertFacade } from './clawxpert.facade'
import { ClawXpertPreferencesEditorComponent } from './clawxpert-preferences-editor.component'

jest.mock('./clawxpert.facade', () => ({
  ClawXpertFacade: class ClawXpertFacade {}
}))

jest.mock('@xpert-ai/headless-ui', () => {
  const angularCore = jest.requireActual('@angular/core')

  class ZardButtonComponent {}
  angularCore.Directive({
    selector: 'button[z-button]',
    standalone: true,
    inputs: ['zType', 'displayDensity', 'zSize']
  })(ZardButtonComponent)

  class ZardIconComponent {}
  angularCore.Component({
    selector: 'z-icon',
    standalone: true,
    template: ''
  })(ZardIconComponent)
  angularCore.Input()(ZardIconComponent.prototype, 'zType')

  class ZardCardComponent {}
  angularCore.Component({
    selector: 'z-card',
    standalone: true,
    template: '<ng-content />'
  })(ZardCardComponent)

  class ZardCardContentComponent {}
  angularCore.Component({
    selector: 'z-card-content',
    standalone: true,
    template: '<ng-content />'
  })(ZardCardContentComponent)

  class ZTabNavBarDirective {}
  angularCore.Directive({
    selector: '[z-tab-nav-bar]',
    standalone: true,
    inputs: ['tabPanel', 'color', 'alignTabs', 'stretchTabs', 'disableRipple', 'zSize']
  })(ZTabNavBarDirective)

  class ZTabLinkDirective {}
  angularCore.Directive({
    selector: '[z-tab-link]',
    standalone: true,
    inputs: ['active']
  })(ZTabLinkDirective)

  class ZTabNavPanelComponent {}
  angularCore.Component({
    selector: 'z-tab-nav-panel',
    standalone: true,
    template: '<ng-content />'
  })(ZTabNavPanelComponent)

  return {
    ZardButtonComponent,
    ZardIconComponent,
    ZardCardImports: [ZardCardComponent, ZardCardContentComponent],
    ZardTabsImports: [ZTabNavBarDirective, ZTabLinkDirective, ZTabNavPanelComponent]
  }
})

jest.mock('../../../@shared/editors/code-editor/editor.component', () => {
  const angularCore = jest.requireActual('@angular/core')
  const angularForms = jest.requireActual('@angular/forms')

  class MockCodeEditorComponent {
    writeValue() {}
    registerOnChange() {}
    registerOnTouched() {}
  }

  angularCore.Component({
    standalone: true,
    selector: 'pac-code-editor',
    template: '<textarea data-testid="code-editor"></textarea>',
    providers: [
      {
        provide: angularForms.NG_VALUE_ACCESSOR,
        useExisting: angularCore.forwardRef(() => MockCodeEditorComponent),
        multi: true
      }
    ]
  })(MockCodeEditorComponent)
  angularCore.Input()(MockCodeEditorComponent.prototype, 'fileName')
  angularCore.Input()(MockCodeEditorComponent.prototype, 'lineNumbers')
  angularCore.Input()(MockCodeEditorComponent.prototype, 'editable')
  angularCore.Input()(MockCodeEditorComponent.prototype, 'wordWrap')

  return {
    CodeEditorComponent: MockCodeEditorComponent
  }
})

function createFacadeMock() {
  return {
    loadingUserPreference: signal(false),
    organizationId: signal('org-1'),
    preference: signal({
      assistantId: 'xpert-1'
    }),
    resolvedPreference: signal({
      assistantId: 'xpert-1'
    }),
    savingUserPreference: signal(false),
    userPreference: signal({
      soul: '# SOUL',
      profile: '# USER'
    }),
    viewState: signal<'ready'>('ready'),
    saveUserPreference: jest.fn().mockResolvedValue({
      soul: '# SOUL',
      profile: '# USER'
    })
  }
}

describe('ClawXpertPreferencesEditorComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('opens markdown editing when the binding is resolved even if the binding payload has no id yet', async () => {
    TestBed.resetTestingModule()
    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ClawXpertPreferencesEditorComponent],
      providers: [
        {
          provide: ClawXpertFacade,
          useValue: createFacadeMock()
        }
      ]
    }).compileComponents()

    const fixture = TestBed.createComponent(ClawXpertPreferencesEditorComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    expect(fixture.nativeElement.querySelector('[data-testid="code-editor"]')).not.toBeNull()
    expect(fixture.nativeElement.textContent).not.toContain('EditorBindingRequiredTitle')
  })
})
