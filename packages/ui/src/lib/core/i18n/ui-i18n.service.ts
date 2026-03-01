import { inject, Injectable, InjectionToken, type Provider, type Type } from '@angular/core';
import i18next from 'i18next';

export type UiI18nOptions = {
  ns?: string;
  lng?: string;
  Default?: string;
  defaultValue?: string;
} & Record<string, unknown>;

export type UiI18nTranslateFn = (key: string, options?: UiI18nOptions) => string;

export interface UiI18nAdapter {
  getLanguage?: () => string | undefined;
  translate: UiI18nTranslateFn;
}

function defaultTranslate(key: string, options?: UiI18nOptions): string {
  const defaultValue = options?.defaultValue ?? options?.Default;
  const value = i18next.t(key, {
    ...options,
    defaultValue,
    lng: options?.lng ?? i18next.resolvedLanguage ?? i18next.language,
  }) as string;

  return value || defaultValue || key;
}

export const UI_I18N_ADAPTER = new InjectionToken<UiI18nAdapter>('UI_I18N_ADAPTER', {
  providedIn: 'root',
  factory: () => ({
    getLanguage: () => i18next.resolvedLanguage ?? i18next.language,
    translate: defaultTranslate,
  }),
});

@Injectable({
  providedIn: 'root',
})
export class UiI18nService {
  private readonly adapter = inject(UI_I18N_ADAPTER);

  get currentLanguage(): string {
    return this.adapter.getLanguage?.() || i18next.resolvedLanguage || i18next.language;
  }

  get initialized(): boolean {
    return i18next.isInitialized;
  }

  t(key: string, options?: UiI18nOptions): string {
    if (!key) {
      return '';
    }

    const translated = this.adapter.translate(key, {
      ...options,
      lng: options?.lng ?? this.currentLanguage,
      defaultValue: options?.defaultValue ?? options?.Default,
    });

    return translated || options?.defaultValue || options?.Default || key;
  }

  translate(key: string, options?: UiI18nOptions): string {
    return this.t(key, options);
  }
}

export function injectUiI18nService() {
  return inject(UiI18nService);
}

export function provideUiI18nAdapter(adapter: UiI18nAdapter): Provider {
  return {
    provide: UI_I18N_ADAPTER,
    useValue: adapter,
  };
}

export function provideUiI18nAdapterFactory<TDeps extends readonly unknown[]>(
  useFactory: (...deps: TDeps) => UiI18nAdapter,
  deps: Array<Type<unknown> | InjectionToken<unknown>>,
): Provider {
  return {
    provide: UI_I18N_ADAPTER,
    useFactory,
    deps,
  };
}
