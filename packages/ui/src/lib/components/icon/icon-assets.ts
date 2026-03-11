import { InjectionToken, makeEnvironmentProviders, type EnvironmentProviders, type Provider } from '@angular/core';

export type ZardIconAssetMap = Record<string, string>;
export type ZardIconAssetInput = ZardIconAssetMap | Array<{ name: string; resourceUrl: string }>;

export const ZARD_ICON_ASSETS = new InjectionToken<ZardIconAssetMap[]>('ZARD_ICON_ASSETS');

export function normalizeZardIconAssets(assets: ZardIconAssetInput): ZardIconAssetMap {
  if (Array.isArray(assets)) {
    return assets.reduce<ZardIconAssetMap>((acc, asset) => {
      acc[asset.name] = asset.resourceUrl;
      return acc;
    }, {});
  }

  return assets;
}

export function mergeZardIconAssets(assets: ZardIconAssetMap[] | null | undefined): ZardIconAssetMap {
  return (assets ?? []).reduce<ZardIconAssetMap>((acc, assetMap) => ({ ...acc, ...assetMap }), {});
}

export function provideZardIconAssets(assets: ZardIconAssetInput): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: ZARD_ICON_ASSETS,
      multi: true,
      useValue: normalizeZardIconAssets(assets),
    } satisfies Provider,
  ]);
}
