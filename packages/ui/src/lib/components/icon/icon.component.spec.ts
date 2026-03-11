import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { provideZardIconAssets } from './icon-assets';
import { ZardIconComponent } from './icon.component';
import { resolveLegacyIcon } from './legacy-icons';

@Component({
  imports: [ZardIconComponent],
  template: `<z-icon zType="search" color="warn" zSize="sm" class="z-icon-rtl-mirror" />`,
})
class HostLucideIconComponent {}

@Component({
  imports: [ZardIconComponent],
  template: `<z-icon zType="generating_tokens" />`,
})
class HostLegacyMappedIconComponent {}

@Component({
  imports: [ZardIconComponent],
  template: `<z-icon [svgIcon]="'bar'" />`,
})
class HostAssetIconComponent {}

describe('ZardIconComponent', () => {
  it('renders a lucide icon using z-icon sizing and color classes on the host', async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [HostLucideIconComponent],
    }).createComponent(HostLucideIconComponent);

    fixture.detectChanges();

    const icon = fixture.nativeElement.querySelector('z-icon') as HTMLElement;
    expect(icon.classList.contains('z-icon')).toBe(true);
    expect(icon.classList.contains('size-3')).toBe(true);
    expect(icon.classList.contains('z-icon-rtl-mirror')).toBe(true);
    expect(icon.classList.contains('text-red-500')).toBe(true);
    expect(icon.querySelector('lucide-angular')).not.toBeNull();
  });

  it('resolves legacy icon names to lucide icons without font fallbacks', async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [HostLegacyMappedIconComponent],
    }).createComponent(HostLegacyMappedIconComponent);

    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('z-icon lucide-angular')).not.toBeNull();
  });

  it('renders svg assets provided through the asset provider', async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [HostAssetIconComponent],
      providers: [provideZardIconAssets({ bar: '/assets/icons/bar.svg' })],
    }).createComponent(HostAssetIconComponent);

    fixture.detectChanges();

    const asset = fixture.nativeElement.querySelector('z-icon img') as HTMLImageElement;
    expect(asset).not.toBeNull();
    expect(asset.getAttribute('src')).toBe('/assets/icons/bar.svg');
  });
});

describe('resolveLegacyIcon', () => {
  it('resolves configured asset icons before any font fallback', () => {
    expect(resolveLegacyIcon('bar', { assets: { bar: '/assets/icons/bar.svg' } })).toEqual({
      kind: 'asset',
      src: '/assets/icons/bar.svg',
    });
  });

  it('resolves mapped material icons to lucide data', () => {
    const resolved = resolveLegacyIcon('delete');
    expect(resolved?.kind).toBe('lucide');
  });

  it('resolves migrated material icon names directly to lucide icons', () => {
    expect(resolveLegacyIcon('generating_tokens')?.kind).toBe('lucide');
  });

  it('returns null for unknown non-class icons', () => {
    expect(resolveLegacyIcon('definitely_unknown_icon')).toBeNull();
  });

  it('supports class-based icon fallbacks', () => {
    expect(resolveLegacyIcon('ri-close-line')).toEqual({
      kind: 'class',
      className: 'ri-close-line',
    });
  });
});
