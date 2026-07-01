import { Component, ElementRef, TemplateRef, ViewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { ZardHighlightComponent } from './highlight.component';
import { ZardHighlightImports } from './highlight.imports';
import type { ZardHighlightStep } from './highlight.types';

@Component({
  imports: [ZardHighlightComponent],
  template: `<z-highlight [zOpen]="false" [zSteps]="steps" />`,
})
class ClosedHighlightHostComponent {
  steps: ZardHighlightStep[] = [
    {
      title: 'Hidden step',
      description: 'This step should not render while closed.',
    },
  ];
}

@Component({
  imports: [ZardHighlightComponent],
  template: `
    <z-highlight
      [zOpen]="open"
      [zCurrent]="current"
      [zSteps]="steps"
      [zMask]="mask"
      [zDisabledInteraction]="disabledInteraction"
      zPlacement="bottom"
      zNextText="Next"
      zPrevText="Previous"
      zFinishText="Done"
      zCloseText="Close"
      (zOpenChange)="openChangeCount = openChangeCount + 1; open = $event"
      (zCurrentChange)="current = $event; currentChanges.push($event)"
      (zChange)="changedTo = $event"
      (zClose)="closeCount = closeCount + 1"
      (zFinish)="finishCount = finishCount + 1"
    />
  `,
})
class BasicHighlightHostComponent {
  open = true;
  current = 0;
  mask = true;
  disabledInteraction = false;
  openChangeCount = 0;
  closeCount = 0;
  finishCount = 0;
  changedTo = -1;
  currentChanges: number[] = [];
  steps: ZardHighlightStep[] = [
    {
      title: 'First step',
      description: 'Describe the first highlighted target.',
    },
    {
      title: 'Second step',
      description: 'Describe the final step.',
      placement: 'center',
      mask: false,
      gap: { offset: 12, radius: 8 },
      type: 'primary',
    },
  ];
}

@Component({
  imports: [ZardHighlightComponent],
  template: `
    <button #targetButton type="button">Target</button>

    <z-highlight
      [zOpen]="true"
      [zCurrent]="0"
      [zSteps]="steps"
      [zGap]="{ offset: [10, 6], radius: 4 }"
      [zDisabledInteraction]="disabledInteraction"
    />
  `,
})
class TargetHighlightHostComponent {
  @ViewChild('targetButton', { read: ElementRef })
  targetButton?: ElementRef<HTMLButtonElement>;

  steps: ZardHighlightStep[] = [
    {
      target: () => this.targetButton,
      title: 'Targeted step',
      description: 'The target should be measured from its DOM rect.',
      placement: 'right',
    },
  ];

  disabledInteraction = false;
}

@Component({
  imports: [ZardHighlightComponent],
  template: `
    <div #scrollContainer class="scroll-container">
      <button #targetButton type="button">Nested Target</button>
    </div>

    <z-highlight [zOpen]="true" [zSteps]="steps" [zGap]="{ offset: 0, radius: 2 }" />
  `,
})
class NestedScrollHighlightHostComponent {
  @ViewChild('scrollContainer', { read: ElementRef })
  scrollContainer?: ElementRef<HTMLElement>;

  @ViewChild('targetButton', { read: ElementRef })
  targetButton?: ElementRef<HTMLButtonElement>;

  targetTop = 80;

  steps: ZardHighlightStep[] = [
    {
      target: () => this.targetButton,
      title: 'Nested target',
      description: 'The target moves when an inner scroll container scrolls.',
    },
  ];
}

@Component({
  imports: [ZardHighlightComponent],
  template: `
    <button #firstTarget type="button">First Target</button>
    <button #secondTarget type="button">Second Target</button>

    <z-highlight
      [zOpen]="true"
      [zCurrent]="current"
      [zSteps]="steps"
      zNextText="Next"
      (zCurrentChange)="current = $event"
    />
  `,
})
class StepTargetScrollHighlightHostComponent {
  @ViewChild('firstTarget', { read: ElementRef })
  firstTarget?: ElementRef<HTMLButtonElement>;

  @ViewChild('secondTarget', { read: ElementRef })
  secondTarget?: ElementRef<HTMLButtonElement>;

  current = 0;
  steps: ZardHighlightStep[] = [
    {
      target: () => this.firstTarget,
      title: 'First target',
      description: 'The first target is visible.',
    },
    {
      target: () => this.secondTarget,
      title: 'Second target',
      description: 'The second target may need scrolling.',
    },
  ];
}

@Component({
  imports: [ZardHighlightComponent],
  template: `
    <ng-template #actions let-current="current" let-total="total" let-next="next" let-close="close">
      <button class="custom-next" type="button" (click)="next()">Custom next {{ current + 1 }}/{{ total }}</button>
      <button class="custom-close" type="button" (click)="close()">Custom close</button>
    </ng-template>

    <ng-template #indicator let-current="current" let-total="total"> Step {{ current + 1 }} of {{ total }} </ng-template>

    <z-highlight
      [zOpen]="open"
      [zSteps]="steps"
      [zActions]="actions"
      [zIndicator]="indicator"
      (zOpenChange)="open = $event"
      (zCurrentChange)="current = $event"
    />
  `,
})
class CustomTemplateHighlightHostComponent {
  @ViewChild('actions', { read: TemplateRef })
  actions?: TemplateRef<unknown>;

  @ViewChild('indicator', { read: TemplateRef })
  indicator?: TemplateRef<unknown>;

  open = true;
  current = 0;
  steps: ZardHighlightStep[] = [
    {
      title: 'Custom templates',
      description: 'Default actions and indicator should be replaceable.',
    },
    {
      title: 'Second custom template step',
      description: 'Custom next should advance to this step.',
    },
  ];
}

@Component({
  imports: [...ZardHighlightImports],
  template: `<z-highlight [zOpen]="true" [zSteps]="steps" />`,
})
class ImportsHighlightHostComponent {
  steps: ZardHighlightStep[] = [{ title: 'Imported', description: 'Imported from ZardHighlightImports.' }];
}

describe('ZardHighlightComponent', () => {
  it('does not render the overlay while closed', async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [ClosedHighlightHostComponent],
    }).createComponent(ClosedHighlightHostComponent);

    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-slot="highlight-overlay"]')).toBeNull();
  });

  it('renders the current step title and description without a target in centered mode', async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [BasicHighlightHostComponent],
    }).createComponent(BasicHighlightHostComponent);

    fixture.detectChanges();

    const card = fixture.nativeElement.querySelector('[data-slot="highlight-card"]') as HTMLElement;
    const title = fixture.nativeElement.querySelector('[data-slot="highlight-title"]') as HTMLElement;
    const description = fixture.nativeElement.querySelector('[data-slot="highlight-description"]') as HTMLElement;

    expect(card).not.toBeNull();
    expect(card.className).toContain('highlight-card--center');
    expect(title.textContent?.trim()).toBe('First step');
    expect(description.textContent?.trim()).toBe('Describe the first highlighted target.');
    expect(fixture.nativeElement.querySelector('[data-slot="highlight-target"]')).toBeNull();
  });

  it('emits current changes, finish and close events from default actions', async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [BasicHighlightHostComponent],
    }).createComponent(BasicHighlightHostComponent);

    fixture.detectChanges();

    const next = fixture.nativeElement.querySelector('[data-slot="highlight-next"]') as HTMLButtonElement;
    next.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.current).toBe(1);
    expect(fixture.componentInstance.currentChanges).toEqual([1]);
    expect(fixture.componentInstance.changedTo).toBe(1);

    const finish = fixture.nativeElement.querySelector('[data-slot="highlight-finish"]') as HTMLButtonElement;
    finish.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.finishCount).toBe(1);
    expect(fixture.componentInstance.open).toBe(false);
    expect(fixture.componentInstance.openChangeCount).toBe(1);

    fixture.componentInstance.open = true;
    fixture.componentInstance.current = 0;
    fixture.detectChanges();

    const close = fixture.nativeElement.querySelector('[data-slot="highlight-close"]') as HTMLButtonElement;
    close.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.closeCount).toBe(1);
    expect(fixture.componentInstance.open).toBe(false);
  });

  it('uses step-level mask, placement, gap and type overrides', async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [BasicHighlightHostComponent],
    }).createComponent(BasicHighlightHostComponent);

    fixture.componentInstance.current = 1;
    fixture.detectChanges();

    const card = fixture.nativeElement.querySelector('[data-slot="highlight-card"]') as HTMLElement;

    expect(fixture.nativeElement.querySelector('[data-slot="highlight-mask"]')).toBeNull();
    expect(card.className).toContain('highlight-card--center');
    expect(card.className).toContain('highlight-card--primary');
  });

  it('measures target rect and applies configured gap', async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [TargetHighlightHostComponent],
    }).createComponent(TargetHighlightHostComponent);

    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    jest.spyOn(button, 'getBoundingClientRect').mockReturnValue({
      x: 100,
      y: 60,
      width: 120,
      height: 40,
      top: 60,
      right: 220,
      bottom: 100,
      left: 100,
      toJSON: () => undefined,
    });

    window.dispatchEvent(new Event('resize'));
    fixture.detectChanges();

    const target = fixture.nativeElement.querySelector('[data-slot="highlight-target"]') as HTMLElement;
    const card = fixture.nativeElement.querySelector('[data-slot="highlight-card"]') as HTMLElement;

    expect(target).not.toBeNull();
    expect(target.style.left).toBe('90px');
    expect(target.style.top).toBe('54px');
    expect(target.style.width).toBe('140px');
    expect(target.style.height).toBe('52px');
    expect(target.style.borderRadius).toBe('4px');
    expect(card.className).toContain('highlight-card--right');
  });

  it('adds a target blocker when target interaction is disabled', async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [TargetHighlightHostComponent],
    }).createComponent(TargetHighlightHostComponent);

    fixture.componentInstance.disabledInteraction = true;
    fixture.detectChanges();
    window.dispatchEvent(new Event('resize'));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-slot="highlight-target-blocker"]')).not.toBeNull();
  });

  it('refreshes the target rect when an inner scroll container scrolls', async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [NestedScrollHighlightHostComponent],
    }).createComponent(NestedScrollHighlightHostComponent);

    fixture.detectChanges();
    await fixture.whenStable();

    const button = fixture.componentInstance.targetButton!.nativeElement;
    jest.spyOn(button, 'getBoundingClientRect').mockImplementation(() => ({
      x: 40,
      y: fixture.componentInstance.targetTop,
      width: 120,
      height: 40,
      top: fixture.componentInstance.targetTop,
      right: 160,
      bottom: fixture.componentInstance.targetTop + 40,
      left: 40,
      toJSON: () => undefined,
    }));

    window.dispatchEvent(new Event('resize'));
    fixture.detectChanges();

    const target = fixture.nativeElement.querySelector('[data-slot="highlight-target"]') as HTMLElement;
    expect(target.style.top).toBe('80px');

    fixture.componentInstance.targetTop = 160;
    fixture.componentInstance.scrollContainer!.nativeElement.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();

    expect(target.style.top).toBe('160px');
  });

  it('scrolls the current target into view when the step changes', async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [StepTargetScrollHighlightHostComponent],
    }).createComponent(StepTargetScrollHighlightHostComponent);

    fixture.detectChanges();

    const firstScrollIntoView = jest.fn();
    const secondScrollIntoView = jest.fn();
    fixture.componentInstance.firstTarget!.nativeElement.scrollIntoView = firstScrollIntoView;
    fixture.componentInstance.secondTarget!.nativeElement.scrollIntoView = secondScrollIntoView;

    const next = fixture.nativeElement.querySelector('[data-slot="highlight-next"]') as HTMLButtonElement;
    next.click();
    fixture.detectChanges();
    await waitForAnimationFrame();

    expect(secondScrollIntoView).toHaveBeenCalledWith({
      behavior: 'auto',
      block: 'center',
      inline: 'nearest',
    });
    expect(firstScrollIntoView).not.toHaveBeenCalled();
  });

  it('replaces default actions and indicator with templates', async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [CustomTemplateHighlightHostComponent],
    }).createComponent(CustomTemplateHighlightHostComponent);

    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-slot="highlight-next"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-slot="highlight-indicator"]')?.textContent).toContain('Step 1 of 2');

    const customNext = fixture.nativeElement.querySelector('.custom-next') as HTMLButtonElement;
    customNext.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.current).toBe(1);

    const customClose = fixture.nativeElement.querySelector('.custom-close') as HTMLButtonElement;
    customClose.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.open).toBe(false);
  });

  it('supports the grouped ZardHighlightImports export', async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [ImportsHighlightHostComponent],
    }).createComponent(ImportsHighlightHostComponent);

    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-slot="highlight-title"]')?.textContent?.trim()).toBe('Imported');
  });
});

function waitForAnimationFrame() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}
