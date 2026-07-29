import { ComponentFixture, TestBed } from '@angular/core/testing'
import { DataSourceService } from '@cloud/app/@core/state'
import { TranslateService } from '@ngx-translate/core'
import { IDataSource } from '@xpert-ai/contracts'
import { of } from 'rxjs'
import { ZardAlertDialogService, ZardDialogService } from '@xpert-ai/headless-ui'
import { XpDataSourcesComponent } from './data-sources.component'
import { XpDataSourceCreationComponent } from './creation/creation.component'
import { XpDataSourceEditComponent } from './edit/edit.component'

describe('XpDataSourcesComponent', () => {
  const dataSource = {
    id: 'data-source-1',
    name: 'Main source',
    type: {
      type: 'postgres'
    }
  } as IDataSource

  let fixture: ComponentFixture<XpDataSourcesComponent>
  let component: XpDataSourcesComponent
  let getAll: jest.Mock
  let open: jest.Mock

  beforeEach(async () => {
    getAll = jest.fn(() => of([dataSource]))
    open = jest.fn(() => ({ closed: of(true) }))

    await TestBed.configureTestingModule({
      imports: [XpDataSourcesComponent],
      providers: [
        {
          provide: DataSourceService,
          useValue: {
            getAll,
            delete: jest.fn(() => of(null))
          }
        },
        {
          provide: ZardDialogService,
          useValue: {
            open
          }
        },
        {
          provide: ZardAlertDialogService,
          useValue: {
            confirm: jest.fn(() => of(false))
          }
        },
        {
          provide: TranslateService,
          useValue: {
            currentLang: 'en',
            onLangChange: of({ lang: 'en' }),
            instant: jest.fn((_key: string, params?: { Default?: string }) => params?.Default ?? _key)
          }
        }
      ]
    })
      .overrideComponent(XpDataSourcesComponent, {
        set: {
          template: ''
        }
      })
      .compileComponents()

    fixture = TestBed.createComponent(XpDataSourcesComponent)
    component = fixture.componentInstance
    fixture.detectChanges()
  })

  it('opens the creation dialog and refreshes after create succeeds', () => {
    const callsBeforeCreate = getAll.mock.calls.length

    component.create()

    expect(open).toHaveBeenCalledWith(
      XpDataSourceCreationComponent,
      expect.objectContaining({
        backdropClass: 'xp-overlay-share-sheet',
        panelClass: ['xp-overlay-pane-share-sheet', '!p-0'],
        width: 'min(780px, calc(100vw - 48px))',
        maxWidth: 'calc(100vw - 48px)'
      })
    )
    expect(getAll).toHaveBeenCalledTimes(callsBeforeCreate + 1)
  })

  it('opens the edit dialog with the selected data source id and refreshes after save succeeds', () => {
    const callsBeforeEdit = getAll.mock.calls.length

    component.edit(dataSource)

    expect(open).toHaveBeenCalledWith(
      XpDataSourceEditComponent,
      expect.objectContaining({
        data: {
          id: dataSource.id
        },
        backdropClass: 'xp-overlay-share-sheet',
        panelClass: ['xp-overlay-pane-share-sheet', '!p-0'],
        width: 'min(560px, calc(100vw - 48px))',
        maxWidth: 'calc(100vw - 48px)'
      })
    )
    expect(getAll).toHaveBeenCalledTimes(callsBeforeEdit + 1)
  })

  it('opens the creation dialog with source data when copying and refreshes after create succeeds', () => {
    const callsBeforeCopy = getAll.mock.calls.length

    component.copy(dataSource)

    expect(open).toHaveBeenCalledWith(
      XpDataSourceCreationComponent,
      expect.objectContaining({
        data: dataSource,
        backdropClass: 'xp-overlay-share-sheet',
        panelClass: ['xp-overlay-pane-share-sheet', '!p-0'],
        width: 'min(780px, calc(100vw - 48px))',
        maxWidth: 'calc(100vw - 48px)'
      })
    )
    expect(getAll).toHaveBeenCalledTimes(callsBeforeCopy + 1)
  })
})
