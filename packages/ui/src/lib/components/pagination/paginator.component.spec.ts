import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { ZardPaginatorComponent, type ZardPageEvent } from './paginator.component';

@Component({
  imports: [ZardPaginatorComponent],
  template: `
    <z-paginator
      [length]="length"
      [pageIndex]="pageIndex"
      [pageSize]="pageSize"
      [pageSizeOptions]="pageSizeOptions"
      [showFirstLastButtons]="showFirstLastButtons"
      (page)="events.push($event)"
    />
  `,
})
class HostComponent {
  length = 0;
  pageIndex = 0;
  pageSize = 0;
  pageSizeOptions = [20, 50, 100];
  showFirstLastButtons = true;
  events: ZardPageEvent[] = [];
}

describe('ZardPaginatorComponent', () => {
  async function createHost() {
    const fixture = await TestBed.configureTestingModule({
      imports: [HostComponent],
    }).createComponent(HostComponent);

    fixture.detectChanges();

    const paginator = fixture.debugElement.query(By.directive(ZardPaginatorComponent))
      .componentInstance as ZardPaginatorComponent;

    return { fixture, paginator };
  }

  it('initializes page size like Material when pageSize is unset', async () => {
    const { paginator } = await createHost();

    expect(paginator.pageSize).toBe(20);
    expect(paginator.pageSizeOptions).toEqual([20, 50, 100]);
  });

  it('emits zero-based page events for navigation and page-size changes', async () => {
    const { fixture, paginator } = await createHost();

    paginator.length = 240;
    paginator.nextPage();
    paginator.lastPage();
    paginator.previousPage();
    paginator.firstPage();
    paginator.nextPage();
    paginator.changePageSize(50);
    fixture.detectChanges();

    expect(fixture.componentInstance.events).toEqual([
      { previousPageIndex: 0, pageIndex: 1, pageSize: 20, length: 240 },
      { previousPageIndex: 1, pageIndex: 11, pageSize: 20, length: 240 },
      { previousPageIndex: 11, pageIndex: 10, pageSize: 20, length: 240 },
      { previousPageIndex: 10, pageIndex: 0, pageSize: 20, length: 240 },
      { previousPageIndex: 0, pageIndex: 1, pageSize: 20, length: 240 },
      { previousPageIndex: 1, pageIndex: 0, pageSize: 50, length: 240 },
    ]);
  });

  it('updates the range label when length, pageIndex, and pageSize change externally', async () => {
    const { fixture, paginator } = await createHost();

    paginator.length = 100;
    paginator.pageSize = 10;
    paginator.pageIndex = 0;
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-slot="paginator-range-label"]')?.textContent?.trim(),
    ).toBe('1 – 10 of 100');

    paginator.pageIndex = 4;
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-slot="paginator-range-label"]')?.textContent?.trim(),
    ).toBe('41 – 50 of 100');

    paginator.length = 45;
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-slot="paginator-range-label"]')?.textContent?.trim(),
    ).toBe('41 – 45 of 45');
  });

  it('disables first and previous at the first page, then next and last at the last page', async () => {
    const { fixture, paginator } = await createHost();

    paginator.length = 100;
    paginator.pageSize = 10;
    paginator.pageIndex = 0;
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-slot="paginator-first-button"]')?.getAttribute('disabled'),
    ).toBe('');
    expect(
      fixture.nativeElement.querySelector('[data-slot="paginator-previous-button"]')?.getAttribute('disabled'),
    ).toBe('');
    expect(
      fixture.nativeElement.querySelector('[data-slot="paginator-next-button"]')?.hasAttribute('disabled'),
    ).toBe(false);
    expect(
      fixture.nativeElement.querySelector('[data-slot="paginator-last-button"]')?.hasAttribute('disabled'),
    ).toBe(false);

    paginator.pageIndex = 9;
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-slot="paginator-next-button"]')?.getAttribute('disabled'),
    ).toBe('');
    expect(
      fixture.nativeElement.querySelector('[data-slot="paginator-last-button"]')?.getAttribute('disabled'),
    ).toBe('');
  });
});
