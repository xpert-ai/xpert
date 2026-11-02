import { Component } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter, RouterPreloader, withPreloading } from '@angular/router'
import { RouterTestingHarness } from '@angular/router/testing'
import { environment } from '../../../environments/environment'
import { firstValueFrom, of } from 'rxjs'
import { SelectivePreloadingStrategy } from './selective-preloading-strategy'

@Component({ standalone: true, selector: 'xp-reading-stub', template: 'Reading' })
class ReadingStub {}
@Component({ standalone: true, selector: 'xp-graph-stub', template: 'Graph' })
class GraphStub {}

describe('Selective route preloading', () => {
  const production = environment.production
  afterEach(() => {
    environment.production = production
    TestBed.resetTestingModule()
  })

  it('only preloads opted-in routes in development and still loads other routes on navigation', async () => {
    environment.production = false
    const eager = jest.fn(async () => ReadingStub)
    const graph = jest.fn(async () => GraphStub)
    const ordinary = jest.fn(async () => ReadingStub)
    TestBed.configureTestingModule({
      providers: [
        provideRouter(
          [
            { path: '', component: ReadingStub },
            { path: 'ordinary', loadComponent: ordinary },
            { path: 'eager', data: { preload: true }, loadComponent: eager },
            { path: 'graph', data: { preload: false }, loadComponent: graph }
          ],
          withPreloading(SelectivePreloadingStrategy)
        )
      ]
    })
    const harness = await RouterTestingHarness.create('/')
    await firstValueFrom(TestBed.inject(RouterPreloader).preload())
    expect(ordinary).not.toHaveBeenCalled()
    expect(eager).toHaveBeenCalledTimes(1)
    expect(graph).not.toHaveBeenCalled()
    await harness.navigateByUrl('/graph', GraphStub)
    expect(graph).toHaveBeenCalledTimes(1)
    expect(harness.routeNativeElement?.textContent).toBe('Graph')
  })
  it('preserves production preloading with explicit opt-outs', async () => {
    environment.production = true
    const strategy = new SelectivePreloadingStrategy()
    const load = jest.fn(() => of('loaded'))
    expect(await firstValueFrom(strategy.preload({}, load))).toBe('loaded')
    expect(await firstValueFrom(strategy.preload({ data: { preload: false } }, load))).toBeNull()
    expect(load).toHaveBeenCalledTimes(1)
  })
})
