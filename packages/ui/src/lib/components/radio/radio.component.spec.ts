import { Component } from '@angular/core';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { TestBed } from '@angular/core/testing';

import { ZardRadioComponent, ZardRadioGroupComponent } from './radio.component';

@Component({
  imports: [ReactiveFormsModule, ZardRadioGroupComponent, ZardRadioComponent],
  template: `
    <z-radio-group [formControl]="control" (change)="onGroupChange($event)">
      <z-radio value="github">GitHub</z-radio>
      <z-radio value="aliyun">Aliyun</z-radio>
    </z-radio-group>
  `,
})
class ReactiveHostComponent {
  readonly control = new FormControl('github');
  groupChange: unknown = null;

  onGroupChange(event: unknown) {
    this.groupChange = event;
  }
}

@Component({
  imports: [FormsModule, ZardRadioGroupComponent, ZardRadioComponent],
  template: `
    <z-radio-group [(ngModel)]="value" [disabled]="disabled">
      <z-radio value="public">Public</z-radio>
      <z-radio value="private">Private</z-radio>
    </z-radio-group>
  `,
})
class NgModelHostComponent {
  value = 'public';
  disabled = false;
}

describe('ZardRadioGroupComponent', () => {
  it('syncs reactive form values and emits group changes', async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [ReactiveHostComponent],
    }).createComponent(ReactiveHostComponent);

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const radios = fixture.nativeElement.querySelectorAll('input[type="radio"]') as NodeListOf<HTMLInputElement>;
    const dots = fixture.nativeElement.querySelectorAll('.z-radio__dot') as NodeListOf<HTMLSpanElement>;
    const controls = fixture.nativeElement.querySelectorAll('.z-radio__control') as NodeListOf<HTMLSpanElement>;
    expect(radios[0].checked).toBe(true);
    expect(radios[1].checked).toBe(false);
    expect(dots[0].className).toContain('peer-checked:opacity-100');
    expect(controls[0].className).toContain('peer-checked:border-primary');
    expect(controls[0].previousElementSibling).toBe(radios[0]);
    expect(dots[0].previousElementSibling).toBe(controls[0]);

    radios[1].dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();

    expect(fixture.componentInstance.control.value).toBe('aliyun');
    expect(fixture.componentInstance.groupChange).toEqual({ value: 'aliyun' });
    expect(radios[1].checked).toBe(true);
    expect(controls[1].previousElementSibling).toBe(radios[1]);
    expect(dots[1].previousElementSibling).toBe(controls[1]);
  });

  it('supports ngModel bindings and disables all child radios from the group', async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [NgModelHostComponent],
    }).createComponent(NgModelHostComponent);

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const radios = fixture.nativeElement.querySelectorAll('input[type="radio"]') as NodeListOf<HTMLInputElement>;
    expect(radios[0].checked).toBe(true);

    radios[1].dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();

    expect(fixture.componentInstance.value).toBe('private');

    fixture.componentInstance.disabled = true;
    fixture.detectChanges();

    expect(radios[0].disabled).toBe(true);
    expect(radios[1].disabled).toBe(true);
  });
});
