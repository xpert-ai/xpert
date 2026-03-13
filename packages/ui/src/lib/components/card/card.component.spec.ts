import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { ZardCardComponent } from './card.component';
import { ZardCardImports } from './card.imports';

@Component({
  imports: [...ZardCardImports],
  template: `
    <z-card class="host-card">
      <z-card-header class="header-marker">
        <div z-card-avatar class="avatar-marker">
          <img alt="Avatar" src="/assets/avatar.png" />
        </div>
        <div class="min-w-0 flex flex-1 flex-col">
          <z-card-title class="title-marker">Card Title</z-card-title>
          <z-card-subtitle class="subtitle-marker">Card Subtitle</z-card-subtitle>
        </div>
      </z-card-header>

      <z-card-content class="content-marker">Card Body</z-card-content>
      <z-card-actions class="actions-marker">Card Actions</z-card-actions>
      <z-card-footer class="footer-marker">Card Footer</z-card-footer>
    </z-card>
  `,
})
class ExplicitStructureHostComponent {}

@Component({
  imports: [ZardCardComponent],
  template: `
    <z-card
      class="host-card"
      zAction="Inspect"
      zDescription="Card Description"
      zTitle="Card Title"
      [zFooterBorder]="true"
      [zHeaderBorder]="true"
      (zActionClick)="clicked = true"
    >
      Card Body
      <div card-footer>Footer Content</div>
    </z-card>
  `,
})
class InputDrivenHostComponent {
  clicked = false;
}

describe('ZardCardComponent', () => {
  it('renders explicit card primitives with zard slots', async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [ExplicitStructureHostComponent],
    }).createComponent(ExplicitStructureHostComponent);

    fixture.detectChanges();

    const host = fixture.nativeElement.querySelector('z-card') as HTMLElement;
    const header = fixture.nativeElement.querySelector('z-card-header') as HTMLElement;
    const avatar = fixture.nativeElement.querySelector('[z-card-avatar]') as HTMLElement;
    const title = fixture.nativeElement.querySelector('z-card-title') as HTMLElement;
    const subtitle = fixture.nativeElement.querySelector('z-card-subtitle') as HTMLElement;
    const content = fixture.nativeElement.querySelector('z-card-content') as HTMLElement;
    const actions = fixture.nativeElement.querySelector('z-card-actions') as HTMLElement;
    const footer = fixture.nativeElement.querySelector('z-card-footer') as HTMLElement;

    expect(host.className).toContain('host-card');
    expect(host.getAttribute('data-slot')).toBe('card');
    expect(header.className).toContain('header-marker');
    expect(header.getAttribute('data-slot')).toBe('card-header');
    expect(avatar.className).toContain('avatar-marker');
    expect(avatar.getAttribute('data-slot')).toBe('card-avatar');
    expect(title.className).toContain('title-marker');
    expect(title.getAttribute('data-slot')).toBe('card-title');
    expect(subtitle.className).toContain('subtitle-marker');
    expect(subtitle.getAttribute('data-slot')).toBe('card-description');
    expect(content.className).toContain('content-marker');
    expect(content.getAttribute('data-slot')).toBe('card-content');
    expect(actions.className).toContain('actions-marker');
    expect(actions.getAttribute('data-slot')).toBe('card-actions');
    expect(footer.className).toContain('footer-marker');
    expect(footer.getAttribute('data-slot')).toBe('card-footer');
  });

  it('keeps input-driven card behavior and emits zActionClick', async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [InputDrivenHostComponent],
    }).createComponent(InputDrivenHostComponent);

    fixture.detectChanges();

    const host = fixture.nativeElement.querySelector('z-card') as HTMLElement;
    const title = fixture.nativeElement.querySelector('[data-slot="card-title"]') as HTMLElement;
    const description = fixture.nativeElement.querySelector('[data-slot="card-description"]') as HTMLElement;
    const content = fixture.nativeElement.querySelector('[data-slot="card-content"]') as HTMLElement;
    const footer = fixture.nativeElement.querySelector('[data-slot="card-footer"]') as HTMLElement;
    const action = fixture.nativeElement.querySelector('[data-slot="card-action"]') as HTMLButtonElement;

    expect(host.className).toContain('host-card');
    expect(host.getAttribute('data-slot')).toBe('card');
    expect(title.getAttribute('data-slot')).toBe('card-title');
    expect(description.getAttribute('data-slot')).toBe('card-description');
    expect(content.getAttribute('data-slot')).toBe('card-content');
    expect(footer.getAttribute('data-slot')).toBe('card-footer');
    expect(host.getAttribute('aria-labelledby')).toBeTruthy();
    expect(host.getAttribute('aria-describedby')).toBeTruthy();

    action.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.clicked).toBe(true);
  });
});
