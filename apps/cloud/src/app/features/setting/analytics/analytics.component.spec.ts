import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { ZardIconComponent } from '@xpert-ai/headless-ui'
import { getSettingsMenuItems } from '../../menus'
import { RequestScopeLevel } from '../../../@core/types'
import { Clipboard } from '@angular/cdk/clipboard'
import { TranslateModule } from '@ngx-translate/core'
import { of, throwError } from 'rxjs'
import { AnalyticsSettingsComponent } from './analytics.component'
import { AnalyticsDefinitionsService } from '../../../@core/services/analytics-definitions.service'
import { ToastrService } from '../../../@core/services/toastr.service'
import type {
  AnalyticsConfigurableProvider,
  IAnalyticsDefinition,
  IAnalyticsDefinitionVersion
} from '@xpert-ai/contracts'

const provider: AnalyticsConfigurableProvider = {
  descriptor: {
    id: 'file.table',
    name: 'Files',
    sourceKinds: ['definition'],
    operations: [{ name: 'query', contractVersion: 1, readOnly: true }]
  },
  configuration: {
    kind: 'definition',
    connection: 'workspace-files',
    schema: {
      type: 'object',
      properties: { datasets: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' } } } } }
    }
  }
}
const definition: IAnalyticsDefinition = {
  id: 'definition',
  tenantId: 'tenant',
  organizationId: 'org',
  userId: 'owner',
  name: 'Sales',
  providerId: 'file.table',
  visibility: 'private',
  status: 'active',
  currentVersionId: 'latest'
}
const version: IAnalyticsDefinitionVersion = {
  id: 'old',
  definitionId: definition.id,
  versionNumber: 1,
  sha256: 'hash',
  options: { datasets: [{ id: 'sales', columns: [{ key: 'amount', unit: 'CNY' }] }] }
}
const artifactProvider: AnalyticsConfigurableProvider = {
  descriptor: { id: 'script.query', name: 'Scripts', sourceKinds: ['artifact'], operations: [] },
  configuration: {
    kind: 'artifact',
    pluginName: 'scripts',
    resourceType: 'definition',
    registrationTool: 'register_dataset'
  }
}
let api: {
  providers: jest.Mock
  list: jest.Mock
  sources: jest.Mock
  version: jest.Mock
  history: jest.Mock
  publish: jest.Mock
  create: jest.Mock
  validate: jest.Mock
  status: jest.Mock
}
const toast = { success: jest.fn(), error: jest.fn() },
  clipboard = { copy: jest.fn() }
beforeEach(async () => {
  jest.clearAllMocks()
  api = {
    providers: jest.fn(() => of([provider, artifactProvider])),
    list: jest.fn(() => of({ items: [definition], total: 1 })),
    sources: jest.fn(() => of([])),
    version: jest.fn(() => of({ definition, version })),
    history: jest.fn(() => of({ items: [version], total: 1 })),
    publish: jest.fn(() =>
      of({ definition: { ...definition, currentVersionId: 'next' }, version: { ...version, id: 'next' } })
    ),
    create: jest.fn(),
    validate: jest.fn(() => of({ options: version.options })),
    status: jest.fn(() => of(definition))
  }
  await TestBed.configureTestingModule({
    imports: [AnalyticsSettingsComponent, TranslateModule.forRoot()],
    providers: [
      provideRouter([]),
      { provide: AnalyticsDefinitionsService, useValue: api },
      { provide: ToastrService, useValue: toast },
      { provide: Clipboard, useValue: clipboard }
    ]
  }).compileComponents()
})
it('renders configuration entry points, preserves nested options and pins the selected history version when copied', async () => {
  const fixture = TestBed.createComponent(AnalyticsSettingsComponent),
    page = fixture.componentInstance
  fixture.detectChanges()
  await new Promise((resolve) => setTimeout(resolve, 0))
  fixture.detectChanges()
  expect(fixture.nativeElement.textContent).toContain('Files')
  expect(page.loading()).toBe(false)
  await page.edit(definition, version.id)
  expect(api.version).toHaveBeenCalled()
  expect(toast.error).not.toHaveBeenCalled()
  expect(page.options()).toEqual(version.options)
  fixture.detectChanges()
  await fixture.whenStable()
  expect(fixture.nativeElement.querySelector('form')).toBeNull()
  expect(document.querySelector('[role="dialog"] json-schema-form')).not.toBeNull()
  await page.edit(definition, version.id)
  expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1)
  expect(page.options()).toEqual(version.options)
  page.copySource()
  expect(clipboard.copy).toHaveBeenCalledWith(
    JSON.stringify({ kind: 'definition', definitionId: definition.id, versionId: version.id })
  )
  document.querySelector<HTMLButtonElement>('button[form="analytics-configuration-form"]')!.click()
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(api.publish).toHaveBeenCalledWith(definition.id, {
    expectedCurrentVersionId: 'latest',
    options: version.options
  })
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(page.editing()).toBe(false)
})
it('rejects invalid JSON locally and keeps a conflicting edit available for correction', async () => {
  const fixture = TestBed.createComponent(AnalyticsSettingsComponent),
    page = fixture.componentInstance
  fixture.detectChanges()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await page.edit(definition)
  fixture.detectChanges()
  await fixture.whenStable()
  expect(toast.error).not.toHaveBeenCalled()
  page.advanced.set(true)
  page.form.controls.json.setValue('{')
  await page.save()
  expect(api.publish).not.toHaveBeenCalled()
  page.form.controls.json.setValue(JSON.stringify(version.options))
  api.publish.mockReturnValue(throwError(() => new Error('Publication conflict')))
  await page.save()
  expect(page.editing()).toBe(true)
  expect(document.querySelector('[role="dialog"]')).not.toBeNull()
  expect(page.options()).toEqual(version.options)
  expect(toast.error).toHaveBeenCalled()
  expect(page.loading()).toBe(false)
})
it('shows provider metadata and generation guidance without a manual creation form', async () => {
  const fixture = TestBed.createComponent(AnalyticsSettingsComponent)
  fixture.detectChanges()
  await fixture.whenStable()
  fixture.detectChanges()
  expect(fixture.nativeElement.textContent).toContain('XP.Analytics.AutomaticHelp')
  expect(fixture.nativeElement.querySelector('form')).toBeNull()
  expect(fixture.nativeElement.querySelector('z-badge').textContent).toContain('Files')
  await fixture.componentInstance.save()
  expect(api.create).not.toHaveBeenCalled()
  expect(api.publish).not.toHaveBeenCalled()
})

