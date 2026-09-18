import { TestBed } from '@angular/core/testing'
import { createEnvironmentInjector, EnvironmentInjector, runInInjectionContext } from '@angular/core'
import { PermissionsEnum } from '@xpert-ai/contracts'
import { ZardDialogService } from '@xpert-ai/headless-ui'
import { Subject } from 'rxjs'
import { Store } from '../../@core/state/store.service'
import {
  ViewClientCommandContext,
  ViewClientCommandRegistry
} from '../../@shared/view-extension/view-client-command-registry.service'
import { injectDataSourceCreateCommand } from './data-source-create.runtime'
import { XpDataSourceCreationComponent } from '../setting/data-sources/creation/creation.component'

jest.mock('../setting/data-sources/creation/creation.component', () => ({ XpDataSourceCreationComponent: class {} }))

const context: ViewClientCommandContext = {
  hostType: 'agent',
  hostId: 'assistant-1',
  viewKey: 'data-workbench',
  manifest: {
    key: 'data-workbench',
    title: { en_US: 'Data Workbench' },
    hostType: 'agent',
    slot: 'workbench.fixed',
    source: { provider: 'data-workbench', plugin: 'example-data-plugin' },
    view: {
      type: 'remote_component',
      runtime: 'react',
      protocolVersion: 1,
      component: { isolation: 'iframe', entry: 'main' }
    },
    dataSource: { mode: 'platform' }
  }
}

describe('Platform data source dialog integration', () => {
  it('opens the existing platform creation dialog once and returns its saved id', async () => {
    const closed = new Subject<{ id: string } | undefined>()
    const open = jest.fn(() => ({ closed, close: () => closed.next(undefined) }))
    const hasPermission = jest.fn(() => true)
    TestBed.configureTestingModule({
      providers: [
        { provide: Store, useValue: { hasPermission } },
        { provide: ZardDialogService, useValue: { open } }
      ]
    })
    const host = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector))
    runInInjectionContext(host, injectDataSourceCreateCommand)
    const registry = TestBed.inject(ViewClientCommandRegistry)
    const first = registry.execute('platform.data-source.create', {}, context)
    const second = registry.execute('platform.data-source.create', {}, context)
    await Promise.resolve()
    await Promise.resolve()
    expect(open).toHaveBeenCalledTimes(1)
    expect(open).toHaveBeenCalledWith(
      XpDataSourceCreationComponent,
      expect.objectContaining({ width: 'min(780px, calc(100vw - 48px))' })
    )
    expect(hasPermission).toHaveBeenCalledWith(PermissionsEnum.DATA_SOURCE_EDIT)
    closed.next({ id: 'created-source' })
    await expect(first).resolves.toEqual({ success: true, status: 'created', dataSourceId: 'created-source' })
    await expect(second).resolves.toEqual({ success: true, status: 'created', dataSourceId: 'created-source' })
    host.destroy()
    expect(await registry.execute('platform.data-source.create', {}, context)).toMatchObject({ code: 'unsupported' })
  })
})
