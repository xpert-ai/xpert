import { TestBed } from '@angular/core/testing'
import { OverlayContainer } from '@angular/cdk/overlay'
import { TranslateModule } from '@ngx-translate/core'
import { AiModelTypeEnum, ICopilot, ProviderModelCatalog } from '@xpert-ai/contracts'
import { connectionState, ProviderConnectionsComponent } from './connection-menu.component'

describe('provider connection management', () => {
  const connection = {
    id: 'production',
    name: 'Production',
    enabled: true,
    modelProvider: { providerName: 'tongyi', isValid: true }
  } as ICopilot

  afterEach(() => TestBed.resetTestingModule())

  it('distinguishes disabled, credential failure, catalog failure and no enabled models', () => {
    expect(connectionState({ ...connection, enabled: false }, true)).toBe('disabled')
    expect(
      connectionState({ ...connection, modelProvider: { ...connection.modelProvider, isValid: false } }, false)
    ).toBe('invalid')
    expect(connectionState(connection, true)).toBe('catalogError')
    expect(
      connectionState(
        { ...connection, modelProvider: { ...connection.modelProvider, options: { enabledModels: [] } } },
        false
      )
    ).toBe('pending')
  })

  it('counts enabled models by type and excludes deprecated catalog entries', () => {
    TestBed.configureTestingModule({ imports: [ProviderConnectionsComponent, TranslateModule.forRoot()] })
    const fixture = TestBed.createComponent(ProviderConnectionsComponent)
    const catalog = {
      builtin: [
        { model: 'shared-name', model_type: AiModelTypeEnum.LLM },
        { model: 'shared-name', model_type: AiModelTypeEnum.TEXT_EMBEDDING },
        { model: 'old', model_type: AiModelTypeEnum.LLM, deprecated: true }
      ],
      custom: [],
      enabledModels: [
        { model: 'shared-name', modelType: AiModelTypeEnum.TEXT_EMBEDDING },
        { model: 'old', modelType: AiModelTypeEnum.LLM }
      ]
    } as ProviderModelCatalog
    fixture.componentRef.setInput('connections', [connection])
    fixture.componentRef.setInput('selectedId', connection.id)
    fixture.componentRef.setInput('catalogs', { production: catalog })
    expect(fixture.componentInstance.current().count).toBe(1)
    fixture.componentRef.setInput('catalogs', {})
    expect(fixture.componentInstance.current().count).toBeNull()
  })

  it('returns focus to the Zard button and emits the exact connection for row actions', () => {
    TestBed.configureTestingModule({ imports: [ProviderConnectionsComponent, TranslateModule.forRoot()] })
    const fixture = TestBed.createComponent(ProviderConnectionsComponent)
    fixture.componentRef.setInput('connections', [connection])
    fixture.componentRef.setInput('selectedId', connection.id)
    fixture.detectChanges()
    const edited = jest.fn()
    const toggled = jest.fn()
    fixture.componentInstance.edit.subscribe(edited)
    fixture.componentInstance.toggle.subscribe(toggled)
    fixture.componentInstance.editConnection(connection)
    expect(edited).toHaveBeenCalledWith(connection)
    expect(document.activeElement).toBe(fixture.componentInstance.trigger().nativeElement)
    fixture.componentInstance.toggleConnection(connection)
    expect(toggled).toHaveBeenCalledWith(connection)
  })

  it('closes a nested action menu before its connection popover on Escape', async () => {
    TestBed.configureTestingModule({ imports: [ProviderConnectionsComponent, TranslateModule.forRoot()] })
    const fixture = TestBed.createComponent(ProviderConnectionsComponent)
    fixture.componentRef.setInput('connections', [connection])
    fixture.componentRef.setInput('selectedId', connection.id)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.componentInstance.popover().show()
    fixture.detectChanges()
    await fixture.whenStable()
    const overlay = TestBed.inject(OverlayContainer).getContainerElement()
    overlay.querySelector<HTMLButtonElement>('[z-menu]').click()
    fixture.detectChanges()
    await fixture.whenStable()
    overlay
      .querySelector<HTMLButtonElement>('[role="menuitem"]')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }))
    fixture.detectChanges()
    expect(overlay.querySelector('[role="menu"]')).toBeNull()
    expect(overlay.querySelector('[role="dialog"]')).not.toBeNull()
    expect(fixture.componentInstance.open()).toBe(true)
  })
})
