import { type ComponentType, Overlay, OverlayConfig, OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal, TemplatePortal } from '@angular/cdk/portal';
import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, InjectionToken, Injector, PLATFORM_ID, TemplateRef } from '@angular/core';

import { ZardSheetRef } from './sheet-ref';
import { ZardSheetComponent, ZardSheetOptions } from './sheet.component';

type ContentType<T> = ComponentType<T> | TemplateRef<T> | string;
export const Z_SHEET_DATA = new InjectionToken<any>('Z_SHEET_DATA');

@Injectable({
  providedIn: 'root',
})
export class ZardSheetService {
  private overlay = inject(Overlay);
  private injector = inject(Injector);
  private platformId = inject(PLATFORM_ID);

  create<T, U>(config: ZardSheetOptions<T, U>): ZardSheetRef<T> {
    return this.open<T, U>(config.zContent as ContentType<T>, config);
  }

  open<T, U>(componentOrTemplateRef: ContentType<T>, config?: ZardSheetOptions<T, U>) {
    const mergedConfig = Object.assign(new ZardSheetOptions<T, U>(), config, {
      zContent: componentOrTemplateRef,
    });
    const overlayRef = this.createOverlay();

    if (!overlayRef) {
      return new ZardSheetRef(undefined as any, mergedConfig, undefined as any, this.platformId);
    }

    const sheetContainer = this.attachSheetContainer<T, U>(overlayRef, mergedConfig);

    const sheetRef = this.attachSheetContent<T, U>(componentOrTemplateRef, sheetContainer, overlayRef, mergedConfig);
    sheetContainer.sheetRef = sheetRef;

    return sheetRef;
  }

  private createOverlay(): OverlayRef | undefined {
    if (isPlatformBrowser(this.platformId)) {
      const overlayConfig = new OverlayConfig({
        hasBackdrop: true,
        positionStrategy: this.overlay.position().global(),
        scrollStrategy: this.overlay.scrollStrategies.block(),
      });

      return this.overlay.create(overlayConfig);
    }
    return undefined;
  }

  private attachSheetContainer<T, U>(overlayRef: OverlayRef, config: ZardSheetOptions<T, U>) {
    const injector = Injector.create({
      parent: this.injector,
      providers: [
        { provide: OverlayRef, useValue: overlayRef },
        { provide: ZardSheetOptions, useValue: config },
      ],
    });

    const containerPortal = new ComponentPortal<ZardSheetComponent<T, U>>(
      ZardSheetComponent,
      config.zViewContainerRef,
      injector,
    );
    const containerRef = overlayRef.attach<ZardSheetComponent<T, U>>(containerPortal);
    containerRef.instance.state.set('open');

    return containerRef.instance;
  }

  private attachSheetContent<T, U>(
    componentOrTemplateRef: ContentType<T>,
    sheetContainer: ZardSheetComponent<T, U>,
    overlayRef: OverlayRef,
    config: ZardSheetOptions<T, U>,
  ) {
    const sheetRef = new ZardSheetRef<T>(overlayRef, config, sheetContainer, this.platformId);

    if (componentOrTemplateRef instanceof TemplateRef) {
      sheetContainer.attachTemplatePortal(
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        new TemplatePortal<T>(componentOrTemplateRef, null!, {
          sheetRef: sheetRef,
        } as any),
      );
    } else if (typeof componentOrTemplateRef !== 'string') {
      const injector = this.createInjector<T, U>(sheetRef, config);
      const contentRef = sheetContainer.attachComponentPortal<T>(
        new ComponentPortal(componentOrTemplateRef, config.zViewContainerRef, injector),
      );
      sheetRef.componentInstance = contentRef.instance;
    }

    return sheetRef;
  }

  private createInjector<T, U>(sheetRef: ZardSheetRef<T>, config: ZardSheetOptions<T, U>) {
    return Injector.create({
      parent: this.injector,
      providers: [
        { provide: ZardSheetRef, useValue: sheetRef },
        { provide: Z_SHEET_DATA, useValue: config.zData },
      ],
    });
  }
}
