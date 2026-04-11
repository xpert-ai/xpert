import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { ZardAccordionComponent } from './accordion.component';
import { ZardAccordionImports } from './accordion.imports';
import { ZardAccordionItemComponent } from './accordion-item.component';

@Component({
  imports: [...ZardAccordionImports],
  template: `
    <z-accordion [multi]="multi" [togglePosition]="togglePosition">
      <z-accordion-item
        [expanded]="firstExpanded"
        [disabled]="firstDisabled"
        [hideToggle]="firstHideToggle"
        (opened)="openedPanels.push('first')"
      >
        <z-accordion-header>
          <z-accordion-title>First</z-accordion-title>
          <z-accordion-description>First description</z-accordion-description>
        </z-accordion-header>

        <ng-template zAccordionContent>
          <div class="first-lazy-content">Lazy content</div>
        </ng-template>
      </z-accordion-item>

      <z-accordion-item (opened)="openedPanels.push('second')">
        <z-accordion-header>
          <z-accordion-title>Second</z-accordion-title>
        </z-accordion-header>

        <div class="second-body">Second content</div>
      </z-accordion-item>
    </z-accordion>
  `,
})
class HostComponent {
  multi = false;
  togglePosition: 'before' | 'after' = 'after';
  firstExpanded = false;
  firstDisabled = false;
  firstHideToggle = false;
  openedPanels: string[] = [];
}

describe('ZardAccordionComponent', () => {
  async function createHost() {
    const fixture = await TestBed.configureTestingModule({
      imports: [HostComponent],
    }).createComponent(HostComponent);

    fixture.detectChanges();

    const accordion = fixture.debugElement.query(By.directive(ZardAccordionComponent))
      .componentInstance as ZardAccordionComponent;
    const items = fixture.debugElement
      .queryAll(By.directive(ZardAccordionItemComponent))
      .map(debugElement => debugElement.componentInstance as ZardAccordionItemComponent);

    return { fixture, accordion, items };
  }

  it('keeps only one panel open in single mode and allows multiple in multi mode', async () => {
    const { fixture, items } = await createHost();

    items[0].open();
    fixture.detectChanges();
    expect(items[0].expanded).toBe(true);
    expect(items[1].expanded).toBe(false);

    items[1].open();
    fixture.detectChanges();
    expect(items[0].expanded).toBe(false);
    expect(items[1].expanded).toBe(true);

    fixture.componentInstance.multi = true;
    fixture.detectChanges();

    items[0].open();
    fixture.detectChanges();
    expect(items[0].expanded).toBe(true);
    expect(items[1].expanded).toBe(true);
  });

  it('syncs external expanded input changes to item state', async () => {
    const { fixture, items } = await createHost();

    fixture.componentInstance.firstExpanded = true;
    fixture.detectChanges();
    expect(items[0].expanded).toBe(true);

    fixture.componentInstance.firstExpanded = false;
    fixture.detectChanges();
    expect(items[0].expanded).toBe(false);
  });

  it('blocks header toggles while disabled but still supports programmatic open and close', async () => {
    const { fixture, items } = await createHost();
    const firstHeader = fixture.nativeElement.querySelector('[data-slot="accordion-header"]') as HTMLElement;

    fixture.componentInstance.firstDisabled = true;
    fixture.detectChanges();

    firstHeader.click();
    fixture.detectChanges();
    expect(items[0].expanded).toBe(false);

    items[0].open();
    fixture.detectChanges();
    expect(items[0].expanded).toBe(true);

    items[0].close();
    fixture.detectChanges();
    expect(items[0].expanded).toBe(false);
  });

  it('supports hideToggle and before-positioned chevrons', async () => {
    const { fixture } = await createHost();

    fixture.componentInstance.togglePosition = 'before';
    fixture.componentInstance.firstHideToggle = true;
    fixture.detectChanges();

    const headers = fixture.nativeElement.querySelectorAll('[data-slot="accordion-header"]');
    const firstHeader = headers[0] as HTMLElement;
    const secondHeader = headers[1] as HTMLElement;

    expect(firstHeader.querySelectorAll('[data-slot="accordion-chevron"]').length).toBe(0);
    expect(secondHeader.firstElementChild?.tagName).toBe('Z-ICON');
  });

  it('emits opened and lazy-renders content only after the first expansion', async () => {
    const { fixture, items } = await createHost();

    expect(fixture.nativeElement.querySelector('.first-lazy-content')).toBeNull();

    items[0].open();
    fixture.detectChanges();

    expect(fixture.componentInstance.openedPanels).toEqual(['first']);
    expect(fixture.nativeElement.querySelector('.first-lazy-content')?.textContent?.trim()).toBe('Lazy content');

    items[0].close();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.first-lazy-content')).not.toBeNull();
  });
});
