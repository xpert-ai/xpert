import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { ZardProgressBarComponent } from './progress-bar.component';

@Component({
  imports: [ZardProgressBarComponent],
  template: `
    <z-progress-bar
      [progress]="progress"
      [zIndeterminate]="zIndeterminate"
      [zSize]="zSize"
      zShape="square"
    />
  `,
})
class HostComponent {
  progress = 0;
  zIndeterminate = false;
  zSize: 'default' | 'sm' = 'default';
}

describe('ZardProgressBarComponent', () => {
  async function createHost() {
    const fixture = await TestBed.configureTestingModule({
      imports: [HostComponent],
    }).createComponent(HostComponent);

    fixture.detectChanges();

    const host = fixture.nativeElement.querySelector('z-progress-bar') as HTMLElement;
    const container = host.firstElementChild as HTMLDivElement;
    const bar = container.firstElementChild as HTMLDivElement;

    return { fixture, host, container, bar };
  }

  it('clamps progress between 0 and 100', async () => {
    const { fixture, bar } = await createHost();

    fixture.componentInstance.progress = 120;
    fixture.detectChanges();
    expect(bar.style.width).toBe('100%');

    fixture.componentInstance.progress = -10;
    fixture.detectChanges();
    expect(bar.style.width).toBe('0%');
  });

  it('renders the indeterminate state', async () => {
    const { fixture, host } = await createHost();

    fixture.componentInstance.zIndeterminate = true;
    fixture.detectChanges();

    const container = host.firstElementChild as HTMLDivElement;
    const bar = container.firstElementChild as HTMLDivElement;

    expect(container.className).toContain('relative');
    expect(bar.className).toContain('animate-[indeterminate_1.5s_infinite_ease-out]');
  });

  it('uses Material-sized default and small height variants', async () => {
    const { fixture, container } = await createHost();

    expect(container.className).toContain('h-1');

    fixture.componentInstance.zSize = 'sm';
    fixture.detectChanges();

    expect(container.className).toContain('h-[2px]');
  });
});
