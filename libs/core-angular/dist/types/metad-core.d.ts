import * as _angular_animations from '@angular/animations';
import * as i0 from '@angular/core';
import { Signal, InjectionToken, OnDestroy, EventEmitter, ElementRef, PipeTransform, ModuleWithProviders, Renderer2, DebugElement, TemplateRef, OutputEmitterRef, AfterViewInit, DestroyRef, WritableSignal } from '@angular/core';
import * as _metad_ocap_core from '@xpert-ai/ocap-core';
import { IndicatorType, EntityType, Cube, PivotColumn, RecursiveHierarchyType, PropertyName, ValueListAnnotation, IFilter, EntityBusinessState, SelectionVariant, PresentationVariant, DataSettings, Dimension, ISlicer, TimeGranularity, SemanticObjectMappingType, Property, IAdvancedFilter, OrderBy } from '@xpert-ai/ocap-core';
export { CubeVariablePrompt, MEMBER_RETRIEVER_TOOL_NAME, PROMPT_RETRIEVE_DIMENSION_MEMBER, makeCubeRulesPrompt, markdownEntityType, markdownModelCube, nonBlank, nonNullable } from '@xpert-ai/ocap-core';
import { z, ZodType, ZodTypeDef } from 'zod';
import { EntitySelectResultType } from '@xpert-ai/ocap-angular/entity';
import { BaseRetriever } from '@langchain/core/retrievers';
import { DynamicStructuredTool } from '@langchain/core/tools';
import * as i3 from '@xpert-ai/ocap-angular/core';
import { NgmAppearance } from '@xpert-ai/ocap-angular/core';
import { DomSanitizer, SafeHtml, SafeStyle, SafeScript, SafeUrl, SafeResourceUrl } from '@angular/platform-browser';
import * as rxjs from 'rxjs';
import { Observable, ReplaySubject, Subject, BehaviorSubject, OperatorFunction } from 'rxjs';
import * as i1 from '@ng-web-apis/resize-observer';
import { ResizeObserverService } from '@ng-web-apis/resize-observer';
import { TranslateService } from '@ngx-translate/core';
import { ComponentStore } from '@xpert-ai/store';
import { ComponentStore as ComponentStore$1 } from '@ngrx/component-store';
import * as _ngneat_elf_src_lib_state from '@ngneat/elf/src/lib/state';
import { StoreDef, Store, StoreConfig, PropsFactory } from '@ngneat/elf';
import { FocusableOption, FocusOrigin } from '@angular/cdk/a11y';
import { FormControl } from '@angular/forms';
import { HttpParams } from '@angular/common/http';

declare const listAnimation: _angular_animations.AnimationTriggerMetadata;
declare const listEnterAnimation: _angular_animations.AnimationTriggerMetadata;
declare const ListHeightStaggerAnimation: _angular_animations.AnimationTriggerMetadata;
declare const ListSlideStaggerAnimation: _angular_animations.AnimationTriggerMetadata;

declare const ROUTE_ANIMATIONS_ELEMENTS = "route-animations-elements";
declare const routeAnimations: _angular_animations.AnimationTriggerMetadata;
declare function isRouteAnimationsAll(): boolean;
declare function isRouteAnimationsNone(): boolean;
declare function isRouteAnimationsPage(): boolean;
declare function isRouteAnimationsElements(): boolean;

declare class AnimationsService {
    constructor();
    private static routeAnimationType;
    static isRouteAnimationsType(type: RouteAnimationType): boolean;
    updateRouteAnimationType(pageAnimations: boolean, elementsAnimations: boolean): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<AnimationsService, never>;
    static ɵprov: i0.ɵɵInjectableDeclaration<AnimationsService>;
}
type RouteAnimationType = 'ALL' | 'PAGE' | 'ELEMENTS' | 'NONE';

declare const OverlayAnimation1: _angular_animations.AnimationTriggerMetadata;
declare const SlideLeftRightAnimation: _angular_animations.AnimationTriggerMetadata;
declare const OverlayAnimations: _angular_animations.AnimationTriggerMetadata[];

declare const Disappear1: _angular_animations.AnimationTriggerMetadata;
declare const DisappearFadeOut: _angular_animations.AnimationTriggerMetadata;
declare const DisappearSlideDown: _angular_animations.AnimationTriggerMetadata;
declare const DisappearSlideLeft: _angular_animations.AnimationTriggerMetadata;
declare const DisappearBL: _angular_animations.AnimationTriggerMetadata;
declare const DisappearAnimations: _angular_animations.AnimationTriggerMetadata[];

declare const IfAnimation: _angular_animations.AnimationTriggerMetadata;
declare const HeightChangeAnimation: _angular_animations.AnimationTriggerMetadata;
declare const SlideUpAnimation: _angular_animations.AnimationTriggerMetadata;
declare const SlideUpDownAnimation: _angular_animations.AnimationTriggerMetadata;
declare const LeanRightEaseInAnimation: _angular_animations.AnimationTriggerMetadata;
declare const IfAnimations: _angular_animations.AnimationTriggerMetadata[];

/**
 * z.ZodType<Partial<Indicator>>
 */
declare const IndicatorSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    code: z.ZodString;
    name: z.ZodString;
    type: z.ZodEnum<[IndicatorType.BASIC, IndicatorType.DERIVE]>;
    modelId: z.ZodString;
    entity: z.ZodString;
    calendar: z.ZodOptional<z.ZodString>;
    dimensions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    filters: z.ZodOptional<z.ZodArray<z.ZodObject<{
        dimension: z.ZodObject<{
            dimension: z.ZodString;
            hierarchy: z.ZodOptional<z.ZodString>;
            level: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            hierarchy?: string;
            level?: string;
            dimension?: string;
        }, {
            hierarchy?: string;
            level?: string;
            dimension?: string;
        }>;
        exclude: z.ZodOptional<z.ZodBoolean>;
        members: z.ZodArray<z.ZodEffects<z.ZodObject<{
            key: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            caption: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator: z.ZodNullable<z.ZodOptional<z.ZodEnum<[_metad_ocap_core.FilterOperator.EQ, _metad_ocap_core.FilterOperator.Contains, _metad_ocap_core.FilterOperator.NotContains, _metad_ocap_core.FilterOperator.StartsWith, _metad_ocap_core.FilterOperator.NotStartsWith, _metad_ocap_core.FilterOperator.EndsWith, _metad_ocap_core.FilterOperator.NotEndsWith]>>>;
        }, "strip", z.ZodTypeAny, {
            key?: string;
            operator?: _metad_ocap_core.FilterOperator.EQ | _metad_ocap_core.FilterOperator.Contains | _metad_ocap_core.FilterOperator.EndsWith | _metad_ocap_core.FilterOperator.StartsWith | _metad_ocap_core.FilterOperator.NotContains | _metad_ocap_core.FilterOperator.NotEndsWith | _metad_ocap_core.FilterOperator.NotStartsWith;
            caption?: string;
        }, {
            key?: string;
            operator?: _metad_ocap_core.FilterOperator.EQ | _metad_ocap_core.FilterOperator.Contains | _metad_ocap_core.FilterOperator.EndsWith | _metad_ocap_core.FilterOperator.StartsWith | _metad_ocap_core.FilterOperator.NotContains | _metad_ocap_core.FilterOperator.NotEndsWith | _metad_ocap_core.FilterOperator.NotStartsWith;
            caption?: string;
        }>, {
            key?: string;
            operator?: _metad_ocap_core.FilterOperator.EQ | _metad_ocap_core.FilterOperator.Contains | _metad_ocap_core.FilterOperator.EndsWith | _metad_ocap_core.FilterOperator.StartsWith | _metad_ocap_core.FilterOperator.NotContains | _metad_ocap_core.FilterOperator.NotEndsWith | _metad_ocap_core.FilterOperator.NotStartsWith;
            caption?: string;
        }, {
            key?: string;
            operator?: _metad_ocap_core.FilterOperator.EQ | _metad_ocap_core.FilterOperator.Contains | _metad_ocap_core.FilterOperator.EndsWith | _metad_ocap_core.FilterOperator.StartsWith | _metad_ocap_core.FilterOperator.NotContains | _metad_ocap_core.FilterOperator.NotEndsWith | _metad_ocap_core.FilterOperator.NotStartsWith;
            caption?: string;
        }>, "many">;
    }, "strip", z.ZodTypeAny, {
        exclude?: boolean;
        dimension?: {
            hierarchy?: string;
            level?: string;
            dimension?: string;
        };
        members?: {
            key?: string;
            operator?: _metad_ocap_core.FilterOperator.EQ | _metad_ocap_core.FilterOperator.Contains | _metad_ocap_core.FilterOperator.EndsWith | _metad_ocap_core.FilterOperator.StartsWith | _metad_ocap_core.FilterOperator.NotContains | _metad_ocap_core.FilterOperator.NotEndsWith | _metad_ocap_core.FilterOperator.NotStartsWith;
            caption?: string;
        }[];
    }, {
        exclude?: boolean;
        dimension?: {
            hierarchy?: string;
            level?: string;
            dimension?: string;
        };
        members?: {
            key?: string;
            operator?: _metad_ocap_core.FilterOperator.EQ | _metad_ocap_core.FilterOperator.Contains | _metad_ocap_core.FilterOperator.EndsWith | _metad_ocap_core.FilterOperator.StartsWith | _metad_ocap_core.FilterOperator.NotContains | _metad_ocap_core.FilterOperator.NotEndsWith | _metad_ocap_core.FilterOperator.NotStartsWith;
            caption?: string;
        }[];
    }>, "many">>;
    variables: z.ZodOptional<z.ZodArray<z.ZodObject<{
        dimension: z.ZodObject<{
            dimension: z.ZodString;
            hierarchy: z.ZodOptional<z.ZodString>;
            level: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            hierarchy?: string;
            level?: string;
            dimension?: string;
        }, {
            hierarchy?: string;
            level?: string;
            dimension?: string;
        }>;
        exclude: z.ZodOptional<z.ZodBoolean>;
        members: z.ZodArray<z.ZodEffects<z.ZodObject<{
            key: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            caption: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator: z.ZodNullable<z.ZodOptional<z.ZodEnum<[_metad_ocap_core.FilterOperator.EQ, _metad_ocap_core.FilterOperator.Contains, _metad_ocap_core.FilterOperator.NotContains, _metad_ocap_core.FilterOperator.StartsWith, _metad_ocap_core.FilterOperator.NotStartsWith, _metad_ocap_core.FilterOperator.EndsWith, _metad_ocap_core.FilterOperator.NotEndsWith]>>>;
        }, "strip", z.ZodTypeAny, {
            key?: string;
            operator?: _metad_ocap_core.FilterOperator.EQ | _metad_ocap_core.FilterOperator.Contains | _metad_ocap_core.FilterOperator.EndsWith | _metad_ocap_core.FilterOperator.StartsWith | _metad_ocap_core.FilterOperator.NotContains | _metad_ocap_core.FilterOperator.NotEndsWith | _metad_ocap_core.FilterOperator.NotStartsWith;
            caption?: string;
        }, {
            key?: string;
            operator?: _metad_ocap_core.FilterOperator.EQ | _metad_ocap_core.FilterOperator.Contains | _metad_ocap_core.FilterOperator.EndsWith | _metad_ocap_core.FilterOperator.StartsWith | _metad_ocap_core.FilterOperator.NotContains | _metad_ocap_core.FilterOperator.NotEndsWith | _metad_ocap_core.FilterOperator.NotStartsWith;
            caption?: string;
        }>, {
            key?: string;
            operator?: _metad_ocap_core.FilterOperator.EQ | _metad_ocap_core.FilterOperator.Contains | _metad_ocap_core.FilterOperator.EndsWith | _metad_ocap_core.FilterOperator.StartsWith | _metad_ocap_core.FilterOperator.NotContains | _metad_ocap_core.FilterOperator.NotEndsWith | _metad_ocap_core.FilterOperator.NotStartsWith;
            caption?: string;
        }, {
            key?: string;
            operator?: _metad_ocap_core.FilterOperator.EQ | _metad_ocap_core.FilterOperator.Contains | _metad_ocap_core.FilterOperator.EndsWith | _metad_ocap_core.FilterOperator.StartsWith | _metad_ocap_core.FilterOperator.NotContains | _metad_ocap_core.FilterOperator.NotEndsWith | _metad_ocap_core.FilterOperator.NotStartsWith;
            caption?: string;
        }>, "many">;
    }, "strip", z.ZodTypeAny, {
        exclude?: boolean;
        dimension?: {
            hierarchy?: string;
            level?: string;
            dimension?: string;
        };
        members?: {
            key?: string;
            operator?: _metad_ocap_core.FilterOperator.EQ | _metad_ocap_core.FilterOperator.Contains | _metad_ocap_core.FilterOperator.EndsWith | _metad_ocap_core.FilterOperator.StartsWith | _metad_ocap_core.FilterOperator.NotContains | _metad_ocap_core.FilterOperator.NotEndsWith | _metad_ocap_core.FilterOperator.NotStartsWith;
            caption?: string;
        }[];
    }, {
        exclude?: boolean;
        dimension?: {
            hierarchy?: string;
            level?: string;
            dimension?: string;
        };
        members?: {
            key?: string;
            operator?: _metad_ocap_core.FilterOperator.EQ | _metad_ocap_core.FilterOperator.Contains | _metad_ocap_core.FilterOperator.EndsWith | _metad_ocap_core.FilterOperator.StartsWith | _metad_ocap_core.FilterOperator.NotContains | _metad_ocap_core.FilterOperator.NotEndsWith | _metad_ocap_core.FilterOperator.NotStartsWith;
            caption?: string;
        }[];
    }>, "many">>;
    measure: z.ZodOptional<z.ZodString>;
    formula: z.ZodOptional<z.ZodString>;
    unit: z.ZodOptional<z.ZodString>;
    isApplication: z.ZodOptional<z.ZodBoolean>;
    businessAreaId: z.ZodOptional<z.ZodString>;
    business: z.ZodString;
    tags: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id?: string;
    }, {
        id?: string;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    id?: string;
    code?: string;
    name?: string;
    type?: IndicatorType;
    modelId?: string;
    entity?: string;
    calendar?: string;
    dimensions?: string[];
    filters?: {
        exclude?: boolean;
        dimension?: {
            hierarchy?: string;
            level?: string;
            dimension?: string;
        };
        members?: {
            key?: string;
            operator?: _metad_ocap_core.FilterOperator.EQ | _metad_ocap_core.FilterOperator.Contains | _metad_ocap_core.FilterOperator.EndsWith | _metad_ocap_core.FilterOperator.StartsWith | _metad_ocap_core.FilterOperator.NotContains | _metad_ocap_core.FilterOperator.NotEndsWith | _metad_ocap_core.FilterOperator.NotStartsWith;
            caption?: string;
        }[];
    }[];
    variables?: {
        exclude?: boolean;
        dimension?: {
            hierarchy?: string;
            level?: string;
            dimension?: string;
        };
        members?: {
            key?: string;
            operator?: _metad_ocap_core.FilterOperator.EQ | _metad_ocap_core.FilterOperator.Contains | _metad_ocap_core.FilterOperator.EndsWith | _metad_ocap_core.FilterOperator.StartsWith | _metad_ocap_core.FilterOperator.NotContains | _metad_ocap_core.FilterOperator.NotEndsWith | _metad_ocap_core.FilterOperator.NotStartsWith;
            caption?: string;
        }[];
    }[];
    measure?: string;
    formula?: string;
    unit?: string;
    isApplication?: boolean;
    businessAreaId?: string;
    business?: string;
    tags?: {
        id?: string;
    }[];
}, {
    id?: string;
    code?: string;
    name?: string;
    type?: IndicatorType;
    modelId?: string;
    entity?: string;
    calendar?: string;
    dimensions?: string[];
    filters?: {
        exclude?: boolean;
        dimension?: {
            hierarchy?: string;
            level?: string;
            dimension?: string;
        };
        members?: {
            key?: string;
            operator?: _metad_ocap_core.FilterOperator.EQ | _metad_ocap_core.FilterOperator.Contains | _metad_ocap_core.FilterOperator.EndsWith | _metad_ocap_core.FilterOperator.StartsWith | _metad_ocap_core.FilterOperator.NotContains | _metad_ocap_core.FilterOperator.NotEndsWith | _metad_ocap_core.FilterOperator.NotStartsWith;
            caption?: string;
        }[];
    }[];
    variables?: {
        exclude?: boolean;
        dimension?: {
            hierarchy?: string;
            level?: string;
            dimension?: string;
        };
        members?: {
            key?: string;
            operator?: _metad_ocap_core.FilterOperator.EQ | _metad_ocap_core.FilterOperator.Contains | _metad_ocap_core.FilterOperator.EndsWith | _metad_ocap_core.FilterOperator.StartsWith | _metad_ocap_core.FilterOperator.NotContains | _metad_ocap_core.FilterOperator.NotEndsWith | _metad_ocap_core.FilterOperator.NotStartsWith;
            caption?: string;
        }[];
    }[];
    measure?: string;
    formula?: string;
    unit?: string;
    isApplication?: boolean;
    businessAreaId?: string;
    business?: string;
    tags?: {
        id?: string;
    }[];
}>;
declare const IndicatorFormulaSchema: z.ZodObject<{
    formula: z.ZodString;
    unit: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    formula?: string;
    unit?: string;
}, {
    formula?: string;
    unit?: string;
}>;

