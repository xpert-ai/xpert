import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';

import {
  ZardToggleGroupChange,
  ZardToggleGroupComponent,
  ZardToggleGroupItemComponent,
} from './toggle-group.component';

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, ZardToggleGroupComponent, ZardToggleGroupItemComponent],
  template: `
    <z-toggle-group [formControl]="control" (change)="onGroupChange($event)" (valueChange)="onValueChange($event)">
      <z-toggle-group-item value="github">GitHub</z-toggle-group-item>
      <z-toggle-group-item value="aliyun">Aliyun</z-toggle-group-item>
    </z-toggle-group>
  `,
})
class ReactiveHostComponent {
  readonly control = new FormControl('github');
  groupChange: ZardToggleGroupChange | null = null;
  latestValue: unknown = null;

  onGroupChange(event: ZardToggleGroupChange) {
    this.groupChange = event;
  }

  onValueChange(value: unknown) {
    this.latestValue = value;
  }
}

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, ZardToggleGroupComponent, ZardToggleGroupItemComponent],
  template: `
    <z-toggle-group [formControl]="control">
      <z-toggle-group-item [value]="null">None</z-toggle-group-item>
      <z-toggle-group-item value="basic">Basic</z-toggle-group-item>
    </z-toggle-group>
  `,
})
class NullValueHostComponent {
  readonly control = new FormControl(null);
}

@Component({
  standalone: true,
  imports: [FormsModule, ZardToggleGroupComponent, ZardToggleGroupItemComponent],
  template: `
    <z-toggle-group [(ngModel)]="value" [multiple]="true" [disabled]="disabled">
      <z-toggle-group-item [value]="publicValue">Public</z-toggle-group-item>
      <z-toggle-group-item [value]="privateValue">Private</z-toggle-group-item>
    </z-toggle-group>
  `,
})
class NgModelMultipleHostComponent {
  readonly publicValue = { key: 'public' };
  readonly privateValue = { key: 'private' };

  value = [this.publicValue];
  disabled = false;
}

@Component({
  standalone: true,
  imports: [FormsModule, ZardToggleGroupComponent],
  template: `
    <z-toggle-group [(ngModel)]="value" [items]="items" [vertical]="true"></z-toggle-group>
  `,
})
class ItemsFallbackHostComponent {
  value = 'month';
  readonly items = [
    { value: 'year', label: 'Year' },
    { value: 'month', label: 'Month' },
  ];
}

describe('ZardToggleGroupComponent', () => {
  it('syncs reactive form values and keeps single-select material semantics', async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [ReactiveHostComponent],
    }).createComponent(ReactiveHostComponent);

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const items = fixture.nativeElement.querySelectorAll('z-toggle-group-item') as NodeListOf<HTMLElement>;
    expect(items[0].dataset.state).toBe('on');
    expect(items[1].dataset.state).toBe('off');

    items[0].click();
    fixture.detectChanges();

    expect(fixture.componentInstance.control.value).toBe('github');
    expect(fixture.componentInstance.groupChange).toBeNull();

    items[1].click();
    fixture.detectChanges();

    expect(fixture.componentInstance.control.value).toBe('aliyun');
    expect(fixture.componentInstance.groupChange).toEqual({ value: 'aliyun' });
    expect(fixture.componentInstance.latestValue).toBe('aliyun');
    expect(items[1].dataset.state).toBe('on');
  });

  it('supports null values in reactive forms', async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [NullValueHostComponent],
    }).createComponent(NullValueHostComponent);

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const items = fixture.nativeElement.querySelectorAll('z-toggle-group-item') as NodeListOf<HTMLElement>;
    expect(items[0].dataset.state).toBe('on');

    items[1].click();
    fixture.detectChanges();

    expect(fixture.componentInstance.control.value).toBe('basic');
    expect(items[1].dataset.state).toBe('on');
  });

  it('supports ngModel arrays with object-by-reference values and group disabled state', async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [NgModelMultipleHostComponent],
    }).createComponent(NgModelMultipleHostComponent);

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const items = fixture.nativeElement.querySelectorAll('z-toggle-group-item') as NodeListOf<HTMLElement>;
    expect(items[0].dataset.state).toBe('on');
    expect(items[1].dataset.state).toBe('off');

    items[1].click();
    fixture.detectChanges();

    expect(fixture.componentInstance.value).toEqual([
      fixture.componentInstance.publicValue,
      fixture.componentInstance.privateValue,
    ]);
    expect(items[1].dataset.state).toBe('on');

    fixture.componentInstance.disabled = true;
    fixture.detectChanges();

    expect(items[0].getAttribute('aria-disabled')).toBe('true');
    expect(items[1].getAttribute('aria-disabled')).toBe('true');
  });

  it('renders items fallback mode and exposes vertical orientation', async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [ItemsFallbackHostComponent],
    }).createComponent(ItemsFallbackHostComponent);

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const group = fixture.nativeElement.querySelector('z-toggle-group') as HTMLElement;
    const items = fixture.nativeElement.querySelectorAll('z-toggle-group-item') as NodeListOf<HTMLElement>;

    expect(group.dataset.orientation).toBe('vertical');
    expect(items.length).toBe(2);
    expect(items[1].textContent?.trim()).toBe('Month');
    expect(items[1].dataset.state).toBe('on');
  });
});
