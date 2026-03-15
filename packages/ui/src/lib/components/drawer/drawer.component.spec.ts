import { Component, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { ZardDrawerComponent, ZardDrawerContainerComponent, ZardDrawerContentComponent } from '../../../public-api';

@Component({
  imports: [ZardDrawerContainerComponent, ZardDrawerComponent, ZardDrawerContentComponent],
  template: `
    <z-drawer-container [hasBackdrop]="hasBackdrop">
      <z-drawer
        #drawer
        [mode]="mode"
        [position]="position"
        [opened]="opened"
        (openedChange)="onOpenedChange($event)"
      >
        <div class="drawer-body">Drawer</div>
      </z-drawer>

      <z-drawer-content>
        <button type="button" class="content-toggle" (click)="drawer.toggle()">{{ drawer.opened ? 'open' : 'closed' }}</button>
      </z-drawer-content>
    </z-drawer-container>
  `,
})
class DrawerHostComponent {
  mode: 'side' | 'over' = 'side';
  position: 'start' | 'end' = 'start';
  opened = true;
  hasBackdrop = true;
  lastOpenedChange: boolean | null = null;

  readonly drawer = viewChild.required(ZardDrawerComponent);

  onOpenedChange(state: boolean) {
    this.lastOpenedChange = state;
    this.opened = state;
  }
}

describe('ZardDrawerComponent', () => {
  async function createHost() {
    const fixture = await TestBed.configureTestingModule({
      imports: [DrawerHostComponent],
    }).createComponent(DrawerHostComponent);

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    return fixture;
  }

  it('supports imperative open, close, and toggle APIs', async () => {
    const fixture = await createHost();
    const drawer = fixture.componentInstance.drawer();

    drawer.close();
    fixture.detectChanges();
    expect(drawer.opened).toBe(false);
    expect(fixture.componentInstance.lastOpenedChange).toBe(false);

    drawer.open();
    fixture.detectChanges();
    expect(drawer.opened).toBe(true);
    expect(fixture.componentInstance.lastOpenedChange).toBe(true);

    drawer.toggle();
    fixture.detectChanges();
    expect(drawer.opened).toBe(false);
  });

  it('updates slot state attributes for side and over modes', async () => {
    const fixture = await createHost();
    const drawerElement = fixture.nativeElement.querySelector('z-drawer') as HTMLElement;
    const containerElement = fixture.nativeElement.querySelector('z-drawer-container') as HTMLElement;

    expect(drawerElement.dataset['mode']).toBe('side');
    expect(drawerElement.dataset['position']).toBe('start');
    expect(drawerElement.dataset['state']).toBe('open');
    expect(containerElement.dataset['mode']).toBe('side');

    fixture.componentInstance.mode = 'over';
    fixture.componentInstance.position = 'end';
    fixture.detectChanges();

    expect(drawerElement.dataset['mode']).toBe('over');
    expect(drawerElement.dataset['position']).toBe('end');
    expect(containerElement.dataset['mode']).toBe('over');
    expect(containerElement.dataset['position']).toBe('end');
  });

  it('closes from the backdrop only when mode is over and backdrop is enabled', async () => {
    const fixture = await createHost();

    fixture.componentInstance.mode = 'over';
    fixture.componentInstance.opened = true;
    fixture.componentInstance.hasBackdrop = true;
    fixture.detectChanges();

    const backdrop = fixture.nativeElement.querySelector('[data-slot="drawer-backdrop"]') as HTMLDivElement;
    expect(backdrop).not.toBeNull();

    backdrop.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.drawer().opened).toBe(false);

    fixture.componentInstance.opened = true;
    fixture.componentInstance.hasBackdrop = false;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-slot="drawer-backdrop"]')).toBeNull();
  });

  it('allows templates to read drawer.opened and call drawer.toggle()', async () => {
    const fixture = await createHost();
    const toggleButton = fixture.nativeElement.querySelector('.content-toggle') as HTMLButtonElement;

    expect(toggleButton.textContent?.trim()).toBe('open');

    toggleButton.click();
    fixture.detectChanges();
    expect(toggleButton.textContent?.trim()).toBe('closed');
  });
});
