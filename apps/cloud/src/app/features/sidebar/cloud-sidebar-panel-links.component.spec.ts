import { Location } from '@angular/common'
import { provideLocationMocks } from '@angular/common/testing'
import { Component } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { NavigationEnd, provideRouter, Router } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { filter, firstValueFrom } from 'rxjs'
import { modulePanelLinks } from './cloud-sidebar-module-navigation'
import { CloudSidebarPanelLinksComponent } from './cloud-sidebar-panel-links.component'

@Component({ standalone: true, template: '' })
class Page {}

describe('panel route selection alongside existing page tabs', () => {
  it('uses the default plugin tab on direct entry, and follows tab query changes and browser history', async () => {
    TestBed.configureTestingModule({
      imports: [CloudSidebarPanelLinksComponent, TranslateModule.forRoot()],
      providers: [provideLocationMocks(), provideRouter([{ path: 'plugins', component: Page }])]
    })
    const router = TestBed.inject(Router)
    router.setUpLocationChangeListener()
    const fixture = TestBed.createComponent(CloudSidebarPanelLinksComponent)
    fixture.componentRef.setInput(
      'items',
      modulePanelLinks('plugins', { resourceAdmin: true, monitoring: false, usage: false })
    )
    const settle = async () => {
      fixture.detectChanges()
      await fixture.whenStable()
      fixture.detectChanges()
    }
    const active = () => fixture.nativeElement.querySelector('[aria-current="page"]')?.textContent.trim()
    await router.navigateByUrl('/plugins?source=bookmark#content')
    await settle()
    expect(active()).toBe('XP.Plugin.Installed')
    // The existing page tabs update category with merged query parameters.
    await router.navigate([], { queryParams: { category: 'marketplace' }, queryParamsHandling: 'merge' })
    await settle()
    expect(active()).toBe('XP.Plugin.ExploreMarketplace')
    fixture.nativeElement.querySelector('a[href="/plugins?category=agent-plugins"]').click()
    await settle()
    expect(router.parseUrl(router.url).queryParamMap.get('category')).toBe('agent-plugins')
    expect(active()).toBe('XP.AgentPlugins.PageTitle')
    const back = firstValueFrom(router.events.pipe(filter((event) => event instanceof NavigationEnd)))
    TestBed.inject(Location).back()
    await back
    await settle()
    expect(active()).toBe('XP.Plugin.ExploreMarketplace')
    expect(router.parseUrl(router.url).queryParamMap.get('source')).toBe('bookmark')
    const forward = firstValueFrom(router.events.pipe(filter((event) => event instanceof NavigationEnd)))
    TestBed.inject(Location).forward()
    await forward
    await settle()
    expect(active()).toBe('XP.AgentPlugins.PageTitle')
    fixture.destroy()
  })
})
