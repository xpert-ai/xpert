import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import {
  ZardTableComponent,
  ZardTableImports,
  ZardTableSortHeaderComponent,
  ZardTableStickyEndDirective,
  ZardTableStickyStartDirective,
  type ZardTableSortDirection,
} from '../../../public-api';

@Component({
  imports: [...ZardTableImports],
  template: `
    <table z-table class="host-table">
      <thead z-table-header>
        <tr z-table-row>
          <th z-table-head zTableStickyStart="12">
            <button
              z-table-sort-header
              [zDirection]="direction"
              [zDisableClear]="disableClear"
              (zSortChange)="onSortChange($event)"
            >
              Name
            </button>
          </th>
          <th z-table-head zTableStickyEnd="2rem">
            Actions
          </th>
        </tr>
      </thead>
      <tbody z-table-body>
        <tr z-table-row>
          <td z-table-cell zTableStickyStart>Alpha</td>
          <td z-table-cell zTableStickyEnd="24">View</td>
        </tr>
      </tbody>
    </table>
  `,
})
class TableHostComponent {
  direction: ZardTableSortDirection = '';
  disableClear = false;
  changedDirection: ZardTableSortDirection | null = null;

  onSortChange(direction: ZardTableSortDirection) {
    this.changedDirection = direction;
    this.direction = direction;
  }
}

describe('table public API', () => {
  it('exports the table primitives and helpers through the public API', () => {
    expect(ZardTableComponent).toBeDefined();
    expect(ZardTableSortHeaderComponent).toBeDefined();
    expect(ZardTableStickyStartDirective).toBeDefined();
    expect(ZardTableStickyEndDirective).toBeDefined();
    expect(ZardTableImports).toContain(ZardTableSortHeaderComponent);
    expect(ZardTableImports).toContain(ZardTableStickyStartDirective);
    expect(ZardTableImports).toContain(ZardTableStickyEndDirective);
  });

  it('renders sticky offsets and emits controlled sort changes', async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [TableHostComponent],
    }).createComponent(TableHostComponent);

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const stickyStart = fixture.nativeElement.querySelector('th[data-sticky-start]') as HTMLElement;
    const stickyEnd = fixture.nativeElement.querySelector('th[data-sticky-end]') as HTMLElement;
    const sortButton = fixture.nativeElement.querySelector('button[z-table-sort-header]') as HTMLButtonElement;

    expect(stickyStart.style.left).toBe('12px');
    expect(stickyEnd.style.right).toBe('2rem');

    sortButton.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.changedDirection).toBe('asc');

    sortButton.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.changedDirection).toBe('desc');

    sortButton.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.changedDirection).toBe('');
  });

  it('cycles without clearing when zDisableClear is enabled', async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [TableHostComponent],
    }).createComponent(TableHostComponent);

    fixture.componentInstance.disableClear = true;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const sortButton = fixture.nativeElement.querySelector('button[z-table-sort-header]') as HTMLButtonElement;

    sortButton.click();
    sortButton.click();
    sortButton.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.changedDirection).toBe('asc');
  });

  it('uses registered icons for each sort direction', async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [TableHostComponent],
    }).createComponent(TableHostComponent);

    fixture.componentInstance.direction = 'desc';
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const sortHeaderDebugElement = fixture.debugElement.query(By.directive(ZardTableSortHeaderComponent));
    const sortHeader = sortHeaderDebugElement.componentInstance as ZardTableSortHeaderComponent;
    const iconName = Reflect.get(sortHeader, 'iconName') as () => string;

    expect(iconName()).toBe('chevron-down');
  });
}
