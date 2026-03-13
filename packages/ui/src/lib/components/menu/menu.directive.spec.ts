import { OverlayContainer } from '@angular/cdk/overlay';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { ZardMenuImports } from './menu.imports';
import { ZardMenuDirective } from './menu.directive';

@Component({
  standalone: true,
  imports: [...ZardMenuImports],
  template: `
    <button
      type="button"
      data-testid="root-trigger"
      z-menu
      [zMenuTriggerFor]="menu"
      [zMenuTriggerData]="{ label: itemLabel }"
    >
      Open
    </button>

    <ng-template #menu let-label="label">
      <div z-menu-content>
        <button type="button" z-menu-item data-testid="label-item">
          {{ label }}
        </button>
        <button type="button" z-menu-item z-menu [zMenuTriggerFor]="submenu" data-testid="submenu-trigger">
          More
        </button>
      </div>
    </ng-template>

    <ng-template #submenu>
      <div z-menu-content>
        <button type="button" z-menu-item data-testid="submenu-item">
          Nested Item
        </button>
      </div>
    </ng-template>
  `,
})
class HostComponent {
  itemLabel = 'Dynamic Item';
}

describe('ZardMenuDirective', () => {
  async function createHost() {
    const fixture = await TestBed.configureTestingModule({
      imports: [HostComponent],
    }).createComponent(HostComponent);

    fixture.detectChanges();

    const overlayContainer = TestBed.inject(OverlayContainer);
    const trigger = fixture.debugElement.query(By.directive(ZardMenuDirective))
      .injector.get(ZardMenuDirective);

    return {
      fixture,
      overlayContainer,
      trigger,
      triggerButton: fixture.nativeElement.querySelector('[data-testid="root-trigger"]') as HTMLButtonElement,
    };
  }

  it('exposes trigger data to the template context', async () => {
    const { fixture, overlayContainer, triggerButton } = await createHost();

    triggerButton.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(overlayContainer.getContainerElement().textContent).toContain('Dynamic Item');
  });

  it('reflects open and close state through the exported trigger API', async () => {
    const { fixture, trigger, triggerButton } = await createHost();

    expect(trigger.menuOpen).toBe(false);

    triggerButton.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(trigger.menuOpen).toBe(true);

    trigger.close();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(trigger.menuOpen).toBe(false);
  });

  it('opens nested submenu content from a z-menu-item trigger', async () => {
    const { fixture, overlayContainer, triggerButton } = await createHost();

    triggerButton.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const submenuTrigger = overlayContainer
      .getContainerElement()
      .querySelector('[data-testid="submenu-trigger"]') as HTMLButtonElement;

    submenuTrigger.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(overlayContainer.getContainerElement().textContent).toContain('Nested Item');
  });
});