it('uses the shared form for nested edits and preserves values through the JSON view', async () => {
  const fixture = TestBed.createComponent(AnalyticsSettingsComponent)
  const page = fixture.componentInstance
  fixture.detectChanges()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await page.edit(definition)
  await new Promise((resolve) => setTimeout(resolve, 0))
  fixture.detectChanges()
  await new Promise((resolve) => setTimeout(resolve, 0))
  fixture.detectChanges()
  await new Promise((resolve) => setTimeout(resolve, 0))
  fixture.detectChanges()
  const dialog = document.querySelector('[role="dialog"]')!
  expect(page.schemaForm()).toBeDefined()
  expect(dialog.querySelector('json-schema-form')).not.toBeNull()
  expect(dialog.querySelector('xp-analytics-schema-editor')).toBeNull()
  expect(dialog.querySelector('select')).toBeNull()
  for (let step = 0; step < 5; step++) {
    fixture.detectChanges()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  const input = dialog.querySelector<HTMLInputElement>('json-schema-form input')!
  expect(input.value).toBe('sales')
  input.value = 'updated-sales'
  input.dispatchEvent(new Event('input', { bubbles: true }))
  for (let step = 0; step < 5; step++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    fixture.detectChanges()
  }
  expect(page.options()).toEqual({ datasets: [{ id: 'updated-sales', columns: [{ key: 'amount', unit: 'CNY' }] }] })
  expect(version.options).toEqual({ datasets: [{ id: 'sales', columns: [{ key: 'amount', unit: 'CNY' }] }] })
  page.toggleAdvanced()
  fixture.detectChanges()
  expect(JSON.parse(page.form.controls.json.value)).toEqual(page.options())
  page.form.controls.json.setValue(JSON.stringify(version.options))
  page.toggleAdvanced()
  fixture.detectChanges()
  await new Promise((resolve) => setTimeout(resolve, 0))
  fixture.detectChanges()
  expect(page.options()).toEqual(version.options)
  expect(page.editorValid()).toBe(true)
  dialog.querySelector<HTMLButtonElement>('[xpDialogCloseButton]')!.click()
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(page.editing()).toBe(false)
  expect(api.publish).not.toHaveBeenCalled()
})

it('blocks publication while a nested shared JSON control has an invalid draft', async () => {
  const fixture = TestBed.createComponent(AnalyticsSettingsComponent)
  const page = fixture.componentInstance
  fixture.detectChanges()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await page.edit(definition)
  await new Promise((resolve) => setTimeout(resolve, 0))
  page.provider.set({
    ...provider,
    configuration: {
      kind: 'definition',
      connection: 'rest-toolset',
      schema: {
        type: 'object',
        properties: { arguments: { type: 'object', additionalProperties: true } }
      }
    }
  })
  page.form.controls.name.setValue('Sales')
  page.updateOptions({ arguments: { limit: 5 } })
  fixture.detectChanges()
  await new Promise((resolve) => setTimeout(resolve, 0))
  fixture.detectChanges()
  for (let step = 0; step < 5; step++) {
    fixture.detectChanges()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  const textarea = document.querySelector<HTMLTextAreaElement>('[role="dialog"] json-schema-form textarea')!
  expect(JSON.parse(textarea.value)).toEqual({ limit: 5 })
  textarea.value = '{'
  textarea.dispatchEvent(new Event('input', { bubbles: true }))
  await new Promise((resolve) => setTimeout(resolve, 0))
  fixture.detectChanges()
  expect(page.editorValid()).toBe(false)
  expect(page.input()).toBeNull()
  await page.save()
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(api.create).not.toHaveBeenCalled()
  // Switching to the JSON view uses the last valid model; reopening resets the invalid field draft.
  page.toggleAdvanced()
  fixture.detectChanges()
  page.form.controls.json.setValue('{"arguments":{"limit":10}}')
  page.toggleAdvanced()
  fixture.detectChanges()
  await new Promise((resolve) => setTimeout(resolve, 0))
  fixture.detectChanges()
  expect(page.editorValid()).toBe(true)
  expect(page.input()?.options).toEqual({ arguments: { limit: 10 } })
})

it('renders the Analytics navigation icon as an SVG with the settings icon renderer', () => {
  const menu = getSettingsMenuItems(RequestScopeLevel.ORGANIZATION).find((item) => item.path === 'analytics')!
  const fixture = TestBed.createComponent(ZardIconComponent)
  fixture.componentRef.setInput('zType', menu.icon)
  fixture.detectChanges()
  expect(fixture.nativeElement.querySelector('svg')).not.toBeNull()
})
