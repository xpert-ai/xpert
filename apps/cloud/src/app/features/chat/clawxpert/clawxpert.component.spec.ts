jest.mock('./clawxpert.facade', () => ({
  ClawXpertFacade: class ClawXpertFacade {}
}))

jest.mock('./clawxpert-setup-wizard.component', () => {
  const { Component } = jest.requireActual('@angular/core')

  @Component({
    standalone: true,
    selector: 'pac-clawxpert-setup-wizard',
    template: ''
  })
  class ClawXpertSetupWizardComponent {}

  return {
    ClawXpertSetupWizardComponent
  }
})

jest.mock('../../../@core', () => ({
  Store: class Store {},
  XpertAPIService: class XpertAPIService {},
  XpertTypeEnum: {
    Agent: 'agent'
  }
}))

import { Dialog } from '@angular/cdk/dialog'
import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { By } from '@angular/platform-browser'
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router'
import { of } from 'rxjs'
import { Store, XpertAPIService } from '../../../@core'
import { ClawXpertComponent } from './clawxpert.component'
import { ClawXpertFacade } from './clawxpert.facade'
import { ClawXpertSetupWizardComponent } from './clawxpert-setup-wizard.component'

function createFacadeMock(viewState: 'organization-required' | 'wizard' | 'ready' | 'error' = 'ready') {
  return {
    viewState: signal(viewState)
  }
}

describe('ClawXpertComponent', () => {
  async function setup(
    viewState: 'organization-required' | 'wizard' | 'ready' | 'error' = 'ready',
    options?: { onboarding?: string; xpertCount?: number; userId?: string }
  ) {
    const dialogRef = {
      closed: of(undefined)
    }
    const dialog = {
      open: jest.fn(() => dialogRef)
    }
    const facade = createFacadeMock(viewState)
    const route = {
      queryParamMap: of(convertToParamMap(options?.onboarding ? { onboarding: options.onboarding } : {}))
    }
    const router = {
      navigate: jest.fn().mockResolvedValue(true)
    }
    const xpertService = {
      getMyAll: jest.fn(() =>
        of({
          items: [],
          total: options?.xpertCount ?? 0
        })
      )
    }
    const store = {
      userId: options?.userId ?? 'user-1'
    }

    TestBed.resetTestingModule()
    await TestBed.configureTestingModule({
      imports: [ClawXpertComponent],
      providers: [
        provideRouter([]),
        {
          provide: ClawXpertFacade,
          useValue: facade
        },
        {
          provide: Dialog,
          useValue: dialog
        },
        {
          provide: ActivatedRoute,
          useValue: route
        },
        {
          provide: Router,
          useValue: router
        },
        {
          provide: XpertAPIService,
          useValue: xpertService
        },
        {
          provide: Store,
          useValue: store
        }
      ]
    }).compileComponents()

    const fixture = TestBed.createComponent(ClawXpertComponent)
    fixture.detectChanges()

    return {
      dialog,
      facade,
      fixture,
      router,
      store,
      xpertService
    }
  }

  afterEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('renders the router outlet shell for nested ClawXpert pages', async () => {
    const { fixture } = await setup()

    expect(fixture.debugElement.query(By.css('router-outlet'))).not.toBeNull()
  })

  it('does not open the entry onboarding dialog just because setup is required', async () => {
    const { dialog } = await setup('wizard')

    expect(dialog.open).not.toHaveBeenCalled()
  })

  it('opens the onboarding dialog when the entry guide routes with the ClawXpert onboarding flag', async () => {
    const { dialog, fixture, router } = await setup('ready', { onboarding: 'clawxpert' })
    await Promise.resolve()
    fixture.detectChanges()

    expect(dialog.open).toHaveBeenCalledWith(
      ClawXpertSetupWizardComponent,
      expect.objectContaining({
        disableClose: true,
        injector: expect.anything()
      })
    )
    expect(router.navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({
        queryParams: {
          onboarding: null
        },
        queryParamsHandling: 'merge',
        replaceUrl: true
      })
    )
  })

  it('checks entry onboarding creation eligibility against the current user self-created xperts', async () => {
    const { fixture, xpertService } = await setup('ready', { onboarding: 'clawxpert', userId: 'user-42' })
    await Promise.resolve()
    fixture.detectChanges()

    expect(xpertService.getMyAll).toHaveBeenCalledWith({
      where: {
        createdById: 'user-42',
        type: 'agent',
        latest: true
      },
      take: 1
    })
  })

  it('does not open the onboarding dialog from the route when the current user already has a self-created xpert', async () => {
    const { dialog, fixture, router, xpertService } = await setup('ready', { onboarding: 'clawxpert', xpertCount: 1 })
    await Promise.resolve()
    fixture.detectChanges()

    expect(xpertService.getMyAll).toHaveBeenCalled()
    expect(dialog.open).not.toHaveBeenCalled()
    expect(router.navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({
        queryParams: {
          onboarding: null
        },
        queryParamsHandling: 'merge',
        replaceUrl: true
      })
    )
  })
})
