import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import type { WorkflowTriggerProviderOption } from '../../../@shared/workflow'
import { ClawXpertFacade } from './clawxpert.facade'
import { ClawXpertTriggerConfigEditorComponent } from './clawxpert-trigger-config-editor.component'

jest.mock('../../../@core', () => ({
  genXpertTriggerKey: jest
    .fn()
    .mockReturnValueOnce('trigger-new-1')
    .mockReturnValueOnce('trigger-new-2')
    .mockReturnValue('trigger-new')
}))

jest.mock('./clawxpert.facade', () => {
  class ClawXpertFacade {}

  return {
    ClawXpertFacade
  }
})

jest.mock('@xpert-ai/headless-ui', () => {
  const angularCore = jest.requireActual('@angular/core')

  class ZardButtonComponent {}
  angularCore.Directive({
    selector: 'button[z-button]',
    standalone: true,
    inputs: ['zType', 'color', 'displayDensity', 'zSize']
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

  class ZardMenuDirective {}
  angularCore.Directive({
    selector: '[z-menu]',
    standalone: true,
    inputs: ['zMenuTriggerFor']
  })(ZardMenuDirective)

  class ZardMenuContentDirective {}
  angularCore.Directive({
    selector: '[z-menu-content]',
    standalone: true
  })(ZardMenuContentDirective)

  class ZardMenuItemDirective {}
  angularCore.Directive({
    selector: '[z-menu-item]',
    standalone: true
  })(ZardMenuItemDirective)

  return {
    ZardButtonComponent,
    ZardIconComponent,
    ZardCardImports: [ZardCardComponent, ZardCardContentComponent],
    ZardMenuImports: [ZardMenuDirective, ZardMenuContentDirective, ZardMenuItemDirective]
  }
})

jest.mock('../../../@shared/workflow', () => {
  const angularCore = jest.requireActual('@angular/core')

  class WorkflowTriggerConfigCardComponent {
    configChange = new angularCore.EventEmitter()
  }
  angularCore.Component({
    selector: 'xpert-workflow-trigger-config-card',
    standalone: true,
    template: ''
  })(WorkflowTriggerConfigCardComponent)
  angularCore.Input()(WorkflowTriggerConfigCardComponent.prototype, 'provider')
  angularCore.Input()(WorkflowTriggerConfigCardComponent.prototype, 'config')
  angularCore.Input()(WorkflowTriggerConfigCardComponent.prototype, 'showHeader')
  angularCore.Output()(WorkflowTriggerConfigCardComponent.prototype, 'configChange')

  return {
    WorkflowTriggerConfigCardComponent,
    buildJsonSchemaDefaults: (schema: { properties?: Record<string, { default?: unknown }> } | null | undefined) => {
      if (!schema?.properties) {
        return undefined
      }

      return Object.entries(schema.properties).reduce<Record<string, unknown>>((state, [name, property]) => {
        if (property.default !== undefined) {
          state[name] = property.default
        }
        return state
      }, {})
    },
    jsonSchemaHasConfigFields: (schema: { properties?: Record<string, unknown> } | null | undefined) =>
      !!Object.keys(schema?.properties ?? {}).length,
    hasJsonSchemaRequiredErrors: () => false
  }
})

type TriggerEditorItem = {
  nodeKey: string
  provider: WorkflowTriggerProviderOption
  config?: Record<string, unknown> | null
}

function createProvider(
  name: string,
  configSchema?: WorkflowTriggerProviderOption['configSchema']
): WorkflowTriggerProviderOption {
  return {
    name,
    label: {
      en_US: name,
      zh_Hans: name
    },
    configSchema
  }
}

function createTriggerItem(
  nodeKey: string,
  provider: WorkflowTriggerProviderOption,
  config?: Record<string, unknown> | null
): TriggerEditorItem {
  return {
    nodeKey,
    provider,
    config
  }
}

function createFacadeMock(options?: {
  triggerEditorItems?: TriggerEditorItem[]
  triggerProviderOptions?: WorkflowTriggerProviderOption[]
}) {
  return {
    loadingTriggerDraft: signal(false),
    organizationId: signal('org-1'),
    resolvedPreference: signal({ assistantId: 'xpert-1' }),
    savingTriggerDraft: signal(false),
    triggerDraftErrorMessage: signal<string | null>(null),
    triggerEditorItems: signal(options?.triggerEditorItems ?? []),
    triggerProviderOptions: signal(options?.triggerProviderOptions ?? []),
    viewState: signal<'ready'>('ready'),
    xpertId: signal('xpert-1'),
    saveTriggerDraft: jest.fn().mockResolvedValue(null)
  }
}

async function configureComponent(options?: { facade?: ReturnType<typeof createFacadeMock> }) {
  const facade = options?.facade ?? createFacadeMock()

  TestBed.resetTestingModule()

  await TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot(), ClawXpertTriggerConfigEditorComponent],
    providers: [
      {
        provide: ClawXpertFacade,
        useValue: facade
      }
    ]
  }).compileComponents()

  const fixture = TestBed.createComponent(ClawXpertTriggerConfigEditorComponent)
  const component = fixture.componentInstance

  fixture.detectChanges()
  await fixture.whenStable()
  fixture.detectChanges()

  return {
    facade,
    fixture,
    component
  }
}

describe('ClawXpertTriggerConfigEditorComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('renders the add trigger button in ready state even when no trigger items exist', async () => {
    const { fixture } = await configureComponent({
      facade: createFacadeMock({
        triggerEditorItems: [],
        triggerProviderOptions: [createProvider('chat'), createProvider('webhook')]
      })
    })

    expect(fixture.nativeElement.querySelector('.trigger-add-button')).not.toBeNull()
  })

  it('excludes chat and already added providers from the addable provider list', async () => {
    const webhookProvider = createProvider('webhook')
    const scheduleProvider = createProvider('scheduler')
    const { component } = await configureComponent({
      facade: createFacadeMock({
        triggerEditorItems: [createTriggerItem('trigger-webhook', webhookProvider, { url: 'https://example.com' })],
        triggerProviderOptions: [createProvider('chat'), webhookProvider, scheduleProvider]
      })
    })

    expect(component.addableTriggerProviders().map((provider) => provider.name)).toEqual(['scheduler'])
  })

  it('adds a trigger locally and marks the editor dirty without saving immediately', async () => {
    const webhookProvider = createProvider('webhook', {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          default: 'https://example.com/hook'
        }
      },
      required: ['url']
    })
    const facade = createFacadeMock({
      triggerEditorItems: [],
      triggerProviderOptions: [createProvider('chat'), webhookProvider]
    })
    const { component } = await configureComponent({ facade })

    component.addTrigger(webhookProvider)

    expect(component.workingItems()).toHaveLength(1)
    expect(component.workingItems()[0]).toEqual(
      expect.objectContaining({
        provider: expect.objectContaining({ name: 'webhook' }),
        config: {
          url: 'https://example.com/hook'
        }
      })
    )
    expect(component.dirty()).toBe(true)
    expect(facade.saveTriggerDraft).not.toHaveBeenCalled()
  })

  it('disables the add trigger button when no providers remain to add', async () => {
    const webhookProvider = createProvider('webhook')
    const { component, fixture } = await configureComponent({
      facade: createFacadeMock({
        triggerEditorItems: [createTriggerItem('trigger-webhook', webhookProvider)],
        triggerProviderOptions: [createProvider('chat'), webhookProvider]
      })
    })

    const addButton = fixture.nativeElement.querySelector('.trigger-add-button') as HTMLButtonElement

    expect(component.addableTriggerProviders()).toHaveLength(0)
    expect(addButton.disabled).toBe(true)
  })
})
