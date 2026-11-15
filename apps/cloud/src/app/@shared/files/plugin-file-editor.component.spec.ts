jest.mock('../../@core', () => {
  const { inject } = jest.requireActual('@angular/core')
  class ViewExtensionApiService {}
  return { ViewExtensionApiService, injectViewExtensionApi: () => inject(ViewExtensionApiService) }
})

import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { HttpClient } from '@angular/common/http'
import { TestBed } from '@angular/core/testing'
import { of } from 'rxjs'
import type { XpertExtensionViewManifest } from '@xpert-ai/contracts'
import { ViewExtensionApiService } from '../../@core'
import { PluginFileEditorComponent } from './plugin-file-editor.component'
import { ViewClientCommandRegistry } from '../view-extension/view-client-command-registry.service'

describe('PluginFileEditorComponent', () => {
  const manifest: XpertExtensionViewManifest = {
    key: 'pptx.editor',
    title: { en_US: 'Presentation' },
    hostType: 'project',
    slot: 'project.files.editor',
    source: { provider: 'pptx' },
    view: { type: 'remote_component', component: { isolation: 'iframe', entry: 'pptx' } },
    clientCommands: [{ key: 'workbench.content.status', required: true, label: { en_US: 'Status' } }]
  }
  const data = { projectId: 'project-1', path: 'deck.pptx' }
  let post: jest.Mock, getSlotViews: jest.Mock, close: jest.Mock

  beforeEach(async () => {
    post = jest.fn(() =>
      of({ viewKey: manifest.key, selectionId: 'resource-1', parameters: { contentProvider: 'spaces' } })
    )
    getSlotViews = jest.fn(() => of([manifest]))
    close = jest.fn()
    await TestBed.configureTestingModule({
      imports: [PluginFileEditorComponent],
      providers: [
        { provide: DIALOG_DATA, useValue: data },
        { provide: DialogRef, useValue: { close } },
        { provide: HttpClient, useValue: { post } },
        { provide: ViewExtensionApiService, useValue: { getSlotViews } }
      ]
    })
      .overrideComponent(PluginFileEditorComponent, { set: { template: '' } })
      .compileComponents()
  })

  async function setup() {
    const fixture = TestBed.createComponent(PluginFileEditorComponent)
    await fixture.whenStable()
    await Promise.resolve()
    await Promise.resolve()
    return {
      fixture,
      component: fixture.componentInstance,
      registry: fixture.debugElement.injector.get(ViewClientCommandRegistry)
    }
  }

  it('resolves the Project path and opens only an available view with required commands', async () => {
    const { component } = await setup()
    expect(post).toHaveBeenCalledWith(expect.stringContaining('/project-1/content-files/open'), { path: data.path })
    expect(getSlotViews).toHaveBeenCalledWith('project', data.projectId, 'project.files.editor', {
      runtimeScope: { projectId: data.projectId }
    })
    expect(component.manifest()).toEqual(manifest)
    expect(component.query().selectionId).toBe('resource-1')
    await component.close()
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('retains dirty content after stale status or rejected close and waits for save confirmation', async () => {
    const { component, registry } = await setup()
    const context = { hostType: 'project', hostId: data.projectId, viewKey: manifest.key, manifest }
    await registry.execute('workbench.content.status', { resourceId: 'resource-1', dirty: true }, context)
    expect(
      await registry.execute('workbench.content.status', { resourceId: 'other', dirty: false }, context)
    ).toMatchObject({ success: false })
    const event = { preventDefault: jest.fn(), returnValue: undefined }
    component.beforeUnload(event as unknown as BeforeUnloadEvent)
    expect(event.preventDefault).toHaveBeenCalled()
    const prepare = jest.fn().mockResolvedValueOnce(false)
    Object.defineProperty(component, 'frame', { value: () => ({ prepareEditorClose: prepare }) })
    await component.close()
    expect(close).not.toHaveBeenCalled()
    let acknowledge!: (value: boolean) => void
    prepare.mockReturnValueOnce(
      new Promise((resolve) => {
        acknowledge = resolve
      })
    )
    const pending = component.close()
    expect(component.closing()).toBe(true)
    expect(close).not.toHaveBeenCalled()
    acknowledge(true)
    await pending
    expect(close).toHaveBeenCalledTimes(1)
    expect(component.closing()).toBe(false)
  })

  it('shows an error instead of falling back when the resolved plugin is unavailable', async () => {
    getSlotViews.mockReturnValue(of([]))
    const { component } = await setup()
    expect(component.error()).toBe(true)
    expect(component.manifest()).toBeNull()
  })
})
