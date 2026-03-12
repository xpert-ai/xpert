import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { ZardBadgeComponent } from './badge.component';

@Component({
  imports: [ZardBadgeComponent],
  template: `<z-badge class="host-marker" zType="secondary">Queued</z-badge>`,
})
class PillBadgeHostComponent {}

@Component({
  imports: [ZardBadgeComponent],
  template: `
    <z-badge
      class="host-marker"
      [zCount]="count"
      [zHidden]="hidden"
      [zOverlap]="overlap"
      zCountClass="count-marker bg-destructive text-white"
    >
      <span class="content-marker">Alerts</span>
    </z-badge>
  `,
})
class AttachedBadgeHostComponent {
  count: string | number | null = 3;
  hidden = false;
  overlap = true;
}

describe('ZardBadgeComponent', () => {
  it('keeps the existing pill badge styling when zCount is not provided', async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [PillBadgeHostComponent],
    }).createComponent(PillBadgeHostComponent);

    fixture.detectChanges();

    const host = fixture.nativeElement.querySelector('z-badge') as HTMLElement;
    expect(host.className).toContain('host-marker');
    expect(host.className).toContain('bg-secondary');
    expect(host.className).toContain('rounded-md');
    expect(host.querySelector('.z-badge__count')).toBeNull();
    expect(host.textContent?.trim()).toBe('Queued');
  });

  it('renders an attached count badge when zCount is provided', async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [AttachedBadgeHostComponent],
    }).createComponent(AttachedBadgeHostComponent);

    fixture.detectChanges();

    const host = fixture.nativeElement.querySelector('z-badge') as HTMLElement;
    const count = fixture.nativeElement.querySelector('.z-badge__count') as HTMLElement;

    expect(host.className).toContain('host-marker');
    expect(host.className).toContain('relative');
    expect(host.className).toContain('inline-flex');
    expect(count).not.toBeNull();
    expect(count.textContent?.trim()).toBe('3');
    expect(count.className).toContain('count-marker');
    expect(count.className).toContain('translate-x-1/2');
  });

  it('hides the attached count badge when zHidden is true', async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [AttachedBadgeHostComponent],
    }).createComponent(AttachedBadgeHostComponent);

    fixture.componentInstance.hidden = true;
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.z-badge__count')).toBeNull();
  });

  it('moves the attached count badge outward when zOverlap is false', async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [AttachedBadgeHostComponent],
    }).createComponent(AttachedBadgeHostComponent);

    fixture.componentInstance.overlap = false;
    fixture.detectChanges();

    const count = fixture.nativeElement.querySelector('.z-badge__count') as HTMLElement;
    expect(count.className).toContain('translate-x-full');
    expect(count.className).not.toContain('translate-x-1/2');
  });
});