/**
 * @deprecated use markdownEntityType
 */
declare function calcEntityTypePrompt(entityType: EntityType): string;
/**
 * @deprecated use markdownCube
 */
declare function makeCubePrompt(cube: Cube): string;
/**
 * @deprecated use markdownTable
 */
declare function makeTablePrompt(entityType: EntityType): string;
declare function markdownTable(table: EntityType): string;

type DefaultDataSettings = EntitySelectResultType;

declare function makeChartRulesPrompt(): string;
declare function makeChartEnum(): string[];
declare function makeChartSchema(): z.ZodObject<{
    cube: z.ZodString;
    chartType: z.ZodObject<{
        type: z.ZodEnum<[string, ...string[]]>;
        chartOptions: z.ZodObject<{
            seriesStyle: z.ZodAny;
            legend: z.ZodAny;
            axis: z.ZodAny;
            dataZoom: z.ZodAny;
            tooltip: z.ZodAny;
        }, "strip", z.ZodTypeAny, {
            seriesStyle?: any;
            legend?: any;
            axis?: any;
            dataZoom?: any;
            tooltip?: any;
        }, {
            seriesStyle?: any;
            legend?: any;
            axis?: any;
            dataZoom?: any;
            tooltip?: any;
        }>;
    }, "strip", z.ZodTypeAny, {
        type?: string;
        chartOptions?: {
            seriesStyle?: any;
            legend?: any;
            axis?: any;
            dataZoom?: any;
            tooltip?: any;
        };
    }, {
        type?: string;
        chartOptions?: {
            seriesStyle?: any;
            legend?: any;
            axis?: any;
            dataZoom?: any;
            tooltip?: any;
        };
    }>;
    slicers: z.ZodArray<z.ZodObject<{
        dimension: z.ZodObject<{
            dimension: z.ZodString;
            hierarchy: z.ZodOptional<z.ZodString>;
            level: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            dimension?: string;
            hierarchy?: string;
            level?: string;
        }, {
            dimension?: string;
            hierarchy?: string;
            level?: string;
        }>;
        members: z.ZodArray<z.ZodObject<{
            value: z.ZodString;
            caption: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            value?: string;
            caption?: string;
        }, {
            value?: string;
            caption?: string;
        }>, "many">;
    }, "strip", z.ZodTypeAny, {
        dimension?: {
            dimension?: string;
            hierarchy?: string;
            level?: string;
        };
        members?: {
            value?: string;
            caption?: string;
        }[];
    }, {
        dimension?: {
            dimension?: string;
            hierarchy?: string;
            level?: string;
        };
        members?: {
            value?: string;
            caption?: string;
        }[];
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    cube?: string;
    chartType?: {
        type?: string;
        chartOptions?: {
            seriesStyle?: any;
            legend?: any;
            axis?: any;
            dataZoom?: any;
            tooltip?: any;
        };
    };
    slicers?: {
        dimension?: {
            dimension?: string;
            hierarchy?: string;
            level?: string;
        };
        members?: {
            value?: string;
            caption?: string;
        }[];
    }[];
}, {
    cube?: string;
    chartType?: {
        type?: string;
        chartOptions?: {
            seriesStyle?: any;
            legend?: any;
            axis?: any;
            dataZoom?: any;
            tooltip?: any;
        };
    };
    slicers?: {
        dimension?: {
            dimension?: string;
            hierarchy?: string;
            level?: string;
        };
        members?: {
            value?: string;
            caption?: string;
        }[];
    }[];
}>;
declare function makeChartDimensionSchema(): z.ZodObject<{
    dimension: z.ZodString;
    hierarchy: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    level: z.ZodOptional<z.ZodString>;
    properties: z.ZodNullable<z.ZodOptional<z.ZodArray<z.ZodString, "many">>>;
}, "strip", z.ZodTypeAny, {
    hierarchy?: string;
    level?: string;
    properties?: string[];
    dimension?: string;
}, {
    hierarchy?: string;
    level?: string;
    properties?: string[];
    dimension?: string;
}>;
declare function makeChartMeasureSchema(): z.ZodObject<{
    dimension: z.ZodEnum<["Measures"]>;
    measure: z.ZodString;
}, "strip", z.ZodTypeAny, {
    measure?: string;
    dimension?: "Measures";
}, {
    measure?: string;
    dimension?: "Measures";
}>;

declare abstract class BaseDimensionMemberRetriever extends BaseRetriever {
    model: Signal<string>;
    cube: Signal<string>;
}
declare const MEMBER_RETRIEVER_TOKEN: InjectionToken<BaseDimensionMemberRetriever>;
declare function createDimensionMemberRetrieverTool(retriever: BaseDimensionMemberRetriever, model?: Signal<string>, cube?: Signal<string>): DynamicStructuredTool<z.ZodObject<{
    modelId: z.ZodString;
    cube: z.ZodString;
    dimension: z.ZodString;
    hierarchy: z.ZodOptional<z.ZodString>;
    level: z.ZodOptional<z.ZodString>;
    member: z.ZodString;
}, "strip", z.ZodTypeAny, {
    modelId?: string;
    cube?: string;
    dimension?: string;
    hierarchy?: string;
    level?: string;
    member?: string;
}, {
    modelId?: string;
    cube?: string;
    dimension?: string;
    hierarchy?: string;
    level?: string;
    member?: string;
}>, {
    modelId?: string;
    cube?: string;
    dimension?: string;
    hierarchy?: string;
    level?: string;
    member?: string;
}, {
    modelId?: string;
    cube?: string;
    dimension?: string;
    hierarchy?: string;
    level?: string;
    member?: string;
}, string>;
declare function injectDimensionMemberRetrieverTool(model: Signal<string>, cube: Signal<string>): DynamicStructuredTool<z.ZodObject<{
    modelId: z.ZodString;
    cube: z.ZodString;
    dimension: z.ZodString;
    hierarchy: z.ZodOptional<z.ZodString>;
    level: z.ZodOptional<z.ZodString>;
    member: z.ZodString;
}, "strip", z.ZodTypeAny, {
    modelId?: string;
    cube?: string;
    dimension?: string;
    hierarchy?: string;
    level?: string;
    member?: string;
}, {
    modelId?: string;
    cube?: string;
    dimension?: string;
    hierarchy?: string;
    level?: string;
    member?: string;
}>, {
    modelId?: string;
    cube?: string;
    dimension?: string;
    hierarchy?: string;
    level?: string;
    member?: string;
}, {
    modelId?: string;
    cube?: string;
    dimension?: string;
    hierarchy?: string;
    level?: string;
    member?: string;
}, string>;
declare function injectDimensionMemberTool(): DynamicStructuredTool<z.ZodObject<{
    modelId: z.ZodString;
    cube: z.ZodString;
    dimension: z.ZodString;
    hierarchy: z.ZodOptional<z.ZodString>;
    level: z.ZodOptional<z.ZodString>;
    member: z.ZodString;
}, "strip", z.ZodTypeAny, {
    modelId?: string;
    cube?: string;
    dimension?: string;
    hierarchy?: string;
    level?: string;
    member?: string;
}, {
    modelId?: string;
    cube?: string;
    dimension?: string;
    hierarchy?: string;
    level?: string;
    member?: string;
}>, {
    modelId?: string;
    cube?: string;
    dimension?: string;
    hierarchy?: string;
    level?: string;
    member?: string;
}, {
    modelId?: string;
    cube?: string;
    dimension?: string;
    hierarchy?: string;
    level?: string;
    member?: string;
}, string>;

declare function injectChartCommand(logic: Signal<string>, createChart: (chart: {
    logic: string;
}) => Promise<string>): string;

declare class NgmTransformScaleDirective {
    #private;
    private host;
    readonly width: i0.InputSignal<string | number>;
    readonly height: i0.InputSignal<string | number>;
    readonly targetWidth: i0.InputSignal<string | number>;
    readonly targetHeight: i0.InputSignal<string | number>;
    readonly disabled: i0.InputSignalWithTransform<boolean, string | boolean>;
    readonly _width: i0.WritableSignal<number>;
    readonly _height: i0.WritableSignal<number>;
    readonly _targetWidth: i0.WritableSignal<number>;
    readonly _targetHeight: i0.WritableSignal<number>;
    readonly hostWidth: i0.Signal<string | number>;
    readonly hostHeight: i0.Signal<string | number>;
    readonly hostTargetWidth: i0.Signal<string | number>;
    readonly hostTargetHeight: i0.Signal<string | number>;
    get scale(): string;
    get transformOrigin(): string;
    get marginLeft(): number;
    get marginTop(): number;
    observer: ResizeObserver;
    parentObserver: ResizeObserver;
    constructor();
    static ɵfac: i0.ɵɵFactoryDeclaration<NgmTransformScaleDirective, never>;
    static ɵdir: i0.ɵɵDirectiveDeclaration<NgmTransformScaleDirective, "[ngmTransformScale]", never, { "width": { "alias": "width"; "required": false; "isSignal": true; }; "height": { "alias": "height"; "required": false; "isSignal": true; }; "targetWidth": { "alias": "targetWidth"; "required": false; "isSignal": true; }; "targetHeight": { "alias": "targetHeight"; "required": false; "isSignal": true; }; "disabled": { "alias": "ngmTransformDisabled"; "required": false; "isSignal": true; }; }, {}, never, never, true, never>;
}

declare class ResizeObserverDirective implements OnDestroy {
    private el;
    debounceTime: number;
    sizeChange: EventEmitter<any>;
    private resize$;
    private _subscriber;
    constructor(el: ElementRef);
    _resizeCallback(entry: any): void;
    ngOnDestroy(): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<ResizeObserverDirective, never>;
    static ɵdir: i0.ɵɵDirectiveDeclaration<ResizeObserverDirective, "[resizeObserver]", never, { "debounceTime": { "alias": "resizeDebounceTime"; "required": false; }; }, { "sizeChange": "sizeChange"; }, never, never, true, never>;
}

declare class EntriesPipe implements PipeTransform {
    transform<T>(value: T, args?: any): [keyof T, any][];
    static ɵfac: i0.ɵɵFactoryDeclaration<EntriesPipe, never>;
    static ɵpipe: i0.ɵɵPipeDeclaration<EntriesPipe, "entries", true>;
}

declare class SafePipe implements PipeTransform {
    protected sanitizer: DomSanitizer;
    constructor(sanitizer: DomSanitizer);
    transform(value: any, type: string): SafeHtml | SafeStyle | SafeScript | SafeUrl | SafeResourceUrl;
    static ɵfac: i0.ɵɵFactoryDeclaration<SafePipe, never>;
    static ɵpipe: i0.ɵɵPipeDeclaration<SafePipe, "safe", true>;
}

declare class KeysPipe implements PipeTransform {
    transform(value: object, args?: any): Array<string>;
    static ɵfac: i0.ɵɵFactoryDeclaration<KeysPipe, never>;
    static ɵpipe: i0.ɵɵPipeDeclaration<KeysPipe, "keys", true>;
}

declare class PropertyPipe implements PipeTransform {
    transform(value: Record<string, unknown>, ...args: [string]): unknown;
    static ɵfac: i0.ɵɵFactoryDeclaration<PropertyPipe, never>;
    static ɵpipe: i0.ɵɵPipeDeclaration<PropertyPipe, "property", true>;
}

/**
 * @deprecated Migrate to `@xpert-ai/ocap-angular/core`
 */
declare class NxCoreModule {
    static forRoot(): ModuleWithProviders<NxCoreModule>;
    static ɵfac: i0.ɵɵFactoryDeclaration<NxCoreModule, never>;
    static ɵmod: i0.ɵɵNgModuleDeclaration<NxCoreModule, never, [typeof NgmTransformScaleDirective, typeof ResizeObserverDirective, typeof i3.NgmShortNumberPipe, typeof EntriesPipe, typeof SafePipe, typeof KeysPipe, typeof PropertyPipe], [typeof KeysPipe, typeof EntriesPipe, typeof PropertyPipe, typeof SafePipe, typeof ResizeObserverDirective, typeof NgmTransformScaleDirective, typeof i3.NgmShortNumberPipe]>;
    static ɵinj: i0.ɵɵInjectorDeclaration<NxCoreModule>;
}

declare class NgmDndDirective {
    fileOver: boolean;
    fileDropped: EventEmitter<FileList>;
    onDragOver(evt: any): void;
    onDragLeave(evt: any): void;
    ondrop(evt: any): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<NgmDndDirective, never>;
    static ɵdir: i0.ɵɵDirectiveDeclaration<NgmDndDirective, "[ngmDnd]", never, {}, { "fileDropped": "fileDropped"; }, never, never, true, never>;
}

interface IsDirty {
    isDirty(): boolean;
    /**
     * @deprecated use isDirty function instead
     */
    isDirty$?: Observable<boolean> | boolean | (() => boolean);
}

/**
 * This directive dynamically adjusts the number of columns in a grid layout
 * based on the width of the host element. It uses the WaResizeObserver to
 * monitor changes in the element's size and recalculates the number of columns
 * that can fit within the current width.
 *
 * Example usage:
 * <div ngmDynamicGrid colWidth="280" box="content-box">
 *   <!-- Grid items here -->
 * </div>
 */
declare class DynamicGridDirective {
    private el;
    private renderer;
    readonly entries$: ResizeObserverService;
    elementWidth: i0.WritableSignal<number>;
    readonly colWidth: i0.InputSignalWithTransform<number, string | number>;
    constructor(el: ElementRef, renderer: Renderer2);
    private initializeSignalEffect;
    static ɵfac: i0.ɵɵFactoryDeclaration<DynamicGridDirective, never>;
    static ɵdir: i0.ɵɵDirectiveDeclaration<DynamicGridDirective, "[ngmDynamicGrid]", never, { "colWidth": { "alias": "colWidth"; "required": false; "isSignal": true; }; }, {}, never, never, true, [{ directive: typeof i1.WaResizeObserver; inputs: { "box": "box"; }; outputs: { "waResizeObserver": "waResizeObserver"; }; }]>;
}

declare const filterNil: rxjs.MonoTypeOperatorFunction<any>;
declare const isNotEqual: (value: any, other: any) => boolean;
declare const isNotEmpty: (value?: any) => boolean;
/**
 *@hidden
 */
declare function cloneArray(array: any[], deep?: boolean): any[];
/**
 * Doesn't clone leaf items
 * @hidden
 */
declare function cloneHierarchicalArray(array: any[], childDataKey: any): any[];
/**
 * Deep clones all first level keys of Obj2 and merges them to Obj1
 * @param obj1 Object to merge into
 * @param obj2 Object to merge from
 * @returns Obj1 with merged cloned keys from Obj2
 * @hidden
 */
declare function mergeObjects(obj1: {}, obj2: {}): any;
/**
 * Creates deep clone of provided value.
 * Supports primitive values, dates and objects.
 * If passed value is array returns shallow copy of the array.
 * @param value value to clone
 * @returns Deep copy of provided value
 *@hidden
 */
declare function cloneValue(value: any): any;
/**
 * Checks if provided variable is Date
 * @param value Value to check
 * @returns true if provided variable is Date
 *@hidden
 */
declare function isDate(value: any): boolean;
/**
 *@hidden
 */
declare const enum KEYCODES {
    ENTER = 13,
    SPACE = 32,
    ESCAPE = 27,
    LEFT_ARROW = 37,
    UP_ARROW = 38,
    RIGHT_ARROW = 39,
    DOWN_ARROW = 40,
    F2 = 113,
    TAB = 9,
    CTRL = 17,
    Z = 90,
    Y = 89,
    X = 88,
    BACKSPACE = 8,
    DELETE = 46,
    INPUT_METHOD = 229
}
/**
 *@hidden
 */
declare const enum KEYS {
    ENTER = "Enter",
    SPACE = " ",
    SPACE_IE = "Spacebar",
    ESCAPE = "Escape",
    ESCAPE_IE = "Esc",
    LEFT_ARROW = "ArrowLeft",
    LEFT_ARROW_IE = "Left",
    UP_ARROW = "ArrowUp",
    UP_ARROW_IE = "Up",
    RIGHT_ARROW = "ArrowRight",
    RIGHT_ARROW_IE = "Right",
    DOWN_ARROW = "ArrowDown",
    DOWN_ARROW_IE = "Down",
    F2 = "F2",
    TAB = "Tab",
    SEMICOLON = ";",
    HOME = "Home",
    END = "End"
}
/**
 *@hidden
 * Returns the actual size of the node content, using Range
 * ```typescript
 * let range = document.createRange();
 * let column = this.grid.columnList.filter(c => c.field === 'ID')[0];
 *
 * let size = getNodeSizeViaRange(range, column.cells[0].nativeElement);
 * ```
 */
declare function getNodeSizeViaRange(range: Range, node: any): number;
/**
 *@hidden
 */
declare function isIE(): boolean;
/**
 *@hidden
 */
declare function isEdge(): boolean;
/**
 *@hidden
 */
declare function isFirefox(): boolean;
/**
 * @deprecated
 * @hidden
 */
declare class PlatformUtil {
    private platformId;
    isBrowser: boolean;
    isIOS: boolean;
    constructor(platformId: Object);
    static ɵfac: i0.ɵɵFactoryDeclaration<PlatformUtil, never>;
    static ɵprov: i0.ɵɵInjectableDeclaration<PlatformUtil>;
}
/**
 * @hidden
 */
declare function isLeftClick(event: PointerEvent): boolean;
/** @hidden */
declare function isNavigationKey(key: string): boolean;
declare const NAVIGATION_KEYS: Set<string>;
declare const ROW_EXPAND_KEYS: Set<string>;
declare const ROW_COLLAPSE_KEYS: Set<string>;
declare const SUPPORTED_KEYS: Set<string>;
/**
 * @hidden
 * @internal
 *
 * Creates a new ResizeObserver on `target` and returns it as an Observable.
 * Run the resizeObservable outside angular zone, because it patches the MutationObserver which causes an infinite loop.
 * Related issue: https://github.com/angular/angular/issues/31712
 */
declare function resizeObservable(target: HTMLElement): Observable<ResizeObserverEntry[]>;
/**
 * @deprecated use `booleanAttribute` instead
 */
declare function convertToBoolProperty(val: any): boolean;
/** Button events to pass to `DebugElement.triggerEventHandler` for RouterLink event handler */
declare const ButtonClickEvents: {
    left: {
        button: number;
    };
    right: {
        button: number;
    };
};
/** Simulate element click. Defaults to mouse left-button click event. */
declare function click(el: DebugElement | HTMLElement, eventObj?: any): void;
declare function makeid(length: any): string;
declare const mkenum: <T extends {
    [index: string]: U;
}, U extends string>(x: T) => T;
declare function includeIgnoreCase(text: any, target: any): RegExpMatchArray;
/**
 * 分解高亮字符串
 *
 * @param text
 * @param highlight
 * @returns
 */
declare function splitByHighlight(text: any, highlight: any): Array<{
    value: string;
    match?: boolean;
}>;
declare function createEventEmitter<T>(observable: Observable<T>, options?: {
    unsubscribe?: Observable<any>;
    isAsync?: boolean;
}): EventEmitter<T>;
declare function convertTableToCSV(columns: any, data: any): string;
declare function flatPivotColumns(columns: PivotColumn[]): any[];
declare function convertQueryResultColumns(schema: any): any[];
declare function getErrorMessage(err: any): string;
/**
 * Copilot
 */
declare function zodToProperties(obj: ZodType<any, ZodTypeDef, any>): any;
/**
 * Convert snake case object to camel case
 *
 * @param obj
 * @returns
 */
declare function camelCaseObject(obj: Record<string, any>): Record<string, any>;
type WorkBook = any;
declare function readExcelWorkSheets<T = unknown>(file: File): Promise<{
    fileName: string;
    name: string;
    columns: any[];
    data: T[];
}[]>;
declare function readExcelJson<T = unknown>(wSheet: WorkBook, fileName?: string): Promise<{
    fileName: string;
    name: string;
    columns: any[];
    data: T[];
}[]>;

interface Hierarchy {
    parentChild?: RecursiveHierarchyType;
    leveled?: Array<string>;
}
/**
 * @deprecated 使用 { RecursiveHierarchyType}
 */
interface ParentChild {
    parent: string;
    child: string;
    siblingsOrder?: SiblingsOrder;
    direction?: string;
    level?: string;
    drillState?: string;
    descendantCount?: string;
}
interface SiblingsOrder {
    by: string;
    direction: 'ASC' | 'DESC';
}
interface PropertyRecursiveHierarchy {
    propertyName: PropertyName;
    propertyLabel: string;
    recursiveHierarchy: RecursiveHierarchyType;
}
interface PropertyValueHelp {
    valueListAnnotation: ValueListAnnotation;
    recursiveHierarchies: Array<PropertyRecursiveHierarchy>;
}

declare function rgb2hex(color: string): string;
declare function isRGBColor(color: string): boolean;
declare const ColorPalettes: {
    label: string;
    colors: ({
        colors: string[];
        keywords?: undefined;
    } | {
        colors: string[];
        keywords: string[];
    })[];
}[];

/**
 * @deprecated use FilterControlType
 */
declare enum ControlType {
    auto = "auto",
    /**
     * @deprecated
     */
    date = "Date",
    /**
     * @deprecated
     */
    dateTimePicker = "dateTimePicker",
    dropDownList = "dropDownList",
    input = "input",
    checkBox = "checkBox"
}
declare enum TypeAheadType {
    Local = "Local",
    Remote = "Remote"
}
type TypeAhead = {
    type: TypeAheadType;
    text?: string;
    required?: boolean;
    minimum?: number;
};

declare const BackdropFilterEnum: {
    'blur-sm': string;
    blur: string;
    'blur-md': string;
    'blur-lg': string;
    'blur-xl': string;
    'blur-2xl': string;
    'blur-3xl': string;
    'brightness-50': string;
    'brightness-75': string;
    'brightness-100': string;
    'brightness-125': string;
    'brightness-150': string;
    'brightness-200': string;
    'contrast-0': string;
    'contrast-50': string;
    'contrast-75': string;
    'contrast-100': string;
    'contrast-125': string;
    'contrast-150': string;
    'contrast-200': string;
    'grayscale-0': string;
    grayscale: string;
    'hue-rotate-0': string;
    'hue-rotate-15': string;
    'hue-rotate-30': string;
    'hue-rotate-60': string;
    'hue-rotate-90': string;
    'hue-rotate-180': string;
    'invert-0': string;
    invert: string;
    'opacity-10': string;
    'saturate-50': string;
    'sepia-0': string;
    sepia: string;
};
declare const FilterEnum: {
    'blur-none': string;
    'blur-sm': string;
    blur: string;
    'blur-md': string;
    'blur-lg': string;
    'blur-xl': string;
    'blur-2xl': string;
    'blur-3xl': string;
    'brightness-0': string;
    'brightness-50': string;
    'brightness-75': string;
    'brightness-90': string;
    'brightness-95': string;
    'brightness-100': string;
    'brightness-105': string;
    'brightness-110': string;
    'brightness-125': string;
    'brightness-150': string;
    'brightness-200': string;
    'contrast-0': string;
    'contrast-50': string;
    'contrast-75': string;
    'contrast-100': string;
    'contrast-125': string;
    'contrast-150': string;
    'contrast-200': string;
    'drop-shadow-sm': string;
    'drop-shadow': string;
    'drop-shadow-md': string;
    'drop-shadow-lg': string;
    'drop-shadow-xl': string;
    'drop-shadow-2xl': string;
    'drop-shadow-none': string;
    'grayscale-0': string;
    grayscale: string;
    'hue-rotate-0': string;
    'hue-rotate-15': string;
    'hue-rotate-30': string;
    'hue-rotate-60': string;
    'hue-rotate-90': string;
    'hue-rotate-180': string;
    'invert-0': string;
    invert: string;
    'saturate-0': string;
    'saturate-50': string;
    'saturate-100': string;
    'saturate-150': string;
    'saturate-200': string;
    'sepia-0': string;
    sepia: string;
};

interface IBaseEventArgs {
    /**
     * Provides reference to the owner component.
     */
    owner?: any;
}
interface CancelableEventArgs {
    /**
     * Provides the ability to cancel the event.
     */
    cancel: boolean;
}
interface CancelableBrowserEventArgs extends CancelableEventArgs {
    /** Browser event */
    event?: Event;
}

interface IFilterChangedEventArgs extends IBaseEventArgs {
    name: string;
    filter?: IFilter;
}
/**
 * 抽象 Filter 组件接口， 实现包括普通 Filter 组件和广义 Filter 组件如
 * {@link NxAnalyticalCardComponent}, {@link NxSmartChartsComponent}, {@link NxSmartFilterComponent}, {@link NxAbstractFilterDirective}
 */
interface IFilterChange {
    /**
     * Output filter change event
     */
    filterChange?: EventEmitter<IFilter[]>;
}

interface SmartEntityDataOptions<T> extends EntityBusinessState {
    selectionVariant?: SelectionVariant;
    presentationVariant?: PresentationVariant;
}

/**
 * @deprecated use {@link FilterSelectionType}
 */
declare enum InputControlSelectionType {
    Multiple = "Multiple",
    Single = "Single"
}
/**
 * 树状结构的选择模式
 */
declare enum TreeSelectionMode {
    Individual = "Individual",// 每个节点独立选择
    ParentOnly = "ParentOnly",// 只输出 Parent
    LeafOnly = "LeafOnly",// 只输出 Leaf
    ParentChild = "ParentChild"
}
interface PropertyOptions {
    propertyName?: Dimension;
}
type PropertyFilterOptions = Partial<{
    dataSettings: DataSettings;
    allowViewerModify: boolean;
    allowViewersDelete: boolean;
    selctionType: InputControlSelectionType;
    selectionMode: TreeSelectionMode;
}> & PropertyOptions;
declare enum PresentationEnum {
    Flat = 0,
    Hierarchy = 1
}
/**
 * @deprecated
 */
interface PropertyValueHelpOptions extends PropertyFilterOptions {
    presentation?: PresentationEnum;
    showUnbooked?: boolean;
    showOnlyLeaves?: boolean;
    hideInControls?: boolean;
    slicer: ISlicer;
}
interface SmartFilterDataOptions<T> extends SmartEntityDataOptions<T>, PropertyOptions {
    typeAhead: TypeAhead;
    recursiveHierarchy: RecursiveHierarchyType;
    cascadingEffect: boolean;
    showAllMember: boolean;
}
interface FilterOptions {
    label?: string;
    placeholder?: string;
    presentation?: PresentationEnum;
    selctionType: InputControlSelectionType;
    searchable: boolean;
}
interface SmartFilterBarDataOptions extends SmartEntityDataOptions<unknown> {
    dataSettings: DataSettings;
    filters: Array<Partial<SmartFilterDataOptions<unknown>>>;
    today: {
        enable: boolean;
        granularity: TimeGranularity;
    };
}

interface IntentNavigation {
    /**
     * Name of the Semantic Object
     */
    semanticObject: string;
    /**
     * Name of the Action on the Semantic Object. If not specified, let user choose which of the available actions to trigger.
     */
    action: string;
    /**
     * Maps properties of the annotated entity type to properties of the Semantic Object
     */
    mapping: SemanticObjectMappingType[];
}
interface Intent {
    /**
     * Name of the Semantic Object
     */
    semanticObject: string;
    /**
     * Name of the Action on the Semantic Object. If not specified, let user choose which of the available actions to trigger.
     */
    action: string;
    /**
     * Parameters of Semantic Object
     */
    parameters: {
        [key: string]: any;
    };
}

interface NxPaging {
    paging: boolean;
    pageNo: number;
    pageSize: number;
    /**
     * Returns the total number of records.
     * @remarks
     * Only functions when paging is enabled.
     * @example
     * ```typescript
     * const totalRecords = this.grid.totalRecords;
     * ```
     */
    totalRecords: number;
    /**
     * Returns if the current page is the last page.
     * @example
     * ```typescript
     * const lastPage = this.grid.isLastPage;
     * ```
     */
    isLastPage: boolean;
    /**
     * Gets if the current page is the first page.
     * @example
     * ```typescript
     * const firstPage = this.grid.isFirstPage;
     * ```
     */
    isFirstPage: boolean;
    /**
     * Goes to the desired page index.
     * @example
     * ```typescript
     * this.grid1.paginate(1);
     * ```
     * @param val
     */
    paginate(val: number): void;
    /**
     * Goes to the previous page, if the grid is not already at the first page.
     * @example
     * ```typescript
     * this.grid1.previousPage();
     * ```
     */
    previousPage(): void;
    /**
     * Goes to the next page, if the grid is not already at the last page.
     * @example
     * ```typescript
     * this.grid1.nextPage();
     * ```
     */
    nextPage(): void;
}

/**
 * @deprecated
 */
interface QuerySettings {
    ignoreUnknownProperty: boolean;
}

interface SortPropDir {
    dir: SortDirection;
    prop: ColumnProp;
}
declare enum SortDirection {
    asc = "asc",
    desc = "desc"
}
type ColumnProp = string | number;

type SemanticExpression = {
    negative?: string;
    critical?: string;
    positive?: string;
    neutral?: string;
    information?: string;
} | ((rawRow: any) => string);
declare enum SemanticStyle {
    'border-left' = "border-left",
    'border-right' = "border-right",
    'border-top' = "border-top",
    'border-bottom' = "border-bottom",
    'color' = "color",
    'background' = "background"
}
interface Semantic {
    style?: SemanticStyle;
    expression: SemanticExpression;
}
/**
 * Table Column 可展现的界面类型
 * * Text 纯文本
 * * Number 数量, 可能需要细化带单位展示如货币, 需要 Property
 * * Chart 图形展示, 需要 ChartAnnotation
 * * BulletChart 子弹图, 需要 DataPointAnnotation
 * * Progress 进度条, 需要 DataPointAnnotation
 * * Rating 星级, 需要 DataPointAnnotation
 * * Donut 圆形进度条, 需要 DataPointAnnotation
 * * DeltaBulletChart 增量子弹图, 需要 DataPointAnnotation
 */
type TableColumnType = 'Text' | 'Number' | 'Chart' | 'BulletChart' | 'Progress' | 'Rating' | 'Donut' | 'DeltaBulletChart';
/**
 * @hidden
 */
declare const DataType: {
    String: "string";
    Number: "number";
    Boolean: "boolean";
    Date: "date";
    Currency: "currency";
    Percent: "percent";
};
type DataType = (typeof DataType)[keyof typeof DataType];
/**
 * @deprecated who using
 *
 * Table Column 属性配置
 */
interface TableColumn {
    property?: Property;
    dimension: Dimension;
    name: string;
    label?: string;
    dataType?: any;
    type?: DataType;
    pipeArgs?: IColumnPipeArgs;
    editable: boolean;
    filterable: boolean;
    columnType: TableColumnType;
    sortDir?: SortDirection;
    hidden?: boolean;
    pinned?: boolean;
    movable?: boolean;
    resizable?: boolean;
    width?: string;
    sortable?: boolean;
    selectable?: boolean;
    groupable?: boolean;
    frozenLeft?: boolean;
    cellClass?: string | ((data: any) => string | any);
    cellClasses?: any;
    text?: TableColumn;
    unit?: Property;
    cellTemplate?: TemplateRef<any>;
    headerTemplate?: TemplateRef<any>;
    formatter?: (value: any) => any;
    hasSummary?: boolean;
    semantic?: Semantic | Array<Semantic>;
    intent?: IntentNavigation;
    navigation?: any;
    selectOptions: Array<{
        value: any;
        label: string;
    }>;
}
declare function convertPropertyToTableColumn(dimension: Dimension, property: string | Property): TableColumn;
interface IColumnPipeArgs {
    /** The date/time components that a date column will display, using predefined options or a custom format string. */
    format?: string;
    /** A timezone offset (such as '+0430'), or a standard UTC/GMT or continental US timezone abbreviation. */
    timezone?: string;
    /**
     * Decimal representation options, specified by a string in the following format:
     * `{minIntegerDigits}`.`{minFractionDigits}`-`{maxFractionDigits}`.
     * `minIntegerDigits`: The minimum number of integer digits before the decimal point. Default is 1.
     * `minFractionDigits`: The minimum number of digits after the decimal point. Default is 0.
     * `maxFractionDigits`: The maximum number of digits after the decimal point. Default is 3.
     */
    digitsInfo?: string;
    /** The currency code of type string, default value undefined */
    currencyCode?: string;
    /**
     * Allow us to display currency 'symbol' or 'code' or 'symbol-narrow' or our own string.
     * The value is of type string. By default is set to 'symbol'
     */
    display?: string;
}

declare enum TimeRangeEnum {
    Today = "Today",
    Last7Days = "Last7Days",
    Last4Weeks = "Last4Weeks",
    Last3Months = "Last3Months",
    MonthToDate = "MonthToDate",
    QuarterToDate = "QuarterToDate",
    YearToDate = "YearToDate",
    All = "All"
}
declare const TimeRangeOptions: {
    value: TimeRangeEnum;
    label: {
        en_US: string;
        zh_Hans: string;
    };
}[];
declare function calcTimeRange(value: TimeRangeEnum): string[];

declare class FilterPipe implements PipeTransform {
    transform(input: any, fn: (item: any) => any): any;
    static ɵfac: i0.ɵɵFactoryDeclaration<FilterPipe, never>;
    static ɵpipe: i0.ɵɵPipeDeclaration<FilterPipe, "filter", false>;
}
declare class NgFilterPipeModule {
    static ɵfac: i0.ɵɵFactoryDeclaration<NgFilterPipeModule, never>;
    static ɵmod: i0.ɵɵNgModuleDeclaration<NgFilterPipeModule, [typeof FilterPipe], never, [typeof FilterPipe]>;
    static ɵinj: i0.ɵɵInjectorDeclaration<NgFilterPipeModule>;
}

declare class MapPipe implements PipeTransform {
    transform(input: any, fn: (item: any) => any): any;
    static ɵfac: i0.ɵɵFactoryDeclaration<MapPipe, never>;
    static ɵpipe: i0.ɵɵPipeDeclaration<MapPipe, "map", false>;
}
declare class NgMapPipeModule {
    static ɵfac: i0.ɵɵFactoryDeclaration<NgMapPipeModule, never>;
    static ɵmod: i0.ɵɵNgModuleDeclaration<NgMapPipeModule, [typeof MapPipe], never, [typeof MapPipe]>;
    static ɵinj: i0.ɵɵInjectorDeclaration<NgMapPipeModule>;
}

declare class ReversePipe implements PipeTransform {
    transform(input: any): any;
    static ɵfac: i0.ɵɵFactoryDeclaration<ReversePipe, never>;
    static ɵpipe: i0.ɵɵPipeDeclaration<ReversePipe, "reverse", true>;
}

declare class IsNilPipe implements PipeTransform {
    transform(value: any): boolean;
    static ɵfac: i0.ɵɵFactoryDeclaration<IsNilPipe, never>;
    static ɵpipe: i0.ɵɵPipeDeclaration<IsNilPipe, "isNil", true>;
}

declare class CapitalizePipe implements PipeTransform {
    transform(value: string): string;
    static ɵfac: i0.ɵɵFactoryDeclaration<CapitalizePipe, never>;
    static ɵpipe: i0.ɵɵPipeDeclaration<CapitalizePipe, "capitalize", true>;
}

declare class KebabToCamelCasePipe implements PipeTransform {
    transform(value: string): string;
    static ɵfac: i0.ɵɵFactoryDeclaration<KebabToCamelCasePipe, never>;
    static ɵpipe: i0.ɵɵPipeDeclaration<KebabToCamelCasePipe, "kebabToCamelCase", true>;
}

declare class MaskPipe implements PipeTransform {
    transform(value: string, visibleStart?: number, visibleEnd?: number): string;
    static ɵfac: i0.ɵɵFactoryDeclaration<MaskPipe, never>;
    static ɵpipe: i0.ɵɵPipeDeclaration<MaskPipe, "mask", true>;
}

declare class FileTypePipe implements PipeTransform {
    transform(fileName: string): string;
    static ɵfac: i0.ɵɵFactoryDeclaration<FileTypePipe, never>;
    static ɵpipe: i0.ɵɵPipeDeclaration<FileTypePipe, "fileType", true>;
}

declare class ArraySlicePipe implements PipeTransform {
    transform<T>(input: Array<T>, start: number, end: number): Array<T>;
    static ɵfac: i0.ɵɵFactoryDeclaration<ArraySlicePipe, never>;
    static ɵpipe: i0.ɵɵPipeDeclaration<ArraySlicePipe, "slice", true>;
}

declare class FilterByPipe implements PipeTransform {
    transform<T>(items: T[], predicate: (item: T, ...args: any[]) => boolean, ...args: any[]): T[];
    static ɵfac: i0.ɵɵFactoryDeclaration<FilterByPipe, never>;
    static ɵpipe: i0.ɵɵPipeDeclaration<FilterByPipe, "filterBy", true>;
}

declare class AsteriskPipe implements PipeTransform {
    transform(value: string): string;
    static ɵfac: i0.ɵɵFactoryDeclaration<AsteriskPipe, never>;
    static ɵpipe: i0.ɵɵPipeDeclaration<AsteriskPipe, "asterisk", true>;
}

/**
 * Compatible with both `i18next` and `@ngx-translate` frameworks, distinguished by whether there is a `namespace` in key or params.
 *
 * ```html
 * <!-- i18next -->
 * <div>{{'ns:key' | translate: {Default: 'default value'} }}</div>
 * <div>{{'key' | translate: {ns: 'name', Default: 'default value'} }}</div>
 * <!-- @ngx-translate -->
 * <div>{{'pac.key' | translate: {Default: 'default value'} }}</div>
 * ```
 */
declare class TranslatePipe implements PipeTransform {
    readonly translate: TranslateService;
    transform(key: string, options?: {
        ns?: string;
        Default?: string;
    } & Record<string, string>): string;
    static ɵfac: i0.ɵɵFactoryDeclaration<TranslatePipe, never>;
    static ɵpipe: i0.ɵɵPipeDeclaration<TranslatePipe, "translate", true>;
}

declare class FileExtensionPipe implements PipeTransform {
    transform(fileName: string): string;
    static ɵfac: i0.ɵɵFactoryDeclaration<FileExtensionPipe, never>;
    static ɵpipe: i0.ɵɵPipeDeclaration<FileExtensionPipe, "fileExtension", true>;
}

/**
 * @deprecated
 * SmartCharts 组件的图形界面复杂度, 在不同的尺寸下需要不同的界面复杂度, 如全屏显示时可以显示及其全面的界面
 * 复杂度对于每一种图形需要不同的设置
 */
declare enum ChartComplexity {
    Minimalist = "Minimalist",// 极简
    Concise = "Concise",// 简约
    Normal = "Normal",// 正常
    Comprehensive = "Comprehensive",// 全面
    Extremely = "Extremely"
}
/**
 * @deprecated
 */
declare enum NxChartLibrary {
    echarts = "echarts",
    'antv-g2' = "antv-g2",
    chartjs = "chartjs",
    'ngx-charts' = "ngx-charts"
}
/**
 * @deprecated
 */
interface NxChromatics {
    [key: string]: NxChromatic;
}
/**
 * @deprecated
 * 颜色序列维度定义
 */
interface NxChromatic {
    chromatic?: string;
    chromaticName?: string;
    selectedDim?: string;
    reverse?: boolean;
    selectedColor?: string;
    domain?: [number, number];
    scale?: any;
}
/**
 * @deprecated
 */
declare enum NxChromaticType {
    Single = "Single",// 单个颜色
    Sequential = "Sequential",// 渐变颜色序列
    Categorical = "Categorical"
}
/**
 * @deprecated use ChartTypeEnum
 */
declare enum NxChartType {
    Column = "Column",
    ColumnStacked = "ColumnStacked",
    ColumnDual = "ColumnDual",
    ColumnStackedDual = "ColumnStackedDual",
    ColumnStacked100 = "ColumnStacked100",
    ColumnStackedDual100 = "ColumnStackedDual100",
    ColumnGrouped = "ColumnGrouped",
    ColumnPolar = "ColumnPolar",
    Bar = "Bar",
    BarStacked = "BarStacked",
    BarDual = "BarDual",
    BarStackedDual = "BarStackedDual",
    BarStacked100 = "BarStacked100",
    BarStackedDual100 = "BarStackedDual100",
    BarGrouped = "BarGrouped",
    BarPolar = "BarPolar",
    Histogram = "Histogram",
    Area = "Area",
    AreaStacked = "AreaStacked",
    AreaStacked100 = "AreaStacked100",
    HorizontalArea = "HorizontalArea",
    HorizontalAreaStacked = "HorizontalAreaStacked",
    HorizontalAreaStacked100 = "HorizontalAreaStacked100",
    Line = "Line",
    Lines = "Lines",
    StepLine = "StepLine",
    LineDual = "LineDual",
    Combination = "Combination",
    CombinationStacked = "CombinationStacked",
    CombinationDual = "CombinationDual",
    CombinationStackedDual = "CombinationStackedDual",
    HorizontalCombinationStacked = "HorizontalCombinationStacked",
    Pie = "Pie",
    Doughnut = "Doughnut",
    Nightingale = "Nightingale",
    Scatter = "Scatter",
    Bubble = "Bubble",
    Radar = "Radar",
    Boxplot = "Boxplot",
    Heatmap = "Heatmap",
    Treemap = "Treemap",
    Waterfall = "Waterfall",
    Bullet = "Bullet",
    VerticalBullet = "VerticalBullet",
    HorizontalWaterfall = "HorizontalWaterfall",
    HorizontalCombinationDual = "HorizontalCombinationDual",
    HorizontalCombinationStackedDual = "HorizontalCombinationStackedDual",
    Bar3D = "Bar3D",
    Line3D = "Line3D",
    Scatter3D = "Scatter3D",
    Custom = "Custom",
    GeoMap = "GeoMap",
    Timeline = "Timeline",
    Sankey = "Sankey",
    Sunburst = "Sunburst",
    RadialBar = "RadialBar",
    RadialBarStacked = "RadialBarStacked",
    RadialPie = "RadialPie",
    RadialPieStacked = "RadialPieStacked",
    RadialScatter = "RadialScatter",
    Funnel = "Funnel",
    PolarLine = "PolarLine",
    Rose = "Rose",
    Tree = "Tree",
    ThemeRiver = "ThemeRiver"
}
/**
 * @deprecated
 */
interface NxIChartClickEvent {
    filter?: ISlicer;
    item?: any;
    data: any;
    event: MouseEvent;
}
/**
 * @deprecated
 */
interface IChartSelectedEvent {
    slicers: ISlicer[];
    event: MouseEvent;
}
/**
 * @deprecated
 */
interface ColorScheme {
    group?: string;
    name: string;
    type: NxChromaticType;
    value: any;
}

declare class NxChartService {
    protected theme$: ReplaySubject<string>;
    protected refresh$: Subject<void>;
    protected resize$: Subject<void>;
    chartLibrary$: BehaviorSubject<{
        lib: NxChartLibrary;
        registerTheme: (name: any, theme: any) => void;
    }>;
    doAction$: Subject<any>;
    chartOptions$: Subject<any>;
    /**
     * 重新计算图形大小
     */
    resize(): void;
    onResize(): Observable<void>;
    /**
     * On chart theme change event
     */
    onThemeChange(): Observable<string>;
    /**
     * Trigger the chart theme change event
     *
     * @param theme The name of EChart theme
     */
    changeTheme(theme: any): void;
    /**
     * On chart refresh event
     */
    onRefresh(): Observable<void>;
    /**
     * Refresh chart
     */
    refresh(): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<NxChartService, never>;
    static ɵprov: i0.ɵɵInjectableDeclaration<NxChartService>;
}

declare const NX_THEME_DEFAULT = "default";
interface NxThemeOptions {
    name: string;
}
declare const NX_THEME_OPTIONS: InjectionToken<NxThemeOptions>;
declare function NX_THEME_OPTIONS_FACTORY(): {
    name: string;
};
interface NxCoreState {
    themeName: string;
    today: Date;
    timeGranularity: TimeGranularity;
}
/**
 * @deprecated use NgmOcapCoreService instead
 */
declare class NxCoreService extends ComponentStore<NxCoreState> {
    protected options: NxThemeOptions;
    private _intent$;
    /**
     * Theme name for charts
     */
    readonly themeName$: Observable<string>;
    private themeChanges$;
    readonly store: ComponentStore<{
        query?: QuerySettings;
    }>;
    readonly query$: Observable<QuerySettings>;
    readonly updateQuery: (observableOrValue: QuerySettings | Observable<QuerySettings>) => rxjs.Subscription;
    readonly timeGranularity$: Observable<TimeGranularity>;
    readonly currentTime$: Observable<{
        today: Date;
        timeGranularity: TimeGranularity;
    }>;
    constructor(options: NxThemeOptions);
    sendIntent(intent: Intent): void;
    onIntent(): Subject<Intent>;
    /**
     * Change current application theme
     *
     * @param name 名称
     */
    changeTheme(name: string): void;
    /**
     * Triggered when current theme is changed
     */
    onThemeChange(): Observable<any>;
    getTheme(): string;
    static ɵfac: i0.ɵɵFactoryDeclaration<NxCoreService, never>;
    static ɵprov: i0.ɵɵInjectableDeclaration<NxCoreService>;
}

declare class NxShortNumberService {
    value$: Observable<ShortNumberType>;
    unit$: Observable<string>;
    constructor();
    /**
     * 输入数字， 输出缩短后的数字和单位
     *
     * @param number
     * @param args
     */
    transform(number: number, args?: any): ShortNumberType;
    static ɵfac: i0.ɵɵFactoryDeclaration<NxShortNumberService, never>;
    static ɵprov: i0.ɵɵInjectableDeclaration<NxShortNumberService>;
}
type ShortNumberType = {
    value: number;
    unit: string;
};

interface SmartChartTypeProvider {
    chartLib: NxChartLibrary;
    chartType: NxChartType;
}
declare const NX_SMART_CHART_TYPE: InjectionToken<SmartChartTypeProvider[]>;
type Canvas = {
    width: number;
    height: number;
};
interface NxChartSettings {
    canvas: Canvas;
}
interface NxChartComplexityOptions {
    baseOption?: any;
    minimalist: any;
    concise?: any;
    normal: any;
    comprehensive: any;
    extremely?: any;
}
interface NxIScaleChromatic {
    convertToScale(chromatic: NxChromatic): any;
    setChromatics(chromatics: NxChromatics): any;
    setUserChromatics(chromatics: NxChromatics): any;
    onChange(): Observable<NxChromatics>;
}
declare const NX_SCALE_CHROMATIC: InjectionToken<NxIScaleChromatic>;

/**
 * 作为状态管理功能的初创原型
 * @deprecated 使用 @ngneat/elf
 */
interface SelectConfig {
    distinctDeeply?: boolean;
}
/**
 * 作为状态管理功能的初创原型
 * @deprecated 使用 @ngneat/elf
 */
interface ComponentOptions<T> {
    options: T;
    inputOptions: T;
    innerOptions: T;
    defaultOptions: T;
}
/**
 * 作为状态管理功能的初创原型
 * @deprecated 使用 ComponentStore
 */
declare class OptionsStore2<T> extends ComponentStore$1<ComponentOptions<T>> {
    /**
     * 组件输入和内部改变合集
     */
    private _options$;
    readonly inputOptions$: Observable<T>;
    readonly innerOptions$: Observable<T>;
    /**
     * 最终结果
     */
    readonly options$: Observable<T>;
    /**
     * 当内部改变时发出组件输入和内部改变的合集
     */
    optionsChange: Observable<T>;
    constructor();
    readonly input: T extends void ? () => void : (observableOrValue: T | Observable<T>) => rxjs.Subscription;
    readonly patchInput: T extends void ? () => void : (observableOrValue: T | Observable<T>) => rxjs.Subscription;
    readonly patchOptions: Partial<T> extends infer T_1 ? T_1 extends Partial<T> ? T_1 extends void ? () => void : (observableOrValue: Partial<T> | Observable<Partial<T>>) => rxjs.Subscription : never : never;
    readonly patch: Partial<T> extends infer T_1 ? T_1 extends Partial<T> ? T_1 extends void ? () => void : (observableOrValue: Partial<T> | Observable<Partial<T>>) => rxjs.Subscription : never : never;
    readonly patchDefault: T extends void ? () => void : (observableOrValue: T | Observable<T>) => rxjs.Subscription;
    static ɵfac: i0.ɵɵFactoryDeclaration<OptionsStore2<any>, never>;
    static ɵprov: i0.ɵɵInjectableDeclaration<OptionsStore2<any>>;
}
/**
 * @deprecated 使用 ComponentStore
 */
declare class OptionsStore<T> {
    /**
     * 最终结果
     */
    private options$;
    /**
     * 组件输入
     */
    private _inputOptions$;
    /**
     * 内部改变
     */
    private _innerOptions$;
    /**
     * 组件输入和内部改变合集
     */
    private _options$;
    /**
     * 默认值
     */
    private _default$;
    /**
     * 当内部改变时发出组件输入和内部改变的合集
     */
    optionsChange: Observable<T>;
    constructor();
    input(options: any): void;
    patchOptions(value: Partial<T>): void;
    patchInput(value: Partial<T>): void;
    patch(value: Partial<T>): void;
    patchDefault(value: Partial<T>): void;
    get value(): T;
    get<P>(selector: (state: T) => P): P;
    get<P>(selector: string): P;
    selectInput<P>(selector?: any): Observable<any>;
    select<P>(selector: (state: T) => P, config?: SelectConfig): Observable<P>;
    select<P>(selector: string, config?: SelectConfig): Observable<P>;
    select<P>(config?: SelectConfig): Observable<P>;
    static ɵfac: i0.ɵɵFactoryDeclaration<OptionsStore<any>, never>;
    static ɵprov: i0.ɵɵInjectableDeclaration<OptionsStore<any>>;
}
declare function getSelectorFn<T, P>(selector?: any): (...args: any[]) => any;
declare function connect(store1: any, states?: any): (store2: any) => void;

declare function write<S>(updater: (state: S) => void): (state: S) => S;
interface SubStoreConfig extends StoreConfig {
    properties?: any[];
    arrayKey?: string;
}
declare class SubStore<SDef extends StoreDef = any, State = SDef['state']> extends Store<SDef, State> {
    #private;
    private parent;
    private options;
    constructor(parent: Store, storeDef: SDef, options: {
        properties?: Array<string | number>;
        arrayKey?: string;
    });
    subscribeParent(properties: Array<string | number>): Observable<any>;
    connect(properties?: Array<string | number>): this;
    disconnect(): void;
}
declare function createSubStore<T, S extends [PropsFactory<any, any>, ...PropsFactory<any, any>[]]>(parent: Store<StoreDef<T>>, storeConfig: SubStoreConfig, ...propsFactories: S): SubStore<{
    name: string;
    state: _ngneat_elf_src_lib_state.Merge<S, "props">;
    config: _ngneat_elf_src_lib_state.Merge<S, "config">;
}, _ngneat_elf_src_lib_state.Merge<S, "props">>;
type Head<State = any> = State | Partial<State>;
type DirtyCheckComparator<State> = (head: State, current: State) => boolean;
type DirtyCheckParams<T = any> = {
    comparator?: DirtyCheckComparator<Head<T>>;
    watchProperty?: keyof T | (keyof T)[];
    clean?: (head: Head<T>, current: Head<T>) => Observable<any>;
};
declare function dirtyCheck(store: Store, params?: DirtyCheckParams): {
    active: i0.WritableSignal<boolean>;
    dirty: i0.Signal<boolean>;
    setHead(): void;
    setPristine(pristine?: unknown): void;
};
declare function dirtyCheckWith(store: Store, with$: Observable<any>, params?: DirtyCheckParams): {
    active: i0.WritableSignal<boolean>;
    dirty: i0.Signal<boolean>;
};
declare function debugDirtyCheckComparator(a: any, b: any): boolean;

declare const ODATA_SRV = "ZMyOData_SRV";
declare const ODATA_URI = "/sap/opu/odata/sap/ZMyOData_SRV/";
declare const ODATA_URI_METADATA = "/sap/opu/odata/sap/ZMyOData_SRV/$metadata";
declare const ODATA_ENTITY = "MyEntity";
declare const ODATA_ENTITY_DIMENSION = "Factory";
declare const ODATA_ENTITY_VALUEHELP_PROPERTY = "Factory";
declare const ODATA_ENTITY_VALUEHELP_ENTITY = "ZTV_I_FactoryVH";
declare const ODATA_META_DATA = "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<edmx:Edmx Version=\"1.0\"\n    xmlns:edmx=\"http://schemas.microsoft.com/ado/2007/06/edmx\"\n    xmlns:m=\"http://schemas.microsoft.com/ado/2007/08/dataservices/metadata\"\n    xmlns:sap=\"http://www.sap.com/Protocols/SAPData\">\n    <edmx:Reference xmlns:edmx=\"http://docs.oasis-open.org/odata/ns/edmx\">\n        <edmx:Include Namespace=\"com.sap.vocabularies.Common.v1\" Alias=\"Common\"/>\n    </edmx:Reference>\n    <edmx:DataServices m:DataServiceVersion=\"2.0\">\n        <Schema Namespace=\"ZMyOData_SRV\" xml:lang=\"zh\" sap:schema-version=\"1\"\n            xmlns=\"http://schemas.microsoft.com/ado/2008/09/edm\">\n            <EntityType Name=\"MyEntityType\" sap:semantics=\"aggregate\" sap:label=\"My Entity\" sap:content-version=\"1\">\n                <Key>\n                    <PropertyRef Name=\"ID\"/>\n                </Key>\n                <Property Name=\"ID\" Type=\"Edm.String\" Nullable=\"false\"/>\n                <Property Name=\"Factory\" Type=\"Edm.String\" MaxLength=\"10\" sap:aggregation-role=\"dimension\" sap:display-format=\"UpperCase\" sap:text=\"FactoryName\"/>\n                <Property Name=\"FactoryName\" Type=\"Edm.String\" MaxLength=\"10\" sap:aggregation-role=\"dimension\" sap:display-format=\"UpperCase\"/>\n                <Property Name=\"ProdQuantity\" Type=\"Edm.Decimal\" Precision=\"16\" Scale=\"0\" sap:aggregation-role=\"dimension\" sap:label=\"\u4EA7\u51FA\u6570\u91CF\"/>\n                <Property Name=\"PlanQuantity\" Type=\"Edm.Decimal\" Precision=\"16\" Scale=\"0\" sap:aggregation-role=\"dimension\" sap:label=\"\u8BA1\u5212\u6570\u91CF\"/>\n                <Property Name=\"Rate\" Type=\"Edm.Decimal\" Precision=\"8\" Scale=\"0\" sap:aggregation-role=\"measure\" sap:unit=\"Percentage\" sap:filterable=\"false\"/>\n                <Property Name=\"Percentage\" Type=\"Edm.String\" MaxLength=\"3\" sap:aggregation-role=\"dimension\" sap:semantics=\"unit-of-measure\"/>\n                <Property Name=\"A\" Type=\"Edm.Decimal\" Precision=\"16\" Scale=\"0\" sap:aggregation-role=\"measure\" sap:label=\"\u5F53\u671F\"/>\n                <Property Name=\"M\" Type=\"Edm.Decimal\" Precision=\"16\" Scale=\"0\" sap:aggregation-role=\"measure\" sap:label=\"\u4E0A\u671F\"/>\n                <Property Name=\"Y\" Type=\"Edm.Decimal\" Precision=\"16\" Scale=\"0\" sap:aggregation-role=\"measure\" sap:label=\"\u540C\u671F\"/>\n            </EntityType>\n            <EntityType Name=\"ZTV_I_FactoryVHType\" sap:label=\"\u5DE5\u5382\u641C\u7D22\u5E2E\u52A9\" sap:content-version=\"1\">\n                <Key>\n                    <PropertyRef Name=\"Product\"/>\n                    <PropertyRef Name=\"Factory\"/>\n                </Key>\n                <Property Name=\"Product\" Type=\"Edm.String\" Nullable=\"false\" MaxLength=\"2\" sap:display-format=\"UpperCase\"/>\n                <Property Name=\"Factory\" Type=\"Edm.String\" Nullable=\"false\" MaxLength=\"10\" sap:display-format=\"UpperCase\" sap:text=\"FactoryName\"/>\n                <Property Name=\"FactoryName\" Type=\"Edm.String\" MaxLength=\"10\" sap:display-format=\"UpperCase\"/>\n            </EntityType>\n            <EntityType Name=\"ZSCM_C_PurExpCategoryResult\" sap:semantics=\"aggregate\" sap:label=\"\u4F9B\u5E94\u94FE\uFF1A\u91C7\u8D2D\u652F\u51FA\u5206\u6790-\u5E26\u54C1\u7C7B\u53C2\u6570\" sap:content-version=\"1\">\n                <Key>\n                    <PropertyRef Name=\"ID\"/>\n                </Key>\n                <Property Name=\"ID\" Type=\"Edm.String\" Nullable=\"false\"/>\n                <Property Name=\"OrderNo\" Type=\"Edm.String\" MaxLength=\"10\" sap:aggregation-role=\"dimension\" sap:display-format=\"UpperCase\" sap:label=\"\u8BA2\u5355\u7F16\u53F7\"/>\n                <Property Name=\"Materials\" Type=\"Edm.String\" MaxLength=\"18\" sap:aggregation-role=\"dimension\" sap:display-format=\"UpperCase\" sap:label=\"\u7269\u6599\u53F7\"/>\n                <Property Name=\"MaterialsText\" Type=\"Edm.String\" MaxLength=\"60\" sap:aggregation-role=\"dimension\" sap:display-format=\"UpperCase\" sap:label=\"\u7269\u6599\u63CF\u8FF0\"/>\n                <Property Name=\"Amount\" Type=\"Edm.Decimal\" Precision=\"17\" Scale=\"3\" sap:aggregation-role=\"measure\" sap:label=\"\u91D1\u989D\" sap:filterable=\"false\"/>\n                <Property Name=\"Quantity\" Type=\"Edm.Decimal\" Precision=\"18\" Scale=\"3\" sap:aggregation-role=\"measure\" sap:unit=\"QuantityUnit\" sap:label=\"\u6570\u91CF\" sap:filterable=\"false\"/>\n            </EntityType>\n            <EntityType Name=\"ZSCM_C_PurExpCategoryParameters\" sap:semantics=\"parameters\" sap:content-version=\"1\">\n                <Key>\n                    <PropertyRef Name=\"p_category\"/>\n                </Key>\n                <Property Name=\"p_category\" Type=\"Edm.String\" Nullable=\"false\" MaxLength=\"10\" sap:parameter=\"mandatory\" sap:label=\"\u7269\u6599\u54C1\u7C7B\" sap:creatable=\"false\" sap:updatable=\"false\" sap:sortable=\"false\" sap:filterable=\"false\"/>\n                <NavigationProperty Name=\"Results\" Relationship=\"ZMyOData_SRV.assoc_2ED98D58F9F501E27A6A88BCD5004593\" FromRole=\"FromRole_assoc_2ED98D58F9F501E27A6A88BCD5004593\" ToRole=\"ToRole_assoc_2ED98D58F9F501E27A6A88BCD5004593\"/>\n            </EntityType>\n            <Association Name=\"assoc_2ED98D58F9F501E27A6A88BCD5004593\" sap:content-version=\"1\">\n                <End Type=\"ZMyOData_SRV.ZSCM_C_PurExpCategoryParameters\" Multiplicity=\"1\" Role=\"FromRole_assoc_2ED98D58F9F501E27A6A88BCD5004593\"/>\n                <End Type=\"ZMyOData_SRV.ZSCM_C_PurExpCategoryResult\" Multiplicity=\"*\" Role=\"ToRole_assoc_2ED98D58F9F501E27A6A88BCD5004593\"/>\n            </Association>\n            <EntityContainer Name=\"ZMyOData_SRV_Entities\" m:IsDefaultEntityContainer=\"true\" sap:supported-formats=\"atom json xlsx\">\n                <EntitySet Name=\"MyEntity\" EntityType=\"ZMyOData_SRV.MyEntityType\" sap:creatable=\"false\" sap:updatable=\"false\" sap:deletable=\"false\" sap:content-version=\"1\"/>\n                <EntitySet Name=\"ZSCM_C_PurExpCategoryResults\" EntityType=\"ZMyOData_SRV.ZSCM_C_PurExpCategoryResult\" sap:creatable=\"false\" sap:updatable=\"false\" sap:deletable=\"false\" sap:addressable=\"false\" sap:content-version=\"1\"/>\n                <EntitySet Name=\"ZSCM_C_PurExpCategory\" EntityType=\"ZMyOData_SRV.ZSCM_C_PurExpCategoryParameters\" sap:creatable=\"false\" sap:updatable=\"false\" sap:deletable=\"false\" sap:pageable=\"false\" sap:content-version=\"1\"/>\n                <EntitySet Name=\"ZTV_I_FactoryVH\" EntityType=\"ZMyOData_SRV.ZTV_I_FactoryVHType\" sap:creatable=\"false\" sap:updatable=\"false\" sap:deletable=\"false\" sap:content-version=\"1\"/>\n                <AssociationSet Name=\"assoc_2ED98D58F9F501E27A6A88BCD5004593\" Association=\"ZMyOData_SRV.assoc_2ED98D58F9F501E27A6A88BCD5004593\" sap:creatable=\"false\" sap:updatable=\"false\" sap:deletable=\"false\" sap:content-version=\"1\">\n                    <End EntitySet=\"ZSCM_C_PurExpCategory\" Role=\"FromRole_assoc_2ED98D58F9F501E27A6A88BCD5004593\"/>\n                    <End EntitySet=\"ZSCM_C_PurExpCategoryResults\" Role=\"ToRole_assoc_2ED98D58F9F501E27A6A88BCD5004593\"/>\n                </AssociationSet>\n            </EntityContainer>\n            <Annotations Target=\"ZMyOData_SRV.MyEntityType/Factory\"\n                xmlns=\"http://docs.oasis-open.org/odata/ns/edm\">\n                <Annotation Term=\"Common.ValueList\">\n                    <Record>\n                        <PropertyValue Property=\"Label\" String=\"\u5DE5\u5382\u641C\u7D22\u5E2E\u52A9\"/>\n                        <PropertyValue Property=\"CollectionPath\" String=\"ZTV_I_FactoryVH\"/>\n                        <PropertyValue Property=\"SearchSupported\" Bool=\"true\"/>\n                        <PropertyValue Property=\"Parameters\">\n                            <Collection>\n                                <Record Type=\"Common.ValueListParameterInOut\">\n                                    <PropertyValue Property=\"LocalDataProperty\" PropertyPath=\"Product\"/>\n                                    <PropertyValue Property=\"ValueListProperty\" String=\"Product\"/>\n                                </Record>\n                                <Record Type=\"Common.ValueListParameterInOut\">\n                                    <PropertyValue Property=\"LocalDataProperty\" PropertyPath=\"Factory\"/>\n                                    <PropertyValue Property=\"ValueListProperty\" String=\"Factory\"/>\n                                </Record>\n                                <Record Type=\"Common.ValueListParameterDisplaOnly\">\n                                    <PropertyValue Property=\"ValueListProperty\" String=\"FactoryName\"/>\n                                </Record>\n                            </Collection>\n                        </PropertyValue>\n                    </Record>\n                </Annotation>\n            </Annotations>\n        </Schema>\n    </edmx:DataServices>\n</edmx:Edmx>";
declare const ODATA_ENTITY_DATA: {
    Factory: string;
    FactoryName: string;
    ProdQuantity: number;
}[];
declare const ODATA_VALUEHELP_DATA: {
    Factory: string;
    FactoryName: string;
}[];
declare const ODATA_VALUEHELP_SELECT_OPTIONS: {
    value: string;
    text: string;
}[];
declare const DATA: {
    Field: string;
    Value: number;
}[];

interface WidgetState {
    menus: WidgetMenu[];
}
declare enum WidgetMenuType {
    Toggle = "Toggle",
    Action = "Action",
    Menus = "Menus",
    Divider = "Divider"
}
interface WidgetMenu {
    key: string;
    name?: string;
    label?: string;
    type: WidgetMenuType;
    action?: string;
    icon?: string;
    editable?: boolean;
    selected?: boolean;
    menus?: WidgetMenu[];
    value?: unknown;
}
declare class WidgetService {
    readonly menus$: BehaviorSubject<WidgetMenu[]>;
    private _menuClick$;
    private readonly refresh$;
    explains: i0.WritableSignal<any[]>;
    setMenus(menus: WidgetMenu[]): void;
    toggleMenu(menu: WidgetMenu): void;
    clickMenu(menu: WidgetMenu): void;
    onMenuClick(): Subject<WidgetMenu>;
    refresh(force?: boolean): void;
    onRefresh(): rxjs.Observable<boolean>;
    static ɵfac: i0.ɵɵFactoryDeclaration<WidgetService, never>;
    static ɵprov: i0.ɵɵInjectableDeclaration<WidgetService>;
}

declare const DEFAULT_DIGITS_INFO = "1.0-1";
interface WidgetData {
    data: Array<any>;
    entityType: EntityType;
    schema: {
        rows: Array<Dimension>;
        columns: Array<Dimension>;
    };
}
/**
 * 所有可使用在 Story 组件里的 Widget 必须实现此接口类型
 */
interface IStoryWidget<T> extends IFilterChange, FocusableOption {
    /**
     * (内部生成)组件的唯一 ID
     */
    key?: string;
    /**
     * 数据源配置
     */
    dataSettings?: DataSettings;
    /**
     * 组件选项配置
     */
    options: T;
    /**
     * 国家语言代码
     */
    locale?: string;
    /**
     * 组件配置内部改变事件
     */
    optionsChange?: EventEmitter<T> | Observable<T>;
    dataSettingsChange?: EventEmitter<DataSettings> | Observable<DataSettings>;
    slicers?: ISlicer[];
    slicersChange: OutputEmitterRef<ISlicer[]>;
    linkSlicersChange: OutputEmitterRef<ISlicer[]>;
    /**
     * 是否可编辑状态
     */
    editable: boolean;
    /**
     * 组件配置内部数据改变事件
     */
    dataChange?: EventEmitter<WidgetData>;
}
interface StoryWidgetState<T> {
    title: string;
    dataSettings: DataSettings;
    options: T;
    selectionVariant: SelectionVariant;
    presentationVariant: PresentationVariant;
    slicers: ISlicer[];
    rank?: number;
}
interface StoryWidgetStyling {
    appearance: NgmAppearance;
    [key: string]: unknown;
}
/**
 * Story 组件的公共父类
 *
 * * T: Options type
 * * S: State type
 *
 * `dataSettings` 和 `options` 属性需要将变化发出 (为了返回给 Widget 进行存储, 即实现在 Widget 组件本身也能修改属性值并进行保存)
 *
 */
declare class AbstractStoryWidget<T, S extends StoryWidgetState<T> = StoryWidgetState<T>, SY extends StoryWidgetStyling = StoryWidgetStyling> extends ComponentStore<S> implements IStoryWidget<T>, FocusableOption, AfterViewInit {
    protected readonly translateService?: TranslateService;
    protected readonly widgetService?: WidgetService;
    protected readonly coreService: NxCoreService;
    protected readonly destroyRef: DestroyRef;
    key: string;
    /**
     * Title
     */
    get title(): string;
    set title(value: string);
    private readonly _title;
    private readonly _titled;
    /**
     * Data Settings
     */
    get dataSettings(): DataSettings;
    set dataSettings(value: DataSettings);
    _dataSettings$: Observable<DataSettings>;
    readonly dataSettingsSignal: i0.Signal<DataSettings>;
    /**
     * Component Options
     */
    get options(): T;
    set options(value: T);
    private _options$;
    /**
     * @deprecated use optionsSignal
     */
    options$: Observable<NonNullable<T>>;
    readonly optionsSignal: i0.Signal<T>;
    get styling(): SY;
    set styling(value: SY);
    readonly styling$: i0.WritableSignal<SY>;
    /**
     * Language Locale
     */
    get locale(): string;
    set locale(value: string);
    protected locale$: BehaviorSubject<string>;
    /**
     * @deprecated use editableSignal
     *
     * Editable
     */
    get editable(): boolean;
    set editable(value: string | boolean);
    readonly editableSignal: i0.WritableSignal<boolean>;
    readonly editable$: Observable<boolean>;
    /**
     * Selected Members Filters
     */
    get slicers(): ISlicer[];
    set slicers(value: ISlicer[]);
    readonly slicers$: BehaviorSubject<any[]>;
    get pin(): boolean;
    set pin(value: string | boolean);
    protected readonly _pin: i0.WritableSignal<boolean>;
    protected readonly pin$: Observable<boolean>;
    /**
     * @deprecated use linkSlicersChange
     */
    optionsChange: EventEmitter<T & {}>;
    dataSettingsChange: EventEmitter<DataSettings>;
    readonly explain: OutputEmitterRef<any[]>;
    readonly slicersChange: OutputEmitterRef<(ISlicer | IAdvancedFilter)[]>;
    readonly linkSlicersChange: OutputEmitterRef<(ISlicer | IAdvancedFilter)[]>;
    dataChange?: EventEmitter<WidgetData>;
    filterChange?: EventEmitter<IFilter[]>;
    disabled?: boolean;
    readonly entityType: i0.WritableSignal<EntityType>;
    /**
     * @deprecated 为什么在这里定义 loading 状态管理 ？
     */
    readonly isLoading$: BehaviorSubject<boolean>;
    readonly _selectionVariant$: Observable<SelectionVariant>;
    readonly presentationVariant$: Observable<PresentationVariant>;
    readonly selectOptions$: Observable<any>;
    readonly hasSlicers$: Observable<boolean>;
    readonly selectionVariant$: Observable<{
        selectOptions: any;
        id?: string;
        text?: string;
        parameters?: {
            [key: string]: any;
        };
        filterExpression?: string;
    }>;
    readonly dataSettings$: Observable<DataSettings>;
    readonly menuClick$: rxjs.Subject<WidgetMenu>;
    readonly setSelectOptions: (observableOrValue: ISlicer[] | Observable<ISlicer[]>) => rxjs.Subscription;
    readonly orderBy: (observableOrValue: OrderBy | Observable<OrderBy>) => rxjs.Subscription;
    readonly rank: (observableOrValue: number | Observable<number>) => rxjs.Subscription;
    readonly updateOptions: Partial<T> extends infer T_1 ? T_1 extends Partial<T> ? T_1 extends void ? () => void : (observableOrValue: Partial<T> | Observable<Partial<T>>) => rxjs.Subscription : never : never;
    /**
    |--------------------------------------------------------------------------
    | Subscriptions (effect)
    |--------------------------------------------------------------------------
    */
    private refreshSub;
    constructor();
    ngAfterViewInit(): void;
    focus(origin?: FocusOrigin): void;
    getLabel?(): string;
    /**
     * 子类对 Refresh 逻辑进行增强
     *
     * @returns
     */
    refresh(force?: boolean): void;
    /**
     * 子类对 Menus 菜单的增强
     *
     * @returns
     */
    selectMenus(): Observable<WidgetMenu[]>;
    translate(key: string): Observable<any>;
    getTranslation(code: string, text?: any, params?: any): any;
    setExplains(items: unknown[]): void;
    get densityCosy(): boolean;
    get densityCompact(): boolean;
    get densityComfortable(): boolean;
    static ɵfac: i0.ɵɵFactoryDeclaration<AbstractStoryWidget<any, any, any>, never>;
    static ɵdir: i0.ɵɵDirectiveDeclaration<AbstractStoryWidget<any, any, any>, never, never, { "key": { "alias": "key"; "required": false; }; "title": { "alias": "title"; "required": false; }; "dataSettings": { "alias": "dataSettings"; "required": false; }; "options": { "alias": "options"; "required": false; }; "styling": { "alias": "styling"; "required": false; }; "locale": { "alias": "locale"; "required": false; }; "editable": { "alias": "editable"; "required": false; }; "slicers": { "alias": "slicers"; "required": false; }; "pin": { "alias": "pin"; "required": false; }; }, { "optionsChange": "optionsChange"; "dataSettingsChange": "dataSettingsChange"; "explain": "explain"; "slicersChange": "slicersChange"; "linkSlicersChange": "linkSlicersChange"; }, never, never, true, never>;
}

declare function replaceParameters(title: string, entityType: EntityType): string;

declare function saveAsYaml(fileName: string, obj: any): void;
declare function uploadYamlFile<T>(file: any): Promise<T>;
declare function parseYAML<T>(content: string): Promise<T>;

declare function debounceUntilChanged<T, K extends keyof T>(dueTime: number, key?: K): OperatorFunction<T, T>;

interface LinkedModelOptions<T> {
    initialValue: T;
    compute: () => T;
    update: (newValue: T, currentValue?: T) => T | void;
}
declare function linkedModel<T>(options: LinkedModelOptions<T>): WritableSignal<T>;
declare function attrModel<T, K extends keyof T>(model: WritableSignal<T>, name: K): WritableSignal<T[K]>;

declare function bindFormControlToSignal<T = any>(formControl: FormControl, signal: WritableSignal<T>): () => void;

type ResourceStatus = 'idle' | 'loading' | 'success' | 'error';
interface ResourceOptions<TReq, TRes> {
    request: () => TReq;
    loader: (args: {
        request: TReq;
    }) => Promise<TRes>;
}
/**
 * @deprecated Will be replaced by the official `Resource` after upgrading to Angular 19
 */
declare function myResource<TReq, TRes>(options: ResourceOptions<TReq, TRes>): {
    value: i0.Signal<TRes>;
    error: i0.Signal<unknown>;
    status: i0.Signal<ResourceStatus>;
    reload: () => void;
};
interface RxResourceOptions<TReq, TRes> {
    request: () => TReq;
    loader: (args: {
        request: TReq;
    }) => Observable<TRes>;
}
/**
 *
 * @deprecated Will be replaced by the official `Resource` after upgrading to Angular 19
 */
declare function myRxResource<TReq, TRes>(options: RxResourceOptions<TReq, TRes>): {
    value: i0.Signal<TRes>;
    error: i0.Signal<unknown>;
    status: i0.Signal<ResourceStatus>;
    reload: () => void;
};

/**
 * Check string is null or undefined
 * From https://github.com/typeorm/typeorm/issues/873#issuecomment-502294597
 *
 * @param obj
 * @returns
 */
declare function isNullOrUndefined<T>(value: T | null | undefined): value is null | undefined;
/**
 * Checks if a value is not null or undefined.
 * @param value The value to be checked.
 * @returns true if the value is not null or undefined, false otherwise.
 */
declare function isNotNullOrUndefined<T>(value: T | undefined | null): value is T;
/**
 * Check if a value is null, undefined, or an empty string.
 * @param value The value to check.
 * @returns true if the value is null, undefined, or an empty string, false otherwise.
 */
declare function isNotNullOrUndefinedOrEmpty<T>(value: T | undefined | null): boolean;
declare function toParams(query: any): HttpParams;
/**
 * Checks if the given value is a JavaScript object.
 * @param object The value to check.
 * @returns `true` if the value is a JavaScript object, `false` otherwise.
 */
declare function isObject(object: any): boolean;
declare function toFormData(obj: any, form?: any, namespace?: any): any;

export { AbstractStoryWidget, AnimationsService, ArraySlicePipe, AsteriskPipe, BackdropFilterEnum, BaseDimensionMemberRetriever, ButtonClickEvents, CapitalizePipe, ChartComplexity, ColorPalettes, ControlType, DATA, DEFAULT_DIGITS_INFO, DataType, Disappear1, DisappearAnimations, DisappearBL, DisappearFadeOut, DisappearSlideDown, DisappearSlideLeft, DynamicGridDirective, EntriesPipe, FileExtensionPipe, FileTypePipe, FilterByPipe, FilterEnum, FilterPipe, HeightChangeAnimation, IfAnimation, IfAnimations, IndicatorFormulaSchema, IndicatorSchema, InputControlSelectionType, IsNilPipe, KEYCODES, KEYS, KebabToCamelCasePipe, KeysPipe, LeanRightEaseInAnimation, ListHeightStaggerAnimation, ListSlideStaggerAnimation, MEMBER_RETRIEVER_TOKEN, MapPipe, MaskPipe, NAVIGATION_KEYS, NX_SCALE_CHROMATIC, NX_SMART_CHART_TYPE, NX_THEME_DEFAULT, NX_THEME_OPTIONS, NX_THEME_OPTIONS_FACTORY, NgFilterPipeModule, NgMapPipeModule, NgmDndDirective, NgmTransformScaleDirective, NxChartLibrary, NxChartService, NxChartType, NxChromaticType, NxCoreModule, NxCoreService, NxShortNumberService, ODATA_ENTITY, ODATA_ENTITY_DATA, ODATA_ENTITY_DIMENSION, ODATA_ENTITY_VALUEHELP_ENTITY, ODATA_ENTITY_VALUEHELP_PROPERTY, ODATA_META_DATA, ODATA_SRV, ODATA_URI, ODATA_URI_METADATA, ODATA_VALUEHELP_DATA, ODATA_VALUEHELP_SELECT_OPTIONS, OptionsStore, OptionsStore2, OverlayAnimation1, OverlayAnimations, PlatformUtil, PresentationEnum, PropertyPipe, ROUTE_ANIMATIONS_ELEMENTS, ROW_COLLAPSE_KEYS, ROW_EXPAND_KEYS, ResizeObserverDirective, ReversePipe, SUPPORTED_KEYS, SafePipe, SemanticStyle, SlideLeftRightAnimation, SlideUpAnimation, SlideUpDownAnimation, SortDirection, SubStore, TimeRangeEnum, TimeRangeOptions, TranslatePipe, TreeSelectionMode, TypeAheadType, WidgetMenuType, WidgetService, attrModel, bindFormControlToSignal, calcEntityTypePrompt, calcTimeRange, camelCaseObject, click, cloneArray, cloneHierarchicalArray, cloneValue, connect, convertPropertyToTableColumn, convertQueryResultColumns, convertTableToCSV, convertToBoolProperty, createDimensionMemberRetrieverTool, createEventEmitter, createSubStore, debounceUntilChanged, debugDirtyCheckComparator, dirtyCheck, dirtyCheckWith, filterNil, flatPivotColumns, getErrorMessage, getNodeSizeViaRange, getSelectorFn, includeIgnoreCase, injectChartCommand, injectDimensionMemberRetrieverTool, injectDimensionMemberTool, isDate, isEdge, isFirefox, isIE, isLeftClick, isNavigationKey, isNotEmpty, isNotEqual, isNotNullOrUndefined, isNotNullOrUndefinedOrEmpty, isNullOrUndefined, isObject, isRGBColor, isRouteAnimationsAll, isRouteAnimationsElements, isRouteAnimationsNone, isRouteAnimationsPage, linkedModel, listAnimation, listEnterAnimation, makeChartDimensionSchema, makeChartEnum, makeChartMeasureSchema, makeChartRulesPrompt, makeChartSchema, makeCubePrompt, makeTablePrompt, makeid, markdownTable, mergeObjects, mkenum, myResource, myRxResource, parseYAML, readExcelJson, readExcelWorkSheets, replaceParameters, resizeObservable, rgb2hex, routeAnimations, saveAsYaml, splitByHighlight, toFormData, toParams, uploadYamlFile, write, zodToProperties };
export type { CancelableBrowserEventArgs, CancelableEventArgs, Canvas, ColorScheme, ColumnProp, ComponentOptions, DefaultDataSettings, DirtyCheckComparator, DirtyCheckParams, FilterOptions, Hierarchy, IBaseEventArgs, IChartSelectedEvent, IColumnPipeArgs, IFilterChange, IFilterChangedEventArgs, IStoryWidget, Intent, IntentNavigation, IsDirty, NxChartComplexityOptions, NxChartSettings, NxChromatic, NxChromatics, NxCoreState, NxIChartClickEvent, NxIScaleChromatic, NxPaging, NxThemeOptions, ParentChild, PropertyFilterOptions, PropertyOptions, PropertyRecursiveHierarchy, PropertyValueHelp, PropertyValueHelpOptions, QuerySettings, ResourceStatus, RouteAnimationType, SelectConfig, Semantic, SemanticExpression, ShortNumberType, SiblingsOrder, SmartChartTypeProvider, SmartFilterBarDataOptions, SmartFilterDataOptions, SortPropDir, StoryWidgetState, StoryWidgetStyling, SubStoreConfig, TableColumn, TableColumnType, TypeAhead, WidgetData, WidgetMenu, WidgetState, WorkBook };
