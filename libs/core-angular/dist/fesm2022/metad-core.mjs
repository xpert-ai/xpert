import { trigger, transition, query, style, stagger, animate, sequence } from '@angular/animations';
import * as i0 from '@angular/core';
import { Injectable, InjectionToken, inject, PLATFORM_ID, Inject, EventEmitter, ElementRef, Injector, input, booleanAttribute, signal, computed, afterNextRender, runInInjectionContext, HostBinding, Directive, Output, Input, HostListener, numberAttribute, effect, Pipe, NgModule, DestroyRef, output, untracked } from '@angular/core';
import { SlicerSchema, IndicatorType, getEntityMeasures, getEntityDimensions, CHARTS, DimensionSchema, MeasureSchema, MEMBER_RETRIEVER_TOOL_NAME, compact, uniqBy, TimeGranularity, parameterFormatter, getEntityProperty, nonNullable, getPropertyName } from '@metad/ocap-core';
export { CubeVariablePrompt, MEMBER_RETRIEVER_TOOL_NAME, PROMPT_RETRIEVE_DIMENSION_MEMBER, makeCubeRulesPrompt, markdownEntityType, markdownModelCube, nonBlank, nonNullable } from '@metad/ocap-core';
import z$1, { z } from 'zod';
import { BaseRetriever } from '@langchain/core/retrievers';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { formatDocumentsAsString } from 'langchain/util/document';
import { Team, createReactAgent, CopilotAgentType } from '@metad/copilot';
import { injectCommandFewShotPrompt, injectCopilotCommand } from '@metad/copilot-angular';
import { TranslateService } from '@ngx-translate/core';
import { SystemMessage } from '@langchain/core/messages';
import { NGXLogger } from 'ngx-logger';
import { NgmShortNumberPipe, DisplayDensity } from '@metad/ocap-angular/core';
import { takeUntilDestroyed, toSignal, toObservable } from '@angular/core/rxjs-interop';
import { isPlatformBrowser } from '@angular/common';
import { HttpParams, HttpErrorResponse } from '@angular/common/http';
import { negate, isNil as isNil$1, isEqual, isEmpty, includes, camelCase, get, matches, isFunction, isString, isArray as isArray$1, isObject as isObject$1, cloneDeep, pick } from 'lodash-es';
import { Observable, Subject, debounce, interval, ReplaySubject, BehaviorSubject, combineLatest, merge, startWith, distinctUntilChanged as distinctUntilChanged$1, filter as filter$1, map as map$1, withLatestFrom as withLatestFrom$1, combineLatestWith, of } from 'rxjs';
import { filter, tap, takeUntil, pairwise, map, shareReplay, withLatestFrom, distinctUntilChanged } from 'rxjs/operators';
import zodToJsonSchema from 'zod-to-json-schema';
import * as i1 from '@ng-web-apis/resize-observer';
import { ResizeObserverService, WaResizeObserver } from '@ng-web-apis/resize-observer';
import * as i1$1 from '@angular/platform-browser';
import i18next from 'i18next';
import { ComponentStore } from '@metad/store';
import { startOfYear, startOfQuarter, startOfMonth, subDays, subSeconds, addDays } from 'date-fns';
import { ComponentStore as ComponentStore$1 } from '@ngrx/component-store';
import { Store, select, createState } from '@ngneat/elf';
import { produce } from 'immer';
import { coerceBooleanProperty } from '@angular/cdk/coercion';
import { stringify, parse } from 'yaml';

const listAnimation = trigger('listAnimation', [
    transition('* <=> *', [
        query(':enter', [style({ opacity: 0 }), stagger('60ms', animate('300ms ease-out', style({ opacity: 1 })))], {
            optional: true
        }),
        query(':leave', animate('100ms', style({ opacity: 0 })), { optional: true })
    ])
]);
const listEnterAnimation = trigger('listEnterAnimation', [
    transition('* <=> *', [
        query(':enter', [style({ opacity: 0 }), stagger('20ms', animate('100ms ease-out', style({ opacity: 1 })))], {
            optional: true
        })
    ])
]);
const ListHeightStaggerAnimation = trigger('listHeightStagger', [
    transition('* <=> *', [
        query(':enter', [
            style({ height: '0', opacity: 0 }),
            stagger('20ms', animate('100ms ease-out', style({ height: '*', opacity: 1 })))
        ], { optional: true }),
        query(':leave', [
            stagger('20ms', animate('100ms ease-in', style({ height: '0', opacity: 0 })))
        ], { optional: true })
    ])
]);
const ListSlideStaggerAnimation = trigger('listSlideStagger', [
    transition('* <=> *', [
        query(':enter', [
            style({ transform: 'translateX(-20px)', opacity: 0.5 }),
            stagger('50ms', [
                animate('100ms ease-out', style({ transform: 'translateX(0)', opacity: 1 }))
            ])
        ], { optional: true }),
        query(':leave', [
            stagger('50ms', [
                animate('300ms ease-in', style({ transform: 'translateX(-20px)', opacity: 0 }))
            ])
        ], { optional: true })
    ])
]);

class AnimationsService {
    constructor() {
        AnimationsService.routeAnimationType = 'ALL';
    }
    static { this.routeAnimationType = 'ALL'; }
    static isRouteAnimationsType(type) {
        return AnimationsService.routeAnimationType === type;
    }
    updateRouteAnimationType(pageAnimations, elementsAnimations) {
        AnimationsService.routeAnimationType =
            pageAnimations && elementsAnimations
                ? 'ALL'
                : pageAnimations
                    ? 'PAGE'
                    : elementsAnimations
                        ? 'ELEMENTS'
                        : 'NONE';
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: AnimationsService, deps: [], target: i0.ɵɵFactoryTarget.Injectable }); }
    static { this.ɵprov = i0.ɵɵngDeclareInjectable({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: AnimationsService, providedIn: 'root' }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: AnimationsService, decorators: [{
            type: Injectable,
            args: [{
                    providedIn: 'root'
                }]
        }], ctorParameters: () => [] });

const ROUTE_ANIMATIONS_ELEMENTS = 'route-animations-elements';
const STEPS_ALL = [
    query(':enter > *', style({ opacity: 0 }), {
        optional: true
    }),
    query(':enter .' + ROUTE_ANIMATIONS_ELEMENTS, style({ opacity: 0 }), {
        optional: true
    }),
    sequence([
        query(':leave', [
            style({ transform: 'translateY(0%)', opacity: 1, position: 'absolute', width: '100%', top: 0, left: 0 }),
            animate('.2s ease-in-out', style({ opacity: 0 })),
        ], { optional: true }),
        query(':enter > *', [
            style({
                opacity: 0,
                width: '100%'
            }),
            animate('.2s ease-in-out', style({ transform: 'translateY(0%)', opacity: 1 }))
        ], { optional: true })
    ]),
    query(':enter .' + ROUTE_ANIMATIONS_ELEMENTS, stagger(75, [
        style({ opacity: 0 }),
        animate('.2s ease-in-out', style({ opacity: 1 }))
    ]), { optional: true })
];
const STEPS_NONE = [];
const STEPS_PAGE = [STEPS_ALL[0], STEPS_ALL[2]];
const STEPS_ELEMENTS = [STEPS_ALL[1], STEPS_ALL[3]];
const routeAnimations = trigger('routeAnimations', [
    transition(isRouteAnimationsAll, STEPS_ALL),
    transition(isRouteAnimationsNone, STEPS_NONE),
    transition(isRouteAnimationsPage, STEPS_PAGE),
    transition(isRouteAnimationsElements, STEPS_ELEMENTS)
]);
function isRouteAnimationsAll() {
    return AnimationsService.isRouteAnimationsType('ALL');
}
function isRouteAnimationsNone() {
    return AnimationsService.isRouteAnimationsType('NONE');
}
function isRouteAnimationsPage() {
    return AnimationsService.isRouteAnimationsType('PAGE');
}
function isRouteAnimationsElements() {
    return AnimationsService.isRouteAnimationsType('ELEMENTS');
}

const OverlayAnimation1 = trigger('overlayAnimation1', [
    transition(':enter', [
        style({ opacity: 0, transform: 'scale(0.95)' }),
        animate('100ms', style({ opacity: 1, transform: 'scale(1)' }))
    ]),
    transition(':leave', [
        animate('100ms', style({ opacity: 0, transform: 'scale(0.95)' }))
    ]),
]);
const SlideLeftRightAnimation = trigger('slideLeftRight', [
    transition(':enter', [
        style({ transform: 'translateX(50%)', opacity: 0 }),
        animate('200ms ease-in', style({ transform: 'translateX(0)', opacity: 1 }))
    ]),
    transition(':leave', [
        style({ position: 'absolute', }),
        animate('200ms ease-out', style({ transform: 'translateX(50%)', opacity: 0 }))
    ])
]);
const OverlayAnimations = [
    OverlayAnimation1,
    SlideLeftRightAnimation
];

const Disappear1 = trigger('disappear1', [
    transition(':leave', [animate('100ms', style({ opacity: 0, transform: 'scale(0.8)' }))])
]);
const DisappearFadeOut = trigger('fadeOut', [
    transition(':leave', [animate('100ms', style({ opacity: 0, }))])
]);
const DisappearSlideDown = trigger('slideDown', [
    transition(':leave', [
        animate('200ms ease-in', style({ opacity: 0, transform: 'translateY(50%)' }))
    ])
]);
const DisappearSlideLeft = trigger('slideLeft', [
    transition(':leave', [
        animate('500ms', style({ opacity: 0, transform: 'translateX(-60%)' }))
    ])
]);
const DisappearBL = trigger('bl', [
    transition(':enter', [
        style({ transform: 'translate(-80%, 30%) scale(0.2)', opacity: 0 }),
        animate('200ms ease-out', style({ transform: 'translate(0, 0) scale(1)', opacity: 1 }))
    ]),
    transition(':leave', [
        animate('200ms ease-in', style({ width: '335px', opacity: 0.5, transform: 'translate(-100%, 30%) scale(0.2)' }))
    ])
]);
const DisappearAnimations = [Disappear1, DisappearFadeOut, DisappearSlideDown, DisappearBL];

const IfAnimation = trigger('ifAnimationTrigger', [
    transition(':enter', [style({ opacity: 0 }), animate('100ms', style({ opacity: 1 }))]),
    transition(':leave', [style({ position: 'absolute' }), animate('100ms', style({ opacity: 0 }))]),
]);
const HeightChangeAnimation = trigger('heightChangeAnimation', [
    transition(':enter', [
        style({ height: '0', opacity: 0 }),
        animate('200ms ease-out', style({ height: '*', opacity: 1 }))
    ]),
    transition(':leave', [
        animate('200ms ease-in', style({ height: '0', opacity: 0 }))
    ])
]);
const SlideUpAnimation = trigger('slideUpAnimation', [
    transition(':enter', [
        style({ transform: 'translateY(100%)', opacity: 0 }),
        animate('300ms ease-out', style({ transform: 'translateY(0)', opacity: 1 }))
    ]),
    transition(':leave', [
        style({ position: 'absolute', }),
        animate('100ms ease-in', style({ transform: 'translateY(-100%)', opacity: 0 }))
    ])
]);
const SlideUpDownAnimation = trigger('slideUpDown', [
    transition(':enter', [
        style({ transform: 'translateY(100%)', opacity: 0 }),
        animate('100ms ease-in', style({ transform: 'translateY(0)', opacity: 1 }))
    ]),
    transition(':leave', [
        style({ position: 'absolute', }),
        animate('100ms ease-in', style({ transform: 'translateY(100%)', opacity: 0 }))
    ])
]);
const LeanRightEaseInAnimation = trigger('leanRightEaseIn', [
    transition(':enter', [
        style({ transform: 'translateX(-20%)', opacity: 0 }),
        animate('{{ timing }} ease-in', style({ transform: 'translateX(0)', opacity: 1 }))
    ], { params: { timing: '100ms' } }),
    transition(':leave', [
        style({}),
        animate('{{ timing }} ease-out', style({ opacity: 0 }))
    ], { params: { timing: '100ms' } })
]);
const IfAnimations = [
    HeightChangeAnimation,
    IfAnimation,
    SlideUpAnimation
];

/**
 * z.ZodType<Partial<Indicator>>
 */
const IndicatorSchema = z
    .object({
    id: z.string().optional().describe(`The id of indicator`),
    code: z.string().describe(`The code of indicator, use alphabetic characters`),
    name: z.string().describe(`The name of indicator`),
    type: z
        .enum([IndicatorType.BASIC, IndicatorType.DERIVE])
        .describe(`BASIC: is basic indicator, DERIVE: is derived indicator using formula to calculate result`),
    modelId: z.string().describe(`The model id that indicator belongs to`),
    entity: z.string().describe(`The cube name that indicator belongs to`),
    calendar: z.string().optional().describe(`The calendar dimension or hierarchy`),
    dimensions: z
        .array(z.string().describe('Dimension or hierarchy'))
        .optional()
        .describe('The dimensions that not restricted by filters'),
    filters: z.array(SlicerSchema).optional().describe('The filters to restrict the indicator'),
    variables: z.array(SlicerSchema).optional().describe('The variables (parameters) of cube'),
    measure: z.string().optional().describe(`Measure name when indicator type is 'BASIC'`),
    formula: z.string().optional().describe(`MDX formula when indicator type is 'DERIVE'`),
    unit: z.string().optional().describe(`The unit of indicator`),
    // basic info
    isApplication: z.boolean().optional().describe(`The indicator can be show in indicator application if it has calendar dimension`),
    businessAreaId: z.string().optional().describe(`Business area the indicator should belong to`),
    business: z.string().describe(`A language description of the indicator from a caliber perspective.`),
    tags: z.array(z.object({
        id: z.string().describe(`Id of tag`)
    })).optional().describe(`Relative tags of the indicator`)
})
    .describe('Indicator');
const IndicatorFormulaSchema = z
    .object({
    // code: z.string().describe(`The code of indicator`),
    formula: z.string().describe(`The MDX formula of indicator`),
    unit: z.string().optional().describe(`The unit of formula result`)
});

/**
 * @deprecated use markdownEntityType
 */
function calcEntityTypePrompt(entityType) {
    return JSON.stringify({
        name: entityType.name,
        caption: entityType.caption,
        dimensions: getEntityDimensions(entityType).map((dimension) => ({
            name: dimension.name,
            caption: dimension.caption,
            hierarchies: dimension.hierarchies?.map((item) => ({
                name: item.name,
                caption: item.caption,
                levels: item.levels?.map((item) => ({
                    name: item.name,
                    caption: item.caption
                }))
            }))
        })),
        measures: getEntityMeasures(entityType).map((item) => ({
            name: item.name,
            caption: item.caption
        }))
    });
}
/**
 * @deprecated use markdownCube
 */
function makeCubePrompt(cube) {
    return JSON.stringify({
        name: cube.name,
        caption: cube.caption,
        dimensions: cube.dimensions?.map((dimension) => ({
            name: dimension.name,
            caption: dimension.caption,
            hierarchies: dimension.hierarchies?.map((item) => ({
                name: item.name,
                caption: item.caption,
                levels: item.levels?.map((item) => ({
                    name: item.name,
                    caption: item.caption
                }))
            }))
        })),
        measures: cube.measures?.map((item) => ({
            name: item.name,
            caption: item.caption
        })),
        calculatedMembers: cube.calculatedMembers?.map((item) => ({
            name: item.name,
            caption: item.caption,
            formula: item.formula
        })),
        /**
         * @todo Add dimensions
         */
        dimensionUsages: cube.dimensionUsages?.map((item) => ({
            name: item.name,
            caption: item.caption
        }))
    });
}
/**
 * @deprecated use markdownTable
 */
function makeTablePrompt(entityType) {
    if (!entityType?.properties) {
        return undefined;
    }
    return JSON.stringify({
        name: entityType.name,
        caption: entityType.caption ?? undefined,
        columns: Object.values(entityType.properties).map((item) => ({
            name: item.name,
            caption: item.caption ?? undefined,
            type: item.dataType
        }))
    });
}
function markdownTable(table) {
    if (!table) {
        return `No table info.`;
    }
    const columns = Object.values(table.properties);
    return [
        `Table is:`,
        `  - name: ${table.name}`,
        `    caption: ${table.caption || ''}`,
        `    columns:`,
        columns
            .map((t) => [
            `    - name: ${t.name}`,
            `      caption: ${t.caption || ''}`,
            `      type: ${t.dataType || ''}`
        ].join('\n'))
            .join('\n'),
        '```'
    ].join('\n');
}

function makeChartRulesPrompt() {
    return ``;
}
function makeChartEnum() {
    return CHARTS.map((g) => g.charts.map((c) => c.label)).flat();
}
function makeChartSchema() {
    return z
        .object({
        cube: z.string().describe('The cube name used by the chart'),
        chartType: z.object({
            type: z.enum(makeChartEnum()).describe('The chart type'),
            chartOptions: z
                .object({
                seriesStyle: z.any().describe('The series options of ECharts library'),
                legend: z.any().describe('The legend options of ECharts library'),
                axis: z.any().describe('The axis options of ECharts library'),
                dataZoom: z.any().describe('The dataZoom options of ECharts library'),
                tooltip: z.any().describe('The tooltip options of ECharts library')
            })
                .describe('The chart options of ECharts library')
        }),
        // dimensions: z
        //   .array(
        //     z.object({
        //       dimension: z.string().describe('The name of dimension'),
        //       hierarchy: z.string().optional().describe('The name of the hierarchy in the dimension'),
        //       level: z.string().optional().describe('The name of the level in the hierarchy')
        //     })
        //   )
        //   .describe('The dimensions used by the chart, at least one dimension'),
        // measures: z
        //   .array(
        //     z.object({
        //       measure: z.string().describe('The name of the measure'),
        //       order: z.enum(['ASC', 'DESC']).optional().describe('The order of the measure'),
        //       chartOptions: z.any().optional().describe('The chart options of ECharts library')
        //     })
        //   )
        //   .describe('The measures used by the chart, At least one measure'),
        slicers: z
            .array(z.object({
            dimension: z
                .object({
                dimension: z.string().describe('The name of the dimension'),
                hierarchy: z.string().optional().describe('The name of the hierarchy in the dimension'),
                level: z.string().optional().describe('The name of the level in the hierarchy')
            })
                .describe('The dimension of the slicer'),
            members: z
                .array(z.object({
                value: z.string().describe('the key of the member'),
                caption: z.string().describe('the caption of the member')
            }))
                .describe('The members in the slicer')
        }))
            .describe('The slicers used by the chart')
    })
        .describe('The chart schema');
}
function makeChartDimensionSchema() {
    return DimensionSchema;
}
function makeChartMeasureSchema() {
    return MeasureSchema;
}

class BaseDimensionMemberRetriever extends BaseRetriever {
}
const MEMBER_RETRIEVER_TOKEN = new InjectionToken('DimensionMemberRetriever');
function createDimensionMemberRetrieverTool(retriever, model, cube) {
    retriever.model = model;
    retriever.cube = cube;
    return new DynamicStructuredTool({
        name: MEMBER_RETRIEVER_TOOL_NAME,
        description: 'Search for dimension member key information about filter conditions. For any needs about filtering data, you must use this tool!',
        schema: z.object({
            modelId: z.string().describe('The model ID'),
            cube: z.string().describe('The cube name'),
            dimension: z.string().describe('The dimension to look up in the retriever'),
            hierarchy: z.string().optional().describe('The hierarchy to look up in the retriever'),
            level: z.string().optional().describe('The level to look up in the retriever'),
            member: z.string().describe('The member to look up in the retriever')
        }),
        func: async ({ modelId, cube, dimension, hierarchy, level, member }, runManager) => {
            retriever.metadata['modelId'] = modelId;
            retriever.metadata['cube'] = cube;
            try {
                const docs = await retriever.invoke(`${dimension || ''} ${hierarchy ? `hierarchy: ${hierarchy}` : ''} ${level ? `level: ${level}` : ''} ${member}`, runManager?.getChild('retriever'));
                return formatDocumentsAsString(docs);
            }
            catch (e) {
                console.error(e);
                return '';
            }
        }
    });
}
function injectDimensionMemberRetrieverTool(model, cube) {
    const memberRetriever = inject(MEMBER_RETRIEVER_TOKEN);
    return createDimensionMemberRetrieverTool(memberRetriever, model, cube);
}
function injectDimensionMemberTool() {
    const memberRetriever = inject(MEMBER_RETRIEVER_TOKEN);
    return createDimensionMemberRetrieverTool(memberRetriever);
}

function injectCreateChartTool(createChart) {
    const logger = inject(NGXLogger);
    const createChartTool = new DynamicStructuredTool({
        name: 'createChart',
        description: 'Create chart function logic',
        schema: CreateChartSchema,
        func: createChart
    });
    return createChartTool;
}
const CreateChartSchema = z$1.object({
    logic: z$1.string().describe(`Chart custom logic body`)
});

const superState = {
    ...Team.createState(),
    indicator: {
        value: (x, y) => y ?? x,
        default: () => ''
    }
};
function injectCreateChartGraph(logic, createChart) {
    const createChartTool = injectCreateChartTool(createChart);
    return async ({ llm, checkpointer, interruptBefore, interruptAfter }) => {
        return createReactAgent({
            llm,
            checkpointSaver: checkpointer,
            interruptBefore,
            interruptAfter,
            tools: [createChartTool],
            state: superState,
            messageModifier: async (state) => {
                const system = `You are a javascript programmer. Follow the prompts to write or edit a Javascript function using the ECharts library to create a custom chart.
${state.role}
${state.context}
函数应该接受以下参数：
1. 'queryResult': The type of queryResult is
\`\`\`
{
  status: 'OK',
  data: any[],
  schema: {
    rows?: {
      name: string,
      label?: string
      dataType: string
    }[],
    columns: {
      name: string,
      label?: string
      dataType: string
    }[]
  }
}
\`\`\`
2. 'chartAnnotation':

3. 'entityType':

4. 'locale': 语言环境代码
5. 'chartsInstance': ECharts 实例
6. 'utils': 工具函数集
。
自定义逻辑需要返回结果类型为：
\`\`\`
{
  options: ECharts 图形的 Option 配置对象
  onClick: 图形点击事件的响应函数，返回事件和相关切片器
}
\`\`\`

Current function logic is:
${logic() ? logic() : 'empty'}
`;
                return [new SystemMessage(system), ...state.messages];
            }
        });
    };
}

function injectChartCommand(logic, createChart) {
    const translate = inject(TranslateService);
    const createGraph = injectCreateChartGraph(logic, createChart);
    const fewShotPrompt = injectCommandFewShotPrompt('chart', { k: 2, vectorStore: null });
    const commandName = 'chart';
    return injectCopilotCommand(commandName, {
        alias: 'cr',
        description: translate.instant('PAC.Copilot.CommandChartDesc', {
            Default: 'Descripe the business logic of chart'
        }),
        agent: {
            type: CopilotAgentType.Graph,
            conversation: true,
            interruptBefore: []
        },
        fewShotPrompt,
        createGraph
    });
}

/**
 * Check string is null or undefined
 * From https://github.com/typeorm/typeorm/issues/873#issuecomment-502294597
 *
 * @param obj
 * @returns
 */
function isNullOrUndefined(value) {
    return value === undefined || value === null;
}
/**
 * Checks if a value is not null or undefined.
 * @param value The value to be checked.
 * @returns true if the value is not null or undefined, false otherwise.
 */
function isNotNullOrUndefined(value) {
    return value !== undefined && value !== null;
}
/**
 * Check if a value is null, undefined, or an empty string.
 * @param value The value to check.
 * @returns true if the value is null, undefined, or an empty string, false otherwise.
 */
function isNotNullOrUndefinedOrEmpty(value) {
    return isNotNullOrUndefined(value) && value !== '';
}
// It will use for pass nested object or array in query params in get method.
function toParams(query) {
    let params = new HttpParams();
    Object.keys(query).forEach((key) => {
        if (isObject(query[key])) {
            params = toSubParams(params, key, query[key]);
        }
        else {
            params = params.append(key.toString(), query[key]);
        }
    });
    return params;
}
/**
 * Checks if the given value is a JavaScript object.
 * @param object The value to check.
 * @returns `true` if the value is a JavaScript object, `false` otherwise.
 */
function isObject(object) {
    return object !== null && object !== undefined && typeof object === 'object';
}
// /**
//  * Check value not empty.
//  * @param item
//  * @returns {boolean}
//  */
// export function isNotEmpty(item: any): boolean {
// 	return !isEmpty(item);
// }
// /**
//  * Check value empty.
//  * @param item
//  * @returns {boolean}
//  */
// export function isEmpty(item: any): boolean {
// 	if (item instanceof Array) {
// 		item = item.filter((val) => !isEmpty(val));
// 		return item.length === 0;
// 	} else if (item && typeof item === 'object') {
// 		for (const key in item) {
// 			if (item[key] === null || item[key] === undefined || item[key] === '') {
// 				delete item[key];
// 			}
// 		}
// 		return Object.keys(item).length === 0;
// 	} else {
// 		return !item || (item + '').toLocaleLowerCase() === 'null' || (item + '').toLocaleLowerCase() === 'undefined';
// 	}
// }
function toSubParams(params, key, object) {
    Object.keys(object).forEach((childKey) => {
        if (isObject(object[childKey])) {
            params = toSubParams(params, `${key}[${childKey}]`, object[childKey]);
        }
        else {
            params = params.append(`${key}[${childKey}]`, object[childKey]);
        }
    });
    return params;
}
// It will use when file uploading from angular, just pass object of with file it will convert it to from data
function toFormData(obj, form, namespace) {
    const fd = form || new FormData();
    let formKey;
    for (const property in obj) {
        if (obj.hasOwnProperty(property) && obj[property]) {
            if (namespace) {
                formKey = namespace + '[' + property + ']';
            }
            else {
                formKey = property;
            }
            // if the property is an object, but not a File, use recursively.
            if (obj[property] instanceof Date) {
                fd.append(formKey, obj[property].toISOString());
            }
            else if (typeof obj[property] === 'object' && !(obj[property] instanceof File)) {
                toFormData(obj[property], fd, formKey);
            }
            else {
                // if it's a string or a File object
                fd.append(formKey, obj[property]);
            }
        }
    }
    return fd;
}

const filterNil = filter(negate(isNil$1));
const isNotEqual = negate(isEqual);
const isNotEmpty = negate(isEmpty);
/**
 *@hidden
 */
function cloneArray(array, deep) {
    const arr = [];
    if (!array) {
        return arr;
    }
    let i = array.length;
    while (i--) {
        arr[i] = deep ? cloneValue(array[i]) : array[i];
    }
    return arr;
}
/**
 * Doesn't clone leaf items
 * @hidden
 */
function cloneHierarchicalArray(array, childDataKey) {
    const result = [];
    if (!array) {
        return result;
    }
    for (const item of array) {
        const clonedItem = cloneValue(item);
        if (Array.isArray(item[childDataKey])) {
            clonedItem[childDataKey] = cloneHierarchicalArray(clonedItem[childDataKey], childDataKey);
        }
        result.push(clonedItem);
    }
    return result;
}
/**
 * Deep clones all first level keys of Obj2 and merges them to Obj1
 * @param obj1 Object to merge into
 * @param obj2 Object to merge from
 * @returns Obj1 with merged cloned keys from Obj2
 * @hidden
 */
function mergeObjects(obj1, obj2) {
    if (!isObject(obj1)) {
        throw new Error(`Cannot merge into ${obj1}. First param must be an object.`);
    }
    if (!isObject(obj2)) {
        return obj1;
    }
    for (const key of Object.keys(obj2)) {
        obj1[key] = cloneValue(obj2[key]);
    }
    return obj1;
}
/**
 * Creates deep clone of provided value.
 * Supports primitive values, dates and objects.
 * If passed value is array returns shallow copy of the array.
 * @param value value to clone
 * @returns Deep copy of provided value
 *@hidden
 */
function cloneValue(value) {
    if (isDate(value)) {
        return new Date(value.getTime());
    }
    if (Array.isArray(value)) {
        return [...value];
    }
    if (value instanceof Map || value instanceof Set) {
        return value;
    }
    if (isObject(value)) {
        const result = {};
        for (const key of Object.keys(value)) {
            result[key] = cloneValue(value[key]);
        }
        return result;
    }
    return value;
}
/**
 * Checks if provided variable is Date
 * @param value Value to check
 * @returns true if provided variable is Date
 *@hidden
 */
function isDate(value) {
    return Object.prototype.toString.call(value) === '[object Date]';
}
/**
 *@hidden
 */
var KEYCODES;
(function (KEYCODES) {
    KEYCODES[KEYCODES["ENTER"] = 13] = "ENTER";
    KEYCODES[KEYCODES["SPACE"] = 32] = "SPACE";
    KEYCODES[KEYCODES["ESCAPE"] = 27] = "ESCAPE";
    KEYCODES[KEYCODES["LEFT_ARROW"] = 37] = "LEFT_ARROW";
    KEYCODES[KEYCODES["UP_ARROW"] = 38] = "UP_ARROW";
    KEYCODES[KEYCODES["RIGHT_ARROW"] = 39] = "RIGHT_ARROW";
    KEYCODES[KEYCODES["DOWN_ARROW"] = 40] = "DOWN_ARROW";
    KEYCODES[KEYCODES["F2"] = 113] = "F2";
    KEYCODES[KEYCODES["TAB"] = 9] = "TAB";
    KEYCODES[KEYCODES["CTRL"] = 17] = "CTRL";
    KEYCODES[KEYCODES["Z"] = 90] = "Z";
    KEYCODES[KEYCODES["Y"] = 89] = "Y";
    KEYCODES[KEYCODES["X"] = 88] = "X";
    KEYCODES[KEYCODES["BACKSPACE"] = 8] = "BACKSPACE";
    KEYCODES[KEYCODES["DELETE"] = 46] = "DELETE";
    KEYCODES[KEYCODES["INPUT_METHOD"] = 229] = "INPUT_METHOD";
})(KEYCODES || (KEYCODES = {}));
/**
 *@hidden
 */
var KEYS;
(function (KEYS) {
    KEYS["ENTER"] = "Enter";
    KEYS["SPACE"] = " ";
    KEYS["SPACE_IE"] = "Spacebar";
    KEYS["ESCAPE"] = "Escape";
    KEYS["ESCAPE_IE"] = "Esc";
    KEYS["LEFT_ARROW"] = "ArrowLeft";
    KEYS["LEFT_ARROW_IE"] = "Left";
    KEYS["UP_ARROW"] = "ArrowUp";
    KEYS["UP_ARROW_IE"] = "Up";
    KEYS["RIGHT_ARROW"] = "ArrowRight";
    KEYS["RIGHT_ARROW_IE"] = "Right";
    KEYS["DOWN_ARROW"] = "ArrowDown";
    KEYS["DOWN_ARROW_IE"] = "Down";
    KEYS["F2"] = "F2";
    KEYS["TAB"] = "Tab";
    KEYS["SEMICOLON"] = ";";
    KEYS["HOME"] = "Home";
    KEYS["END"] = "End";
})(KEYS || (KEYS = {}));
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
function getNodeSizeViaRange(range, node) {
    let overflow = null;
    if (!isFirefox()) {
        overflow = node.style.overflow;
        // we need that hack - otherwise content won't be measured correctly in IE/Edge
        node.style.overflow = 'visible';
    }
    range.selectNodeContents(node);
    const width = range.getBoundingClientRect().width;
    if (!isFirefox()) {
        // we need that hack - otherwise content won't be measured correctly in IE/Edge
        node.style.overflow = overflow;
    }
    return width;
}
/**
 *@hidden
 */
function isIE() {
    return navigator.appVersion.indexOf('Trident/') > 0;
}
/**
 *@hidden
 */
function isEdge() {
    // eslint-disable-next-line no-useless-escape
    const edgeBrowser = /Edge[\/\s](\d+\.\d+)/.test(navigator.userAgent);
    return edgeBrowser;
}
/**
 *@hidden
 */
function isFirefox() {
    // eslint-disable-next-line no-useless-escape
    const firefoxBrowser = /Firefox[\/\s](\d+\.\d+)/.test(navigator.userAgent);
    return firefoxBrowser;
}
/**
 * @deprecated
 * @hidden
 */
class PlatformUtil {
    // eslint-disable-next-line @typescript-eslint/ban-types
    constructor(platformId) {
        this.platformId = platformId;
        this.isBrowser = isPlatformBrowser(this.platformId);
        this.isIOS = this.isBrowser && /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window);
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: PlatformUtil, deps: [{ token: PLATFORM_ID }], target: i0.ɵɵFactoryTarget.Injectable }); }
    static { this.ɵprov = i0.ɵɵngDeclareInjectable({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: PlatformUtil, providedIn: 'root' }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: PlatformUtil, decorators: [{
            type: Injectable,
            args: [{ providedIn: 'root' }]
        }], ctorParameters: () => [{ type: Object, decorators: [{
                    type: Inject,
                    args: [PLATFORM_ID]
                }] }] });
/**
 * @hidden
 */
function isLeftClick(event) {
    return event.button === 0;
}
/** @hidden */
function isNavigationKey(key) {
    return ([
        'down',
        'up',
        'left',
        'right',
        'arrowdown',
        'arrowup',
        'arrowleft',
        'arrowright',
        'home',
        'end',
        'space',
        'spacebar',
        ' ',
    ].indexOf(key) !== -1);
}
const NAVIGATION_KEYS = new Set([
    'down',
    'up',
    'left',
    'right',
    'arrowdown',
    'arrowup',
    'arrowleft',
    'arrowright',
    'home',
    'end',
    'space',
    'spacebar',
    ' ',
]);
const ROW_EXPAND_KEYS = new Set('right down arrowright arrowdown'.split(' '));
const ROW_COLLAPSE_KEYS = new Set('left up arrowleft arrowup'.split(' '));
const SUPPORTED_KEYS = new Set([
    ...Array.from(NAVIGATION_KEYS),
    'tab',
    'enter',
    'f2',
    'escape',
    'esc',
]);
/**
 * @hidden
 * @internal
 *
 * Creates a new ResizeObserver on `target` and returns it as an Observable.
 * Run the resizeObservable outside angular zone, because it patches the MutationObserver which causes an infinite loop.
 * Related issue: https://github.com/angular/angular/issues/31712
 */
function resizeObservable(target) {
    return new Observable((observer) => {
        const instance = new ResizeObserver((entries) => {
            observer.next(entries);
        });
        instance.observe(target);
        const unsubscribe = () => instance.disconnect();
        return unsubscribe;
    });
}
/**
 * @deprecated use `booleanAttribute` instead
 */
function convertToBoolProperty(val) {
    if (typeof val === 'string') {
        val = val.toLowerCase().trim();
        return val === 'true' || val === '';
    }
    return !!val;
}
/** Button events to pass to `DebugElement.triggerEventHandler` for RouterLink event handler */
const ButtonClickEvents = {
    left: { button: 0 },
    right: { button: 2 },
};
/** Simulate element click. Defaults to mouse left-button click event. */
function click(el, eventObj = ButtonClickEvents.left) {
    if (el instanceof HTMLElement) {
        el.click();
    }
    else {
        el.triggerEventHandler('click', eventObj);
    }
}
function makeid(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    const characters = chars + '0123456789';
    const charactersLength = characters.length;
    // 首字母为英文字符
    let result = chars.charAt(Math.floor(Math.random() * chars.length));
    for (let i = 0; i < length - 1; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}
const mkenum = (x) => x;
// Search options
function includeIgnoreCase(text, target) {
    const keywords = target.split(/\s+/g);
    const matchs = String(text).match(new RegExp(`(${keywords.join('|')})`, 'ig'));
    return matchs;
}
/**
 * 分解高亮字符串
 *
 * @param text
 * @param highlight
 * @returns
 */
function splitByHighlight(text, highlight) {
    if (highlight && text) {
        const keywords = highlight.split(/\s+/g);
        const matchs = String(text).match(new RegExp(`(${keywords.join('|')})`, 'ig'));
        const results = String(text).split(new RegExp(`(${keywords.join('|')})`, 'i'));
        if (results?.length > 1) {
            return results.map(value => includes(matchs, value) ? { match: true, value } : { value });
        }
    }
    return [{ value: text }];
}
function createEventEmitter(observable, options) {
    const { unsubscribe, isAsync } = options || {};
    const emitter = new EventEmitter(isAsync === true);
    let obs = observable.pipe(tap(val => emitter.next(val)));
    if (unsubscribe != null) {
        obs = obs.pipe(takeUntil(unsubscribe));
    }
    obs.subscribe();
    return emitter;
}
// export function omitBlank(obj) {
//   if (Array.isArray(obj)) {
//     return obj.map(value => omitBlank(value))
//   } else if (typeof obj === "object") {
//     return Object.entries(obj)
//       .filter(([, v]) => !isBlank(v))
//       .reduce((r, [key, value]) => ({ ...r, [key]: omitBlank(value) }), {})
//   }
//   else {
//     return obj
//   }
// }
// Table to csv format
function convertTableToCSV(columns, data) {
    return columns.map((column) => column.caption || column.name).join(',') + `\n` +
        data.map((row) => columns.map((column) => row[column.name]).join(',')).join('\n');
}
function flatPivotColumns(columns) {
    const flatColumns = [];
    const flatColumn = (column, parentName) => {
        if (column.columns?.length) {
            column.columns.forEach((item) => flatColumn(item, column.caption));
        }
        else {
            flatColumns.push({
                ...column,
                caption: compact([parentName, column.caption]).join('/') // (parentName ? `${parentName}/` : '') + (column.label ?? '')
            });
        }
    };
    columns?.forEach((item) => flatColumn(item, null));
    return flatColumns;
}
function convertQueryResultColumns(schema) {
    const columns = [];
    schema?.rows?.forEach((row) => {
        columns.push(row);
        if (row.text) {
            columns.push(row.text);
        }
        columns.push(...(row.properties ?? []));
    });
    columns.push(...flatPivotColumns(schema?.columns));
    return uniqBy(columns, 'name');
}
function getErrorMessage(err) {
    let error;
    if (typeof err === 'string') {
        error = err;
    }
    else if (err instanceof HttpErrorResponse) {
        error = err?.error?.message ?? err.message;
    }
    else if (err instanceof Error) {
        error = err?.message;
    }
    else if (err?.error instanceof Error) {
        error = err?.error?.message;
    }
    else if (err) {
        // 实在没办法则转成 JSON string
        error = JSON.stringify(err);
    }
    return error;
}
/**
 * Copilot
 */
function zodToProperties(obj) {
    return zodToJsonSchema(obj).properties;
}
/**
 * Convert snake case object to camel case
 *
 * @param obj
 * @returns
 */
function camelCaseObject(obj) {
    const newObj = {};
    for (const key in obj) {
        newObj[camelCase(key)] = obj[key];
    }
    return newObj;
}
/**
 * Detect encoding from BOM (Byte Order Mark) and remove BOM if present
 * @param data ArrayBuffer
 * @returns Object with detected encoding and data without BOM
 */
function detectAndRemoveBOM(data) {
    const bytes = new Uint8Array(data.slice(0, 4));
    let encoding = 'utf-8';
    let offset = 0;
    // UTF-8 BOM: EF BB BF
    if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
        encoding = 'utf-8';
        offset = 3;
    }
    // UTF-16 LE BOM: FF FE
    else if (bytes[0] === 0xFF && bytes[1] === 0xFE) {
        encoding = 'utf-16le';
        offset = 2;
    }
    // UTF-16 BE BOM: FE FF
    else if (bytes[0] === 0xFE && bytes[1] === 0xFF) {
        encoding = 'utf-16be';
        offset = 2;
    }
    // Remove BOM if present
    if (offset > 0) {
        return {
            encoding,
            data: data.slice(offset)
        };
    }
    return { encoding, data };
}
async function readExcelWorkSheets(file) {
    const XLSX = await import('xlsx');
    return new Promise((resolve, reject) => {
        // For CSV files, use FileReader.readAsText with UTF-8 encoding
        // This is more reliable for handling encoding in browsers
        if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    // FileReader.readAsText with 'utf-8' should handle UTF-8 BOM automatically
                    let text = e.target.result;
                    // Remove UTF-8 BOM if present (FileReader might not remove it)
                    if (text.charCodeAt(0) === 0xFEFF) {
                        text = text.slice(1);
                    }
                    // Read CSV with XLSX
                    const wBook = XLSX.read(text, {
                        type: 'string',
                        codepage: 65001 // UTF-8 codepage for better Chinese support
                    });
                    resolve(await readExcelJson(wBook, file.name));
                }
                catch (err) {
                    reject(err);
                }
            };
            reader.onerror = () => {
                reject(new Error('Failed to read CSV file. Please ensure the file is saved in UTF-8 encoding.'));
            };
            // Use readAsText with UTF-8 encoding for better encoding handling
            reader.readAsText(file, 'UTF-8');
        }
        else {
            // For Excel files (.xlsx, .xls), use ArrayBuffer
            const reader = new FileReader();
            reader.onload = async (e) => {
                const data = e.target.result;
                try {
                    const wBook = XLSX.read(data, {
                        type: 'array',
                        codepage: 65001, // UTF-8 codepage for better Chinese support
                        cellDates: true,
                        cellNF: false
                    });
                    resolve(await readExcelJson(wBook, file.name));
                }
                catch (err) {
                    reject(err);
                }
            };
            reader.onerror = () => {
                reject(new Error('Failed to read Excel file'));
            };
            reader.readAsArrayBuffer(file);
        }
    });
}
async function readExcelJson(wSheet, fileName = '') {
    const XLSX = await import('xlsx');
    const name = fileName
        .replace(/\.xlsx$/, '')
        .replace(/\.xls$/, '')
        .replace(/\.csv$/, '');
    // const sheetCellRange = XLSX.utils.decode_range(wSheet['!ref'])
    // const sheetMaxRow = sheetCellRange.e.r
    return wSheet.SheetNames.map((sheetName) => {
        const origExcelData = XLSX.utils.sheet_to_json(wSheet.Sheets[sheetName], {
            header: 1,
            range: wSheet['!ref'],
            raw: true
        });
        const refExcelData = origExcelData.slice(1).map((value) => Object.assign([], value));
        const excelTransformNum = origExcelData[0].map((col) => `${col}`.trim());
        /* Combine to JSON */
        const excelDataEncodeToJson = refExcelData.slice(0).map((item, row) => item.reduce((obj, val, i) => {
            if (!excelTransformNum[i]) {
                throw new Error(`No column name found for cell at row ${row + 2}, column ${i + 1}`);
            }
            obj[excelTransformNum[i].trim()] = val;
            return obj;
        }, {}));
        const columns = excelTransformNum.map((column, i) => {
            const item = excelDataEncodeToJson.find((item) => typeof item[column] !== 'undefined');
            return {
                name: column,
                fieldName: column,
            };
        });
        return {
            fileName,
            name: wSheet.SheetNames.length > 1 ? sheetName : name,
            columns: columns.filter((col) => !!col),
            data: excelDataEncodeToJson,
        };
    });
}

class NgmTransformScaleDirective {
    #injector;
    get scale() {
        return this.disabled()
            ? null
            : `scale(${Math.min(Number(this.hostTargetWidth()) / Number(this.hostWidth()), Number(this.hostTargetHeight()) / Number(this.hostHeight()))}`;
    }
    get transformOrigin() {
        return this.disabled() ? null : 'top left';
    }
    // shift to center
    get marginLeft() {
        return this.disabled()
            ? null
            : Number(this.hostTargetHeight()) / Number(this.hostHeight()) <
                Number(this.hostTargetWidth()) / Number(this.hostWidth())
                ? (Number(this.hostTargetWidth()) -
                    (Number(this.hostTargetHeight()) / Number(this.hostHeight())) * Number(this.hostWidth())) /
                    2
                : 0;
    }
    // Shift to middle
    get marginTop() {
        return this.disabled()
            ? null
            : Number(this.hostTargetWidth()) / Number(this.hostWidth()) <
                Number(this.hostTargetHeight()) / Number(this.hostHeight())
                ? (Number(this.hostTargetHeight()) -
                    (Number(this.hostTargetWidth()) / Number(this.hostWidth())) * Number(this.hostHeight())) /
                    2
                : 0;
    }
    constructor() {
        this.host = inject(ElementRef);
        this.#injector = inject(Injector);
        this.width = input(...(ngDevMode ? [undefined, { debugName: "width" }] : []));
        this.height = input(...(ngDevMode ? [undefined, { debugName: "height" }] : []));
        this.targetWidth = input(...(ngDevMode ? [undefined, { debugName: "targetWidth" }] : []));
        this.targetHeight = input(...(ngDevMode ? [undefined, { debugName: "targetHeight" }] : []));
        this.disabled = input(false, { ...(ngDevMode ? { debugName: "disabled" } : {}), alias: 'ngmTransformDisabled',
            transform: booleanAttribute });
        this._width = signal(null, ...(ngDevMode ? [{ debugName: "_width" }] : []));
        this._height = signal(null, ...(ngDevMode ? [{ debugName: "_height" }] : []));
        this._targetWidth = signal(null, ...(ngDevMode ? [{ debugName: "_targetWidth" }] : []));
        this._targetHeight = signal(null, ...(ngDevMode ? [{ debugName: "_targetHeight" }] : []));
        this.hostWidth = computed(() => this._width() ?? this.width(), ...(ngDevMode ? [{ debugName: "hostWidth" }] : []));
        this.hostHeight = computed(() => this._height() ?? this.height(), ...(ngDevMode ? [{ debugName: "hostHeight" }] : []));
        this.hostTargetWidth = computed(() => this._targetWidth() ?? this.targetWidth(), ...(ngDevMode ? [{ debugName: "hostTargetWidth" }] : []));
        this.hostTargetHeight = computed(() => this._targetHeight() ?? this.targetHeight(), ...(ngDevMode ? [{ debugName: "hostTargetHeight" }] : []));
        afterNextRender(() => {
            runInInjectionContext(this.#injector, () => {
                resizeObservable(this.host.nativeElement)
                    .pipe(
                // debounceTime(1000),
                takeUntilDestroyed())
                    .subscribe((entries) => {
                    this._width.set(entries[0].contentRect.width);
                    this._height.set(entries[0].contentRect.height);
                });
                resizeObservable(this.host.nativeElement.parentElement)
                    .pipe(
                // debounceTime(1000),
                takeUntilDestroyed())
                    .subscribe((entries) => {
                    this._targetWidth.set(entries[0].contentRect.width);
                    this._targetHeight.set(entries[0].contentRect.height);
                });
            });
        });
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: NgmTransformScaleDirective, deps: [], target: i0.ɵɵFactoryTarget.Directive }); }
    static { this.ɵdir = i0.ɵɵngDeclareDirective({ minVersion: "17.1.0", version: "21.1.4", type: NgmTransformScaleDirective, isStandalone: true, selector: "[ngmTransformScale]", inputs: { width: { classPropertyName: "width", publicName: "width", isSignal: true, isRequired: false, transformFunction: null }, height: { classPropertyName: "height", publicName: "height", isSignal: true, isRequired: false, transformFunction: null }, targetWidth: { classPropertyName: "targetWidth", publicName: "targetWidth", isSignal: true, isRequired: false, transformFunction: null }, targetHeight: { classPropertyName: "targetHeight", publicName: "targetHeight", isSignal: true, isRequired: false, transformFunction: null }, disabled: { classPropertyName: "disabled", publicName: "ngmTransformDisabled", isSignal: true, isRequired: false, transformFunction: null } }, host: { properties: { "style.transform": "this.scale", "style.transform-origin": "this.transformOrigin", "style.margin-left.px": "this.marginLeft", "style.margin-top.px": "this.marginTop" } }, ngImport: i0 }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: NgmTransformScaleDirective, decorators: [{
            type: Directive,
            args: [{
                    standalone: true,
                    selector: '[ngmTransformScale]'
                }]
        }], ctorParameters: () => [], propDecorators: { width: [{ type: i0.Input, args: [{ isSignal: true, alias: "width", required: false }] }], height: [{ type: i0.Input, args: [{ isSignal: true, alias: "height", required: false }] }], targetWidth: [{ type: i0.Input, args: [{ isSignal: true, alias: "targetWidth", required: false }] }], targetHeight: [{ type: i0.Input, args: [{ isSignal: true, alias: "targetHeight", required: false }] }], disabled: [{ type: i0.Input, args: [{ isSignal: true, alias: "ngmTransformDisabled", required: false }] }], scale: [{
                type: HostBinding,
                args: ['style.transform']
            }], transformOrigin: [{
                type: HostBinding,
                args: ['style.transform-origin']
            }], marginLeft: [{
                type: HostBinding,
                args: ['style.margin-left.px']
            }], marginTop: [{
                type: HostBinding,
                args: ['style.margin-top.px']
            }] } });

// import ResizeObserver from 'resize-observer-polyfill'; //not needed really since > Chrome 64
const entriesMap = new WeakMap();
const ro = new ResizeObserver((entries) => {
    for (const entry of entries) {
        if (entriesMap.has(entry.target)) {
            const comp = entriesMap.get(entry.target);
            comp._resizeCallback(entry);
        }
    }
});
class ResizeObserverDirective {
    constructor(el) {
        this.el = el;
        this.debounceTime = 0;
        this.sizeChange = new EventEmitter();
        this.resize$ = new Subject();
        this._subscriber = this.resize$.pipe(debounce(() => interval(this.debounceTime))).subscribe((event) => {
            this.sizeChange.emit(event);
        });
        const target = this.el.nativeElement;
        entriesMap.set(target, this);
        ro.observe(target);
    }
    _resizeCallback(entry) {
        this.resize$.next(entry);
    }
    ngOnDestroy() {
        const target = this.el.nativeElement;
        ro.unobserve(target);
        entriesMap.delete(target);
        this._subscriber.unsubscribe();
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: ResizeObserverDirective, deps: [{ token: i0.ElementRef }], target: i0.ɵɵFactoryTarget.Directive }); }
    static { this.ɵdir = i0.ɵɵngDeclareDirective({ minVersion: "14.0.0", version: "21.1.4", type: ResizeObserverDirective, isStandalone: true, selector: "[resizeObserver]", inputs: { debounceTime: ["resizeDebounceTime", "debounceTime"] }, outputs: { sizeChange: "sizeChange" }, ngImport: i0 }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: ResizeObserverDirective, decorators: [{
            type: Directive,
            args: [{
                    standalone: true,
                    selector: '[resizeObserver]'
                }]
        }], ctorParameters: () => [{ type: i0.ElementRef }], propDecorators: { debounceTime: [{
                type: Input,
                args: ['resizeDebounceTime']
            }], sizeChange: [{
                type: Output
            }] } });

class NgmDndDirective {
    constructor() {
        this.fileDropped = new EventEmitter();
    }
    // Dragover listener
    onDragOver(evt) {
        evt.preventDefault();
        evt.stopPropagation();
        this.fileOver = true;
    }
    // Dragleave listener
    onDragLeave(evt) {
        evt.preventDefault();
        evt.stopPropagation();
        this.fileOver = false;
    }
    // Drop listener
    ondrop(evt) {
        evt.preventDefault();
        evt.stopPropagation();
        this.fileOver = false;
        const files = evt.dataTransfer.files;
        if (files.length > 0) {
            this.fileDropped.emit(files);
        }
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: NgmDndDirective, deps: [], target: i0.ɵɵFactoryTarget.Directive }); }
    static { this.ɵdir = i0.ɵɵngDeclareDirective({ minVersion: "14.0.0", version: "21.1.4", type: NgmDndDirective, isStandalone: true, selector: "[ngmDnd]", outputs: { fileDropped: "fileDropped" }, host: { listeners: { "dragover": "onDragOver($event)", "dragleave": "onDragLeave($event)", "drop": "ondrop($event)" }, properties: { "class.ngm-fileover": "this.fileOver" } }, ngImport: i0 }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: NgmDndDirective, decorators: [{
            type: Directive,
            args: [{
                    standalone: true,
                    selector: '[ngmDnd]'
                }]
        }], propDecorators: { fileOver: [{
                type: HostBinding,
                args: ['class.ngm-fileover']
            }], fileDropped: [{
                type: Output
            }], onDragOver: [{
                type: HostListener,
                args: ['dragover', ['$event']]
            }], onDragLeave: [{
                type: HostListener,
                args: ['dragleave', ['$event']]
            }], ondrop: [{
                type: HostListener,
                args: ['drop', ['$event']]
            }] } });

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
class DynamicGridDirective {
    constructor(el, renderer) {
        this.el = el;
        this.renderer = renderer;
        this.entries$ = inject(ResizeObserverService);
        // Define a signal to store the element's width
        this.elementWidth = signal(0, ...(ngDevMode ? [{ debugName: "elementWidth" }] : []));
        this.colWidth = input(200, { ...(ngDevMode ? { debugName: "colWidth" } : {}), transform: numberAttribute }); // Width of each column
        this.initializeSignalEffect();
        this.entries$.pipe(takeUntilDestroyed()).subscribe((entries) => {
            // This will trigger when the component resizes
            this.elementWidth.set(entries[0].contentBoxSize[0].inlineSize);
        });
    }
    initializeSignalEffect() {
        // Create an effect to monitor changes in elementWidth
        effect(() => {
            const width = this.elementWidth();
            const cols = Math.max(1, Math.floor(width / this.colWidth()));
            // Apply native grid styles
            this.renderer.setStyle(this.el.nativeElement, 'display', 'grid');
            this.renderer.setStyle(this.el.nativeElement, 'grid-template-columns', `repeat(${cols}, 1fr)`);
        });
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: DynamicGridDirective, deps: [{ token: i0.ElementRef }, { token: i0.Renderer2 }], target: i0.ɵɵFactoryTarget.Directive }); }
    static { this.ɵdir = i0.ɵɵngDeclareDirective({ minVersion: "17.1.0", version: "21.1.4", type: DynamicGridDirective, isStandalone: true, selector: "[ngmDynamicGrid]", inputs: { colWidth: { classPropertyName: "colWidth", publicName: "colWidth", isSignal: true, isRequired: false, transformFunction: null } }, hostDirectives: [{ directive: i1.WaResizeObserver, inputs: ["box", "box"], outputs: ["waResizeObserver", "waResizeObserver"] }], ngImport: i0 }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: DynamicGridDirective, decorators: [{
            type: Directive,
            args: [{
                    standalone: true,
                    selector: '[ngmDynamicGrid]',
                    hostDirectives: [
                        {
                            directive: WaResizeObserver,
                            inputs: ['box'],
                            outputs: ['waResizeObserver']
                        }
                    ]
                }]
        }], ctorParameters: () => [{ type: i0.ElementRef }, { type: i0.Renderer2 }], propDecorators: { colWidth: [{ type: i0.Input, args: [{ isSignal: true, alias: "colWidth", required: false }] }] } });

function isNil(value) {
    return value === null || typeof value === 'undefined';
}
function isArray(value) {
    return Array.isArray(value);
}

class FilterPipe {
    transform(input, fn) {
        if (!isArray(input) || !fn) {
            return input;
        }
        return input.filter(fn);
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: FilterPipe, deps: [], target: i0.ɵɵFactoryTarget.Pipe }); }
    static { this.ɵpipe = i0.ɵɵngDeclarePipe({ minVersion: "14.0.0", version: "21.1.4", ngImport: i0, type: FilterPipe, isStandalone: false, name: "filter" }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: FilterPipe, decorators: [{
            type: Pipe,
            args: [{
                    name: 'filter',
                    standalone: false
                }]
        }] });
class NgFilterPipeModule {
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: NgFilterPipeModule, deps: [], target: i0.ɵɵFactoryTarget.NgModule }); }
    static { this.ɵmod = i0.ɵɵngDeclareNgModule({ minVersion: "14.0.0", version: "21.1.4", ngImport: i0, type: NgFilterPipeModule, declarations: [FilterPipe], exports: [FilterPipe] }); }
    static { this.ɵinj = i0.ɵɵngDeclareInjector({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: NgFilterPipeModule }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: NgFilterPipeModule, decorators: [{
            type: NgModule,
            args: [{
                    declarations: [FilterPipe],
                    exports: [FilterPipe]
                }]
        }] });

class MapPipe {
    transform(input, fn) {
        if (!isArray(input) || !fn) {
            return input;
        }
        return input.map(fn);
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: MapPipe, deps: [], target: i0.ɵɵFactoryTarget.Pipe }); }
    static { this.ɵpipe = i0.ɵɵngDeclarePipe({ minVersion: "14.0.0", version: "21.1.4", ngImport: i0, type: MapPipe, isStandalone: false, name: "map" }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: MapPipe, decorators: [{
            type: Pipe,
            args: [{
                    name: 'map',
                    standalone: false
                }]
        }] });
class NgMapPipeModule {
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: NgMapPipeModule, deps: [], target: i0.ɵɵFactoryTarget.NgModule }); }
    static { this.ɵmod = i0.ɵɵngDeclareNgModule({ minVersion: "14.0.0", version: "21.1.4", ngImport: i0, type: NgMapPipeModule, declarations: [MapPipe], exports: [MapPipe] }); }
    static { this.ɵinj = i0.ɵɵngDeclareInjector({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: NgMapPipeModule }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: NgMapPipeModule, decorators: [{
            type: NgModule,
            args: [{
                    declarations: [MapPipe],
                    exports: [MapPipe]
                }]
        }] });

class ReversePipe {
    transform(input) {
        if (!isArray(input)) {
            return input;
        }
        return [...input].reverse();
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: ReversePipe, deps: [], target: i0.ɵɵFactoryTarget.Pipe }); }
    static { this.ɵpipe = i0.ɵɵngDeclarePipe({ minVersion: "14.0.0", version: "21.1.4", ngImport: i0, type: ReversePipe, isStandalone: true, name: "reverse" }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: ReversePipe, decorators: [{
            type: Pipe,
            args: [{
                    standalone: true,
                    name: 'reverse'
                }]
        }] });

class IsNilPipe {
    transform(value) {
        return isNil(value);
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: IsNilPipe, deps: [], target: i0.ɵɵFactoryTarget.Pipe }); }
    static { this.ɵpipe = i0.ɵɵngDeclarePipe({ minVersion: "14.0.0", version: "21.1.4", ngImport: i0, type: IsNilPipe, isStandalone: true, name: "isNil" }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: IsNilPipe, decorators: [{
            type: Pipe,
            args: [{
                    standalone: true,
                    name: 'isNil'
                }]
        }] });

class CapitalizePipe {
    transform(value) {
        if (!value)
            return '';
        return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: CapitalizePipe, deps: [], target: i0.ɵɵFactoryTarget.Pipe }); }
    static { this.ɵpipe = i0.ɵɵngDeclarePipe({ minVersion: "14.0.0", version: "21.1.4", ngImport: i0, type: CapitalizePipe, isStandalone: true, name: "capitalize" }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: CapitalizePipe, decorators: [{
            type: Pipe,
            args: [{
                    standalone: true,
                    name: 'capitalize'
                }]
        }] });

class EntriesPipe {
    transform(value, args) {
        return Object.entries(value);
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: EntriesPipe, deps: [], target: i0.ɵɵFactoryTarget.Pipe }); }
    static { this.ɵpipe = i0.ɵɵngDeclarePipe({ minVersion: "14.0.0", version: "21.1.4", ngImport: i0, type: EntriesPipe, isStandalone: true, name: "entries" }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: EntriesPipe, decorators: [{
            type: Pipe,
            args: [{
                    standalone: true,
                    name: 'entries'
                }]
        }] });

class KebabToCamelCasePipe {
    transform(value) {
        if (!value)
            return value;
        return value
            .split('-')
            .map((word, index) => {
            if (index === 0) {
                // Capitalize the first letter of the first word.
                return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
            }
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        })
            .join(' ');
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: KebabToCamelCasePipe, deps: [], target: i0.ɵɵFactoryTarget.Pipe }); }
    static { this.ɵpipe = i0.ɵɵngDeclarePipe({ minVersion: "14.0.0", version: "21.1.4", ngImport: i0, type: KebabToCamelCasePipe, isStandalone: true, name: "kebabToCamelCase" }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: KebabToCamelCasePipe, decorators: [{
            type: Pipe,
            args: [{
                    standalone: true,
                    name: 'kebabToCamelCase'
                }]
        }] });

class KeysPipe {
    transform(value, args) {
        return value ? Object.keys(value) : null;
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: KeysPipe, deps: [], target: i0.ɵɵFactoryTarget.Pipe }); }
    static { this.ɵpipe = i0.ɵɵngDeclarePipe({ minVersion: "14.0.0", version: "21.1.4", ngImport: i0, type: KeysPipe, isStandalone: true, name: "keys" }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: KeysPipe, decorators: [{
            type: Pipe,
            args: [{
                    standalone: true,
                    name: 'keys',
                }]
        }] });

class MaskPipe {
    transform(value, visibleStart = 4, visibleEnd = 4) {
        if (!value)
            return value;
        const length = value.length;
        if (length <= visibleStart + visibleEnd) {
            return value; // 如果长度小于等于可见部分，直接返回原值
        }
        const start = value.substring(0, visibleStart);
        const end = value.substring(length - visibleEnd);
        const maskedPart = '...';
        return `${start}${maskedPart}${end}`;
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: MaskPipe, deps: [], target: i0.ɵɵFactoryTarget.Pipe }); }
    static { this.ɵpipe = i0.ɵɵngDeclarePipe({ minVersion: "14.0.0", version: "21.1.4", ngImport: i0, type: MaskPipe, isStandalone: true, name: "mask" }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: MaskPipe, decorators: [{
            type: Pipe,
            args: [{
                    standalone: true,
                    name: 'mask'
                }]
        }] });

class PropertyPipe {
    transform(value, ...args) {
        return get(value, args[0]);
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: PropertyPipe, deps: [], target: i0.ɵɵFactoryTarget.Pipe }); }
    static { this.ɵpipe = i0.ɵɵngDeclarePipe({ minVersion: "14.0.0", version: "21.1.4", ngImport: i0, type: PropertyPipe, isStandalone: true, name: "property" }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: PropertyPipe, decorators: [{
            type: Pipe,
            args: [{
                    standalone: true,
                    name: 'property',
                }]
        }] });

class SafePipe {
    constructor(sanitizer) {
        this.sanitizer = sanitizer;
    }
    transform(value, type) {
        switch (type) {
            case 'html':
                return this.sanitizer.bypassSecurityTrustHtml(value);
            case 'style':
                return this.sanitizer.bypassSecurityTrustStyle(value);
            case 'script':
                return this.sanitizer.bypassSecurityTrustScript(value);
            case 'url':
                return this.sanitizer.bypassSecurityTrustUrl(value);
            case 'resourceUrl':
                return this.sanitizer.bypassSecurityTrustResourceUrl(value);
            default:
                throw new Error(`Invalid safe type specified: ${type}`);
        }
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: SafePipe, deps: [{ token: i1$1.DomSanitizer }], target: i0.ɵɵFactoryTarget.Pipe }); }
    static { this.ɵpipe = i0.ɵɵngDeclarePipe({ minVersion: "14.0.0", version: "21.1.4", ngImport: i0, type: SafePipe, isStandalone: true, name: "safe" }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: SafePipe, decorators: [{
            type: Pipe,
            args: [{
                    standalone: true,
                    name: 'safe'
                }]
        }], ctorParameters: () => [{ type: i1$1.DomSanitizer }] });

class FileTypePipe {
    transform(fileName) {
        const extension = fileName?.split('.').pop()?.toLowerCase();
        if (!extension) {
            return 'unknown';
        }
        switch (extension) {
            case 'txt':
            case 'md':
            case 'doc':
            case 'docx':
                return 'text';
            case 'js':
            case 'jsx':
            case 'ts':
            case 'py':
            case 'java':
            case 'css':
            case 'html':
            case 'cpp':
                return 'code';
            case 'mp4':
            case 'avi':
            case 'mov':
            case 'wmv':
                return 'video';
            case 'jpg':
            case 'jpeg':
            case 'png':
            case 'gif':
            case 'bmp':
                return 'image';
            case 'zip':
                return 'zip';
            default:
                return extension;
        }
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: FileTypePipe, deps: [], target: i0.ɵɵFactoryTarget.Pipe }); }
    static { this.ɵpipe = i0.ɵɵngDeclarePipe({ minVersion: "14.0.0", version: "21.1.4", ngImport: i0, type: FileTypePipe, isStandalone: true, name: "fileType" }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: FileTypePipe, decorators: [{
            type: Pipe,
            args: [{
                    standalone: true,
                    name: 'fileType'
                }]
        }] });

class ArraySlicePipe {
    transform(input, start, end) {
        if (!isArray(input)) {
            return input;
        }
        return input.slice(start, end);
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: ArraySlicePipe, deps: [], target: i0.ɵɵFactoryTarget.Pipe }); }
    static { this.ɵpipe = i0.ɵɵngDeclarePipe({ minVersion: "14.0.0", version: "21.1.4", ngImport: i0, type: ArraySlicePipe, isStandalone: true, name: "slice" }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: ArraySlicePipe, decorators: [{
            type: Pipe,
            args: [{
                    standalone: true,
                    name: 'slice'
                }]
        }] });

class FilterByPipe {
    transform(items, predicate, ...args) {
        return Array.isArray(items) && typeof predicate === 'function'
            ? items.filter(item => predicate(item, ...args))
            : items;
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: FilterByPipe, deps: [], target: i0.ɵɵFactoryTarget.Pipe }); }
    static { this.ɵpipe = i0.ɵɵngDeclarePipe({ minVersion: "14.0.0", version: "21.1.4", ngImport: i0, type: FilterByPipe, isStandalone: true, name: "filterBy" }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: FilterByPipe, decorators: [{
            type: Pipe,
            args: [{
                    standalone: true,
                    name: 'filterBy',
                    pure: true
                }]
        }] });

class AsteriskPipe {
    transform(value) {
        if (!value)
            return value;
        const length = value.length;
        return '*'.repeat(length);
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: AsteriskPipe, deps: [], target: i0.ɵɵFactoryTarget.Pipe }); }
    static { this.ɵpipe = i0.ɵɵngDeclarePipe({ minVersion: "14.0.0", version: "21.1.4", ngImport: i0, type: AsteriskPipe, isStandalone: true, name: "asterisk" }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: AsteriskPipe, decorators: [{
            type: Pipe,
            args: [{
                    standalone: true,
                    name: 'asterisk'
                }]
        }] });

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
class TranslatePipe {
    constructor() {
        this.translate = inject(TranslateService);
    }
    transform(key, options) {
        if (!key) {
            return '';
        }
        if (!key.includes(':') && !options?.ns) {
            return this.translate.instant(key, options);
        }
        return i18next.t(key, options) || options?.Default;
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: TranslatePipe, deps: [], target: i0.ɵɵFactoryTarget.Pipe }); }
    static { this.ɵpipe = i0.ɵɵngDeclarePipe({ minVersion: "14.0.0", version: "21.1.4", ngImport: i0, type: TranslatePipe, isStandalone: true, name: "translate" }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: TranslatePipe, decorators: [{
            type: Pipe,
            args: [{
                    standalone: true,
                    name: 'translate'
                }]
        }] });

class FileExtensionPipe {
    transform(fileName) {
        const extension = fileName?.split('.').pop()?.toLowerCase();
        return extension;
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: FileExtensionPipe, deps: [], target: i0.ɵɵFactoryTarget.Pipe }); }
    static { this.ɵpipe = i0.ɵɵngDeclarePipe({ minVersion: "14.0.0", version: "21.1.4", ngImport: i0, type: FileExtensionPipe, isStandalone: true, name: "fileExtension" }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: FileExtensionPipe, decorators: [{
            type: Pipe,
            args: [{
                    standalone: true,
                    name: 'fileExtension'
                }]
        }] });

class NxChartService {
    constructor() {
        this.theme$ = new ReplaySubject(1);
        this.refresh$ = new Subject();
        this.resize$ = new Subject();
        this.chartLibrary$ = new BehaviorSubject(null);
        // 在 chart 实例上做动作
        this.doAction$ = new Subject();
        this.chartOptions$ = new Subject();
    }
    /**
     * 重新计算图形大小
     */
    resize() {
        this.resize$.next();
    }
    onResize() {
        return this.resize$.asObservable();
    }
    /**
     * On chart theme change event
     */
    onThemeChange() {
        return this.theme$.asObservable();
    }
    /**
     * Trigger the chart theme change event
     *
     * @param theme The name of EChart theme
     */
    changeTheme(theme) {
        this.theme$.next(theme);
    }
    /**
     * On chart refresh event
     */
    onRefresh() {
        return this.refresh$.asObservable();
    }
    /**
     * Refresh chart
     */
    refresh() {
        this.refresh$.next();
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: NxChartService, deps: [], target: i0.ɵɵFactoryTarget.Injectable }); }
    static { this.ɵprov = i0.ɵɵngDeclareInjectable({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: NxChartService }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: NxChartService, decorators: [{
            type: Injectable
        }] });

const NX_THEME_DEFAULT = 'default';
const NX_THEME_OPTIONS = new InjectionToken('Xpert Theme Options', {
    providedIn: 'root',
    factory: NX_THEME_OPTIONS_FACTORY
});
function NX_THEME_OPTIONS_FACTORY() {
    return {
        name: NX_THEME_DEFAULT
    };
}
/**
 * @deprecated use NgmOcapCoreService instead
 */
class NxCoreService extends ComponentStore {
    constructor(options) {
        super({ themeName: NX_THEME_DEFAULT, timeGranularity: TimeGranularity.Month });
        this.options = options;
        // readonly ocapCoreService = inject(NgmOcapCoreService)
        this._intent$ = new Subject();
        /**
         * Theme name for charts
         */
        this.themeName$ = this.select((state) => state.themeName);
        this.themeChanges$ = this.themeName$.pipe(pairwise(), map(([previous, current]) => ({
            previous,
            name: current
        })), shareReplay(1));
        // public chartLibrary$ = new BehaviorSubject<{
        //   lib: NxChartLibrary
        //   registerTheme: (name, theme) => void
        // }>(null)
        this.store = new ComponentStore({});
        this.query$ = this.store.select((state) => state.query);
        this.updateQuery = this.store.updater((state, query) => ({ ...state, query }));
        // /**
        //  * 接收各组件创建修改计算字段的事件, 发给如 Story 组件进行实际更新
        //  * 暂时使用这种间接的方式
        //  */
        // public readonly storyUpdateEvent$ = new Subject<{
        //   type: 'Parameter' | 'Calculation'
        //   dataSettings: DataSettings
        //   parameter?: ParameterProperty
        //   property?: CalculationProperty
        // }>()
        this.timeGranularity$ = this.select((state) => state.timeGranularity);
        this.currentTime$ = combineLatest([this.select((state) => state.today), this.timeGranularity$]).pipe(map(([today, timeGranularity]) => ({ today, timeGranularity })));
        this.changeTheme(options?.name || NX_THEME_DEFAULT);
    }
    sendIntent(intent) {
        this._intent$.next(intent);
    }
    onIntent() {
        return this._intent$;
    }
    /**
     * Change current application theme
     *
     * @param name 名称
     */
    changeTheme(name) {
        this.patchState({ themeName: name });
    }
    /**
     * Triggered when current theme is changed
     */
    onThemeChange() {
        return this.themeChanges$;
    }
    getTheme() {
        return this.get((state) => state.themeName);
        // return this.theme$.getValue()
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: NxCoreService, deps: [{ token: NX_THEME_OPTIONS }], target: i0.ɵɵFactoryTarget.Injectable }); }
    static { this.ɵprov = i0.ɵɵngDeclareInjectable({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: NxCoreService }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: NxCoreService, decorators: [{
            type: Injectable
        }], ctorParameters: () => [{ type: undefined, decorators: [{
                    type: Inject,
                    args: [NX_THEME_OPTIONS]
                }] }] });

class NxShortNumberService {
    constructor() {
        // this.valueModel = valueFactory.create(null);
        // this.unitModel  = unitFactory.create('');
        // this.value$ = this.valueModel.data$;
        // this.unit$  = this.unitModel.data$;
    }
    /**
     * 输入数字， 输出缩短后的数字和单位
     *
     * @param number
     * @param args
     */
    transform(number, args) {
        if (isNaN(number))
            return null; // will only work value is a number
        if (number === null)
            return null;
        if (number === 0)
            return { value: 0, unit: '' };
        let abs = Math.abs(number);
        const rounder = Math.pow(10, 1);
        const isNegative = number < 0; // will also work for Negetive numbers
        let key = '';
        const powers = [
            { key: 'Q', value: Math.pow(10, 15) },
            { key: 'T', value: Math.pow(10, 12) },
            { key: 'B', value: Math.pow(10, 9) },
            { key: 'M', value: Math.pow(10, 6) },
            { key: 'K', value: 1000 }
        ];
        for (let i = 0; i < powers.length; i++) {
            let reduced = abs / powers[i].value;
            reduced = Math.round(reduced * rounder) / rounder;
            if (reduced >= 1) {
                abs = reduced;
                key = powers[i].key;
                break;
            }
        }
        let shortNumber = {
            value: Number((isNegative ? '-' : '') + abs),
            unit: key
        };
        // this.valueModel.set(shortNumber);
        // this.unitModel.set(key);
        return shortNumber;
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: NxShortNumberService, deps: [], target: i0.ɵɵFactoryTarget.Injectable }); }
    static { this.ɵprov = i0.ɵɵngDeclareInjectable({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: NxShortNumberService }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: NxShortNumberService, decorators: [{
            type: Injectable
        }], ctorParameters: () => [] });

/**
 * @deprecated Migrate to `@metad/ocap-angular/core`
 */
class NxCoreModule {
    static forRoot() {
        return {
            ngModule: NxCoreModule,
            providers: [NxCoreService]
        };
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: NxCoreModule, deps: [], target: i0.ɵɵFactoryTarget.NgModule }); }
    static { this.ɵmod = i0.ɵɵngDeclareNgModule({ minVersion: "14.0.0", version: "21.1.4", ngImport: i0, type: NxCoreModule, imports: [NgmTransformScaleDirective, ResizeObserverDirective, NgmShortNumberPipe, EntriesPipe, SafePipe, KeysPipe, PropertyPipe], exports: [KeysPipe,
            EntriesPipe,
            PropertyPipe,
            SafePipe,
            ResizeObserverDirective,
            NgmTransformScaleDirective,
            NgmShortNumberPipe] }); }
    static { this.ɵinj = i0.ɵɵngDeclareInjector({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: NxCoreModule }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: NxCoreModule, decorators: [{
            type: NgModule,
            args: [{
                    declarations: [],
                    imports: [NgmTransformScaleDirective, ResizeObserverDirective, NgmShortNumberPipe, EntriesPipe, SafePipe, KeysPipe, PropertyPipe],
                    exports: [
                        KeysPipe,
                        EntriesPipe,
                        PropertyPipe,
                        SafePipe,
                        ResizeObserverDirective,
                        NgmTransformScaleDirective,
                        NgmShortNumberPipe
                    ]
                }]
        }] });

function rgb2hex(color) {
    return isRGBColor(color)
        ? '#' +
            color
                .match(/\d+/g)
                .map((x) => (+x).toString(16).padStart(2, '0'))
                .join('')
        : color;
}
function isRGBColor(color) {
    return /rgba?\([0-9,\s]*\)/.test(color);
}
const ColorPalettes = [
    {
        label: '3',
        colors: [
            {
                colors: ['#cb997e', '#ddbea9', '#ffe8d6'],
                keywords: ['warm', 'vintage', 'gradient', 'monochromatic']
            },
        ]
    },
    {
        label: '4',
        colors: [
            {
                colors: ['#587850', '#709078', '#78B0A0', '#F8D0B0']
            },
            {
                colors: ['#d4e09b', '#f6f4d2', '#cbdfbd', '#f19c79'],
                keywords: ['pastel', 'gradient']
            },
            {
                colors: ['#ffa69e', '#faf3dd', '#b8f2e6', '#aed9e0'],
                keywords: ['pastel', 'turquoise', 'gradient']
            },
            {
                colors: ['#003049', '#d62828', '#f77f00', '#fcbf49'],
                keywords: ['orange']
            },
            {
                colors: ['#219ebc', '#023047', '#ffb703', '#fb8500'],
                keywords: ['blue', 'orange']
            },
            {
                colors: ['#26547c', '#ef476f', '#ffd166', '#06d6a0'],
                keywords: []
            },
            {
                colors: ['#2b2d42', '#8d99ae', '#edf2f4', '#ef233c'],
                keywords: []
            },
            {
                colors: ['#70d6ff', '#ff70a6', '#ff9770', '#ffd670'],
                keywords: ['pastel', 'orange']
            },
            {
                colors: ['#606c38', '#283618', '#fefae0', '#dda15e'],
                keywords: ['green']
            },
            {
                colors: ['#333333', '#d5ccc7', '#a9a29c', '#28262b'],
                keywords: []
            },
            {
                colors: ['#f1faee', '#a8dadc', '#457b9d', '#1d3557'],
                keywords: ['cold', 'gradient']
            },
            {
                colors: ['#3c1518', '#69140e', '#a44200', '#d58936'],
                keywords: ['warm', 'gradient']
            },
            {
                colors: ['#ef476f', '#ffd166', '#06d6a0', '#118ab2'],
                keywords: []
            },
            {
                colors: ['#191d32', '#282f44', '#453a49', '#6d3b47'],
                keywords: ['dark', 'gradient']
            },
            {
                colors: ['#d7dace', '#ffe9b3', '#ffdc74', '#ffc176'],
                keywords: ['warm', 'pastel', 'vintage', 'orange', 'gradient']
            },
            {
                colors: ['#001524', '#15616d', '#ffecd1', '#ff7d00'],
                keywords: []
            },
            {
                colors: ['#880d1e', '#dd2d4a', '#f26a8d', '#f49cbb'],
                keywords: ['red', 'pink', 'gradient']
            },
            {
                colors: ['#ffcdb2', '#ffb4a2', '#e5989b', '#b5838d'],
                keywords: ['warm', 'red', 'gradient']
            },
            {
                colors: ['#463f3a', '#8a817c', '#bcb8b1', '#f4f3ee'],
                keywords: ['warm', 'gray', 'gradient']
            },
            {
                colors: ['#d8e2dc', '#ffe5d9', '#ffcad4', '#f4acb7'],
                keywords: ['pastel', 'red', 'gradient']
            },
            {
                colors: ['#264653', '#2a9d8f', '#e9c46a', '#f4a261'],
                keywords: ['orange']
            },
            {
                colors: ['#000000', '#14213d', '#fca311', '#e5e5e5'],
                keywords: ['gray']
            },
            {
                colors: ['#006d77', '#83c5be', '#edf6f9', '#ffddd2'],
                keywords: ['turquoise', 'gradient']
            },
            {
                colors: ['#dabfff', '#907ad6', '#4f518c', '#2c2a4a'],
                keywords: ['violet', 'cold', 'gradient']
            },
            {
                colors: ['#0d3b66', '#faf0ca', '#f4d35e', '#ee964b'],
                keywords: ['gradient']
            },
            {
                colors: ['#d0b8ac', '#f3d8c7', '#efe5dc', '#fbfefb'],
                keywords: ['pastel', 'gray', 'gradient']
            },
            {
                colors: ['#efc7c2', '#ffe5d4', '#bfd3c1', '#68a691'],
                keywords: ['gradient']
            },
            {
                colors: ['#5fad56', '#f2c14e', '#f78154', '#4d9078'],
                keywords: ['green', 'orange']
            },
            {
                colors: ['#f7b267', '#f79d65', '#f4845f', '#f27059'],
                keywords: ['orange', 'warm', 'pastel', 'red', 'gradient']
            },
            {
                colors: ['#05668d', '#028090', '#00a896', '#02c39a'],
                keywords: ['cold', 'turquoise', 'gradient']
            },
            {
                colors: ['#ffee32', '#ffd100', '#202020', '#4d4d4d'],
                keywords: ['yellow', 'gray', 'gradient']
            },
            {
                colors: ['#f4f1de', '#e07a5f', '#3d405b', '#81b29a'],
                keywords: []
            },
            {
                colors: ['#04151f', '#183a37', '#efd6ac', '#c44900'],
                keywords: []
            },
            {
                colors: ['#687351', '#9ba17f', '#e8e4db', '#c9c1ae'],
                keywords: ['green', 'warm', 'vintage', 'gradient']
            },
            {
                colors: ['#813405', '#d45113', '#f9a03f', '#f8dda4'],
                keywords: ['warm', 'orange']
            },
            {
                colors: ['#ffbe0b', '#fb5607', '#ff006e', '#8338ec'],
                keywords: ['orange']
            },
            {
                colors: ['#ffc09f', '#ffee93', '#fcf5c7', '#a0ced9'],
                keywords: ['pastel']
            },
            {
                colors: ['#90f1ef', '#ffd6e0', '#ffef9f', '#c1fba4'],
                keywords: ['pastel']
            },
            {
                colors: ['#0a2463', '#3e92cc', '#fffaff', '#d8315b'],
                keywords: ['blue']
            },
            {
                colors: ['#9b5de5', '#f15bb5', '#fee440', '#00bbf9'],
                keywords: []
            },
            {
                colors: ['#f79256', '#fbd1a2', '#7dcfb6', '#00b2ca'],
                keywords: ['turquoise', 'gradient']
            },
            {
                colors: ['#540d6e', '#ee4266', '#ffd23f', '#3bceac'],
                keywords: []
            },
            {
                colors: ['#5aa9e6', '#7fc8f8', '#f9f9f9', '#ffe45e'],
                keywords: ['blue', 'pastel', 'gradient']
            },
            {
                colors: ['#403f4c', '#2c2b3c', '#1b2432', '#121420'],
                keywords: ['cold', 'dark', 'gradient']
            },
            {
                colors: ['#03045e', '#0077b6', '#00b4d8', '#90e0ef'],
                keywords: ['blue', 'cold', 'turquoise', 'gradient']
            },
            {
                colors: ['#e7ecef', '#274c77', '#6096ba', '#a3cef1'],
                keywords: ['cold', 'blue', 'monochromatic']
            },
        ]
    },
    {
        label: '5',
        colors: [
            {
                colors: ['#cdb4db', '#ffc8dd', '#ffafcc', '#bde0fe', '#a2d2ff']
            },
            {
                colors: ['#606c38', '#283618', '#fefae0', '#dda15e', '#bc6c25']
            },
            {
                colors: ['#264653', '#2a9d8f', '#e9c46a', '#f4a261', '#e76f51']
            },
            {
                colors: ['#ccd5ae', '#e9edc9', '#fefae0', '#faedcd', '#d4a373']
            },
            {
                colors: ['#8ecae6', '#219ebc', '#023047', '#ffb703', '#fb8500']
            },
            {
                colors: ['#e63946', '#f1faee', '#a8dadc', '#457b9d', '#1d3557']
            },
            {
                colors: ['#ffe5ec', '#ffc2d1', '#ffb3c6', '#ff8fab', '#fb6f92'],
                keywords: ['warm', 'pastel', 'pink', 'gradient', 'monochromatic']
            },
            {
                colors: ['#07beb8', '#3dccc7', '#68d8d6', '#9ceaef', '#c4fff9'],
                keywords: ['turquoise', 'cold', 'gradient', 'monochromatic']
            },
            {
                colors: ['#00a6fb', '#0582ca', '#006494', '#003554', '#051923'],
                keywords: ['blue', 'cold', 'gradient', 'monochromatic']
            },
            {
                colors: ['#ef6351', '#f38375', '#f7a399', '#fbc3bc', '#ffe3e0'],
                keywords: ['red', 'warm', 'gradient', 'monochromatic']
            },
            {
                colors: ['#03b5aa', '#037971', '#023436', '#00bfb3', '#049a8f'],
                keywords: ['turquoise', 'cold', 'gradient', 'monochromatic']
            },
            {
                colors: ['#022f40', '#38aecc', '#0090c1', '#183446', '#046e8f'],
                keywords: ['blue', 'cold', 'gradient', 'monochromatic']
            },
            {
                colors: ['#00b9ae', '#037171', '#03312e', '#02c3bd', '#009f93'],
                keywords: ['turquoise', 'cold', 'gradient', 'monochromatic']
            },
            {
                colors: ['#274060', '#335c81', '#65afff', '#1b2845', '#5899e2'],
                keywords: ['cold', 'blue', 'monochromatic']
            },
            {
                colors: ['#f6f2f0', '#f3e7e4', '#e7d1c9', '#f1e7dd', '#d0b49f'],
                keywords: ['gray', 'warm', 'pastel', 'gradient', 'monochromatic']
            },
            {
                colors: ['#f6f6f6', '#e8e8e8', '#333333', '#990100', '#b90504'],
                keywords: ['gray', 'red', 'gradient', 'monochromatic']
            },
            {
                colors: ['#c41e3d', '#7d1128', '#ff2c55', '#3c0919', '#e2294f'],
                keywords: ['red', 'warm', 'monochromatic']
            },
            {
                colors: ['#50ffb1', '#4fb286', '#3c896d', '#546d64', '#4d685a'],
                keywords: ['green', 'cold', 'gradient', 'monochromatic']
            },
            {
                colors: ['#c9fbff', '#c2fcf7', '#85bdbf', '#57737a', '#040f0f'],
                keywords: ['turquoise', 'gradient', 'monochromatic']
            },
            {
                colors: ['#ffd289', '#facc6b', '#ffd131', '#f5b82e', '#f4ac32'],
                keywords: ['warm', 'orange', 'gradient', 'monochromatic']
            },
            {
                colors: ['#bee6ce', '#bcffdb', '#8dffcd', '#68d89b', '#4f9d69'],
                keywords: ['cold', 'green', 'gradient', 'monochromatic']
            },
            {
                colors: ['#a1cca5', '#8fb996', '#709775', '#415d43', '#111d13'],
                keywords: ['green', 'cold', 'gradient', 'monochromatic']
            },
            {
                colors: ['#595959', '#7f7f7f', '#a5a5a5', '#cccccc', '#f2f2f2'],
                keywords: ['gray', 'warm', 'gradient', 'monochromatic']
            },
            {
                colors: ['#f4dbd8', '#bea8a7', '#c09891', '#775144', '#2a0800'],
                keywords: ['gradient', 'monochromatic']
            },
            {
                colors: ['#f4effa', '#2f184b', '#532b88', '#9b72cf', '#c8b1e4'],
                keywords: ['cold', 'violet', 'gradient', 'monochromatic']
            },
            {
                colors: ['#6f4e37', '#a67b5b', '#fed8b1', '#d99a6c', '#ecb176'],
                keywords: ['brown', 'warm', 'vintage', 'gradient', 'monochromatic']
            },
            {
                colors: ['#e4b1ab', '#fbc3bc', '#fde1de', '#fef0ef', '#ffffff'],
                keywords: ['warm', 'pastel', 'gray', 'gradient', 'monochromatic']
            },
            {
                colors: ['#5e3719', '#735238', '#886e58', '#9d8977', '#b2a496'],
                keywords: ['brown', 'warm', 'gradient', 'monochromatic']
            },
            {
                colors: ['#002029', '#00303d', '#004052', '#005066', '#00607a'],
                keywords: ['cold', 'dark', 'blue', 'gradient', 'monochromatic']
            },
            {
                colors: ['#0f0606', '#200b0b', '#2f0000', '#490000', '#650000'],
                keywords: ['dark', 'red', 'gradient', 'monochromatic']
            },
            {
                colors: ['#ede0d4', '#e6ccb2', '#ddb892', '#b08968', '#7f5539'],
                keywords: ['warm', 'vintage', 'brown', 'gradient', 'monochromatic']
            },
            {
                colors: ['#72bbce', '#8dc8d8', '#a7d5e1', '#c2e2ea', '#dceef3'],
                keywords: ['blue', 'cold', 'pastel', 'gradient', 'monochromatic']
            },
            {
                colors: ['#e6ccb2', '#ddb892', '#b08968', '#7f5539', '#9c6644'],
                keywords: ['warm', 'vintage', 'brown', 'gradient', 'monochromatic']
            },
            {
                colors: ['#deefb7', '#c8dd96', '#9bb55f', '#728740', '#56682c'],
                keywords: ['green', 'warm', 'vintage', 'gradient', 'monochromatic']
            }
        ]
    },
    {
        label: 'Diverging',
        colors: [
            {
                colors: [
                    '#f72585',
                    '#b5179e',
                    '#7209b7',
                    '#560bad',
                    '#480ca8',
                    '#3a0ca3',
                    '#3f37c9',
                    '#4361ee',
                    '#4895ef',
                    '#4cc9f0'
                ]
            },
            {
                colors: [
                    '#582f0e',
                    '#7f4f24',
                    '#936639',
                    '#a68a64',
                    '#b6ad90',
                    '#c2c5aa',
                    '#a4ac86',
                    '#656d4a',
                    '#414833',
                    '#333d29'
                ]
            }
        ]
    },
    {
        label: 'Sequential (Single Hue)',
        colors: [
            {
                colors: ['#03045e', '#023e8a', '#0077b6', '#0096c7', '#00b4d8', '#48cae4', '#90e0ef', '#ade8f4', '#caf0f8']
            },
            {
                colors: ['#ede0d4', '#e6ccb2', '#ddb892', '#b08968', '#7f5539', '#9c6644'],
                keywords: ['warm', 'vintage', 'brown', 'gradient', 'monochromatic']
            },
            {
                colors: ['#f8f9fa', '#e9ecef', '#dee2e6', '#ced4da', '#adb5bd', '#6c757d', '#495057', '#343a40', '#212529'],
                keywords: ['gray', 'cold', 'gradient', 'monochromatic']
            },
            {
                colors: [
                    '#edc4b3',
                    '#e6b8a2',
                    '#deab90',
                    '#d69f7e',
                    '#cd9777',
                    '#c38e70',
                    '#b07d62',
                    '#9d6b53',
                    '#8a5a44',
                    '#774936'
                ],
                keywords: ['warm', 'brown', 'gradient', 'monochromatic']
            },
            {
                colors: [
                    '#590d22',
                    '#800f2f',
                    '#a4133c',
                    '#c9184a',
                    '#ff4d6d',
                    '#ff758f',
                    '#ff8fa3',
                    '#ffb3c1',
                    '#ffccd5',
                    '#fff0f3'
                ],
                keywords: ['pink', 'warm', 'red', 'gradient', 'monochromatic']
            },
            {
                colors: ['#edf2fb', '#e2eafc', '#d7e3fc', '#ccdbfd', '#c1d3fe', '#b6ccfe', '#abc4ff'],
                keywords: ['cold', 'pastel', 'blue', 'gradient', 'monochromatic']
            },
            {
                colors: ['#e9f5db', '#cfe1b9', '#b5c99a', '#97a97c', '#87986a', '#718355'],
                keywords: ['cold', 'vintage', 'green', 'gradient', 'monochromatic']
            },
            {
                colors: [
                    '#ff0a54',
                    '#ff477e',
                    '#ff5c8a',
                    '#ff7096',
                    '#ff85a1',
                    '#ff99ac',
                    '#fbb1bd',
                    '#f9bec7',
                    '#f7cad0',
                    '#fae0e4'
                ],
                keywords: ['pink', 'warm', 'red', 'gradient', 'monochromatic']
            },
            {
                colors: [
                    '#641220',
                    '#6e1423',
                    '#85182a',
                    '#a11d33',
                    '#a71e34',
                    '#b21e35',
                    '#bd1f36',
                    '#c71f37',
                    '#da1e37',
                    '#e01e37'
                ],
                keywords: ['red', 'warm', 'gradient', 'monochromatic']
            },
            {
                colors: [
                    '#ffedd8',
                    '#f3d5b5',
                    '#e7bc91',
                    '#d4a276',
                    '#bc8a5f',
                    '#a47148',
                    '#8b5e34',
                    '#6f4518',
                    '#603808',
                    '#583101'
                ],
                keywords: ['warm', 'brown', 'gradient', 'monochromatic']
            },
            {
                colors: [
                    '#ffe169',
                    '#fad643',
                    '#edc531',
                    '#dbb42c',
                    '#c9a227',
                    '#b69121',
                    '#a47e1b',
                    '#926c15',
                    '#805b10',
                    '#76520e'
                ],
                keywords: ['warm', 'yellow', 'brown', 'gradient', 'monochromatic']
            },
            {
                colors: ['#ffe0e9', '#ffc2d4', '#ff9ebb', '#ff7aa2', '#e05780', '#b9375e', '#8a2846', '#602437', '#522e38'],
                keywords: ['warm', 'pink', 'gradient', 'monochromatic']
            },
            {
                colors: [
                    '#10451d',
                    '#155d27',
                    '#1a7431',
                    '#208b3a',
                    '#25a244',
                    '#2dc653',
                    '#4ad66d',
                    '#6ede8a',
                    '#92e6a7',
                    '#b7efc5'
                ],
                keywords: ['green', 'cold', 'gradient', 'monochromatic']
            },
            {
                colors: ['#352208', '#e1bb80', '#7b6b43', '#685634', '#806443'],
                keywords: ['brown', 'warm', 'monochromatic']
            },
            {
                colors: ['#aaaaaa', '#bbbbbb', '#cccccc', '#dddddd', '#eeeeee'],
                keywords: ['gray', 'warm', 'gradient', 'monochromatic']
            },
            {
                colors: ['#b9d6f2', '#061a40', '#0353a4', '#006daa', '#003559'],
                keywords: ['cold', 'blue', 'gradient', 'monochromatic']
            },
            {
                colors: ['#c52233', '#a51c30', '#a7333f', '#74121d', '#580c1f'],
                keywords: ['red', 'warm', 'gradient', 'monochromatic']
            },
            {
                colors: ['#f9dc5c', '#fae588', '#fcefb4', '#fdf8e1', '#f9dc5c'],
                keywords: ['yellow', 'warm', 'pastel', 'monochromatic']
            },
            {
                colors: ['#3e92cc', '#2a628f', '#13293d', '#16324f', '#18435a'],
                keywords: ['blue', 'cold', 'gradient', 'monochromatic']
            },
            {
                colors: [
                    '#fffae5',
                    '#fff6cc',
                    '#fff2b2',
                    '#ffee99',
                    '#ffe97f',
                    '#ffe566',
                    '#ffe14c',
                    '#ffdd32',
                    '#ffd819',
                    '#ffd400'
                ],
                keywords: ['warm', 'yellow', 'gradient', 'monochromatic']
            },
            {
                colors: ['#410b13', '#cd5d67', '#ba1f33', '#421820', '#91171f'],
                keywords: ['warm', 'red', 'monochromatic']
            },
            {
                colors: [
                    '#774936',
                    '#6e4230',
                    '#653a2a',
                    '#5c3324',
                    '#532c1e',
                    '#4a2419',
                    '#411d13',
                    '#38160d',
                    '#2f0e07',
                    '#260701'
                ],
                keywords: ['brown', 'dark', 'gradient', 'monochromatic']
            },
            {
                colors: [
                    '#00111c',
                    '#001523',
                    '#001a2c',
                    '#002137',
                    '#00253e',
                    '#002945',
                    '#002e4e',
                    '#003356',
                    '#003a61',
                    '#00406c'
                ],
                keywords: ['cold', 'dark', 'blue', 'gradient', 'monochromatic']
            },
            {
                colors: [
                    '#ffdcc2',
                    '#ffd1ad',
                    '#ffc599',
                    '#eda268',
                    '#da7e37',
                    '#c06722',
                    '#a85311',
                    '#8f3e00',
                    '#713200',
                    '#522500'
                ],
                keywords: ['warm', 'brown', 'gradient', 'monochromatic']
            },
            {
                colors: ['#00487c', '#4bb3fd', '#3e6680', '#0496ff', '#027bce'],
                keywords: ['blue', 'cold', 'monochromatic']
            },
            {
                colors: [
                    '#9c191b',
                    '#ac1c1e',
                    '#bd1f21',
                    '#d02224',
                    '#dd2c2f',
                    '#e35053',
                    '#e66063',
                    '#ec8385',
                    '#f1a7a9',
                    '#f6cacc'
                ],
                keywords: ['red', 'warm', 'gradient', 'monochromatic']
            },
            {
                colors: ['#f8f9fb', '#e1ecf7', '#aecbeb', '#83b0e1', '#71a5de'],
                keywords: ['gray', 'cold', 'pastel', 'blue', 'gradient', 'monochromatic']
            },
            {
                colors: ['#a48971', '#8d6b48', '#9a774f', '#a9845a', '#be986d', '#d2a87d', '#e8c9ab', '#f5d7bd'],
                keywords: ['brown', 'warm', 'vintage', 'gradient', 'monochromatic']
            },
            {
                colors: ['#9dd9d2', '#79bcb8', '#5ec2b7', '#2ca6a4', '#3aa7a3'],
                keywords: ['turquoise', 'cold', 'gradient', 'monochromatic']
            },
            {
                colors: [
                    '#e9f5db',
                    '#dcebca',
                    '#cfe1b9',
                    '#c2d5aa',
                    '#b5c99a',
                    '#a6b98b',
                    '#97a97c',
                    '#849669',
                    '#728359',
                    '#606f49'
                ],
                keywords: ['cold', 'vintage', 'green', 'gradient', 'monochromatic']
            },
            {
                colors: [
                    '#310055',
                    '#3c0663',
                    '#4a0a77',
                    '#5a108f',
                    '#6818a5',
                    '#8b2fc9',
                    '#ab51e3',
                    '#bd68ee',
                    '#d283ff',
                    '#dc97ff'
                ],
                keywords: ['violet', 'cold', 'gradient', 'monochromatic']
            },
            {
                colors: ['#424342', '#244f26', '#256d1b', '#149911', '#1efc1e'],
                keywords: ['cold', 'green', 'gradient', 'monochromatic']
            },
            {
                colors: [
                    '#ffffb7',
                    '#fff8a5',
                    '#fff599',
                    '#fff185',
                    '#ffee70',
                    '#ffec5c',
                    '#ffe747',
                    '#ffe433',
                    '#ffdd1f',
                    '#ffda0a'
                ],
                keywords: ['warm', 'yellow', 'gradient', 'monochromatic']
            },
            {
                colors: [
                    '#e5d4c3',
                    '#e5c9ae',
                    '#debea2',
                    '#d6ab7d',
                    '#b3895d',
                    '#9b744a',
                    '#81583a',
                    '#734f38',
                    '#553725',
                    '#482919'
                ],
                keywords: ['warm', 'brown', 'gradient', 'monochromatic']
            },
            {
                colors: ['#2b0000', '#4f0000', '#740000', '#980000', '#b50000', '#d30000', '#eb1d1d', '#f50f0f', '#ff0000'],
                keywords: ['red', 'gradient', 'monochromatic']
            },
            {
                colors: ['#d6ccc2', '#ded6ce', '#e5ded8', '#eeeae6', '#e3d5ca', '#f5ebe0'],
                keywords: ['gray', 'warm', 'pastel', 'vintage', 'gradient', 'monochromatic']
            },
            {
                colors: [
                    '#643100',
                    '#763a00',
                    '#7f3e00',
                    '#914600',
                    '#af5500',
                    '#b96619',
                    '#c27731',
                    '#cb8849',
                    '#d49961',
                    '#eacaae'
                ],
                keywords: ['brown', 'warm', 'orange', 'gradient', 'monochromatic']
            },
            {
                colors: [
                    '#0f3375',
                    '#13459c',
                    '#1557c0',
                    '#196bde',
                    '#2382f7',
                    '#4b9cf9',
                    '#77b6fb',
                    '#a4cefc',
                    '#cce4fd',
                    '#e8f3fe'
                ],
                keywords: ['blue', 'cold', 'gradient', 'monochromatic']
            },
            {
                colors: ['#3a015c', '#32004f', '#220135', '#190028', '#11001c'],
                keywords: ['violet', 'cold', 'dark', 'gradient', 'monochromatic']
            },
            {
                colors: [
                    '#ffe169',
                    '#fad643',
                    '#edc531',
                    '#dbb42c',
                    '#c9a227',
                    '#b69121',
                    '#a47e1b',
                    '#926c15',
                    '#805b10',
                    '#6e4c0d'
                ],
                keywords: ['warm', 'yellow', 'brown', 'gradient', 'monochromatic']
            },
            {
                colors: ['#ede0d4', '#e6ccb2', '#ddb892', '#b08968', '#9c6644', '#7f5539'],
                keywords: ['warm', 'vintage', 'brown', 'gradient', 'monochromatic']
            },
            {
                colors: ['#daf2d7', '#e4fde1', '#c6edc3', '#a7dca5', '#90cf8e'],
                keywords: ['cold', 'pastel', 'green', 'gradient', 'monochromatic']
            },
            {
                colors: [
                    '#7400b8',
                    '#8013bd',
                    '#8b26c3',
                    '#9739c8',
                    '#a24ccd',
                    '#ae60d3',
                    '#b973d8',
                    '#c586dd',
                    '#d099e3',
                    '#dcace8'
                ],
                keywords: ['violet', 'cold', 'pink', 'gradient', 'monochromatic']
            },
            {
                colors: [
                    '#fff7d1',
                    '#fffceb',
                    '#fff3b7',
                    '#ffee9d',
                    '#ffea83',
                    '#ffe568',
                    '#ffe14e',
                    '#ffdc34',
                    '#ffd81a',
                    '#ffd300'
                ],
                keywords: ['warm', 'yellow', 'gradient', 'monochromatic']
            },
            {
                colors: ['#eef6fc', '#cbe5f6', '#97caed', '#63b0e3', '#3498db', '#2280bf', '#185d8b', '#0f3a57'],
                keywords: ['cold', 'blue', 'gradient', 'monochromatic']
            },
            {
                colors: ['#b9375e', '#e05780', '#ff7aa2', '#ff9ebb', '#ffc2d4', '#ffe0e9'],
                keywords: ['pink', 'warm', 'gradient', 'monochromatic']
            },
            {
                colors: ['#5f5449', '#9b8269', '#afa193', '#ddd4cc', '#fcf3ea'],
                keywords: ['brown', 'warm', 'gray', 'gradient', 'monochromatic']
            },
            {
                colors: ['#fc9ca2', '#fb747d', '#fa4c58', '#f92432', '#e30613', '#c70512', '#9f040e', '#77030b', '#500207'],
                keywords: ['red', 'warm', 'gradient', 'monochromatic']
            },
            {
                colors: ['#e1d8f7', '#d7c8f3', '#d0bef2', '#c0a7eb', '#b596e5'],
                keywords: ['cold', 'pastel', 'violet', 'gradient', 'monochromatic']
            },
            {
                colors: ['#00132d', '#00193b', '#001e45', '#002657', '#002d67', '#00377e'],
                keywords: ['cold', 'dark', 'blue', 'gradient', 'monochromatic']
            },
            {
                colors: [
                    '#36241c',
                    '#422c22',
                    '#4d3328',
                    '#644234',
                    '#815f51',
                    '#aa8b7e',
                    '#d3b6ab',
                    '#e6d5ce',
                    '#f0e5e1',
                    '#f9f5f3'
                ],
                keywords: ['brown', 'warm', 'gradient', 'monochromatic']
            },
            {
                colors: ['#f8f0e5', '#956b4b', '#e2c7aa', '#8f857b', '#b19a81'],
                keywords: ['warm', 'vintage', 'brown', 'monochromatic']
            },
            {
                colors: ['#780000', '#660000', '#520000', '#3d0000', '#290000'],
                keywords: ['red', 'dark', 'gradient', 'monochromatic']
            },
            {
                colors: [
                    '#ff0072',
                    '#ff177f',
                    '#ff2e8c',
                    '#ff4598',
                    '#ff5ca5',
                    '#ff74b2',
                    '#ff8bbf',
                    '#ffa2cb',
                    '#ffb9d8',
                    '#ffd0e5'
                ],
                keywords: ['pink', 'cold', 'gradient', 'monochromatic']
            },
            {
                colors: [
                    '#cba48b',
                    '#d4af96',
                    '#dcb9a1',
                    '#e4c3af',
                    '#ebcfbc',
                    '#846552',
                    '#8f705b',
                    '#997a66',
                    '#a48470',
                    '#ae8f7a'
                ],
                keywords: ['warm', 'vintage', 'brown', 'gradient', 'monochromatic']
            },
            {
                colors: [
                    '#20331a',
                    '#33512a',
                    '#446c37',
                    '#558745',
                    '#66a253',
                    '#7cb36b',
                    '#94c186',
                    '#abcea1',
                    '#c3dcbc',
                    '#dbead7'
                ],
                keywords: ['cold', 'green', 'gradient', 'monochromatic']
            },
            {
                colors: [
                    '#e9f5db',
                    '#cfe1b9',
                    '#b5c99a',
                    '#97a97c',
                    '#87986a',
                    '#718355',
                    '#8d9c77',
                    '#a4b092',
                    '#b6c0a8',
                    '#c5cdb9'
                ],
                keywords: ['cold', 'vintage', 'green', 'gradient', 'monochromatic']
            },
            {
                colors: ['#dec09a', '#fff0cf', '#eed7a3', '#d8cba8', '#d9b285', '#f0dcc5', '#dcc5a0', '#d9af82', '#dcc5a0'],
                keywords: ['warm', 'pastel', 'vintage', 'gradient', 'monochromatic']
            },
            {
                colors: ['#ffe169', '#edc531', '#c9a227', '#a47e1b', '#805b10'],
                keywords: ['warm', 'yellow', 'brown', 'gradient', 'monochromatic']
            },
            {
                colors: ['#064789', '#427aa1', '#ebf2fa'],
                keywords: ['blue', 'cold', 'gradient', 'monochromatic']
            },
            {
                colors: ['#9381ff', '#b8b8ff', '#f8f7ff'],
                keywords: ['blue', 'cold', 'pastel', 'gradient', 'monochromatic']
            },
            {
                colors: ['#e7decd', '#efe8db', '#f4efe6', '#faf7f0', '#fbfaf8'],
                keywords: ['warm', 'pastel', 'vintage', 'gray', 'gradient', 'monochromatic']
            },
            {
                colors: ['#0a2d27', '#13594e', '#1d8676', '#26b29d', '#30dfc4', '#59e5d0', '#83ecdc', '#acf2e7', '#d6f9f3'],
                keywords: ['cold', 'turquoise', 'gradient', 'monochromatic']
            },
            {
                colors: [
                    '#ffd400',
                    '#ffd819',
                    '#ffdd32',
                    '#ffe14c',
                    '#ffe566',
                    '#ffe97f',
                    '#ffee99',
                    '#fff2b2',
                    '#fff6cc',
                    '#fffae5'
                ],
                keywords: ['yellow', 'warm', 'gradient', 'monochromatic']
            },
            {
                colors: ['#001d52', '#002c66', '#00397a', '#01458d', '#024fa1', '#045cb4', '#0466c8', '#0470dc', '#057af0'],
                keywords: ['blue', 'cold', 'gradient', 'monochromatic']
            },
            {
                colors: [
                    '#000e14',
                    '#00111a',
                    '#00141f',
                    '#001824',
                    '#001b29',
                    '#002233',
                    '#00293d',
                    '#003047',
                    '#003652',
                    '#003d5c'
                ],
                keywords: ['dark', 'blue', 'gradient', 'monochromatic']
            },
        ]
    },
    {
        label: 'Sequential (Multi Hue)',
        colors: [
            {
                colors: [
                    '#d9ed92',
                    '#b5e48c',
                    '#99d98c',
                    '#76c893',
                    '#52b69a',
                    '#34a0a4',
                    '#168aad',
                    '#1a759f',
                    '#1e6091',
                    '#184e77'
                ]
            },
            {
                colors: [
                    '#fec5bb',
                    '#fcd5ce',
                    '#fae1dd',
                    '#f8edeb',
                    '#e8e8e4',
                    '#d8e2dc',
                    '#ece4db',
                    '#ffe5d9',
                    '#ffd7ba',
                    '#fec89a'
                ],
                keywords: ['pastel', 'gray', 'gradient']
            },
            {
                colors: [
                    '#03071e',
                    '#370617',
                    '#6a040f',
                    '#9d0208',
                    '#d00000',
                    '#dc2f02',
                    '#e85d04',
                    '#f48c06',
                    '#faa307',
                    '#ffba08'
                ],
                keywords: ['red', 'orange', 'gradient']
            },
            {
                colors: [
                    '#f72585',
                    '#b5179e',
                    '#7209b7',
                    '#560bad',
                    '#480ca8',
                    '#3a0ca3',
                    '#3f37c9',
                    '#4361ee',
                    '#4895ef',
                    '#4cc9f0'
                ],
                keywords: ['cold', 'violet', 'blue', 'gradient']
            },
            {
                colors: [
                    '#001219',
                    '#005f73',
                    '#0a9396',
                    '#94d2bd',
                    '#e9d8a6',
                    '#ee9b00',
                    '#ca6702',
                    '#bb3e03',
                    '#ae2012',
                    '#9b2226'
                ],
                keywords: ['gradient']
            },
            {
                colors: [
                    '#7400b8',
                    '#6930c3',
                    '#5e60ce',
                    '#5390d9',
                    '#4ea8de',
                    '#48bfe3',
                    '#56cfe1',
                    '#64dfdf',
                    '#72efdd',
                    '#80ffdb'
                ],
                keywords: ['cold', 'blue', 'turquoise', 'gradient']
            },
            {
                colors: [
                    '#f94144',
                    '#f3722c',
                    '#f8961e',
                    '#f9844a',
                    '#f9c74f',
                    '#90be6d',
                    '#43aa8b',
                    '#4d908e',
                    '#577590',
                    '#277da1'
                ],
                keywords: ['orange', 'gradient']
            },
            {
                colors: [
                    '#d9ed92',
                    '#b5e48c',
                    '#99d98c',
                    '#76c893',
                    '#52b69a',
                    '#34a0a4',
                    '#168aad',
                    '#1a759f',
                    '#1e6091',
                    '#184e77'
                ],
                keywords: ['green', 'blue', 'gradient']
            },
            {
                colors: [
                    '#ffcbf2',
                    '#f3c4fb',
                    '#ecbcfd',
                    '#e5b3fe',
                    '#e2afff',
                    '#deaaff',
                    '#d8bbff',
                    '#d0d1ff',
                    '#c8e7ff',
                    '#c0fdff'
                ],
                keywords: ['cold', 'pastel', 'violet', 'gradient']
            },
            {
                colors: [
                    '#007f5f',
                    '#2b9348',
                    '#55a630',
                    '#80b918',
                    '#aacc00',
                    '#bfd200',
                    '#d4d700',
                    '#dddf00',
                    '#eeef20',
                    '#ffff3f'
                ],
                keywords: ['green', 'yellow', 'gradient']
            },
            {
                colors: [
                    '#0b090a',
                    '#161a1d',
                    '#660708',
                    '#a4161a',
                    '#ba181b',
                    '#e5383b',
                    '#b1a7a6',
                    '#d3d3d3',
                    '#f5f3f4',
                    '#ffffff'
                ],
                keywords: ['red', 'gray', 'gradient']
            },
            {
                colors: [
                    '#582f0e',
                    '#7f4f24',
                    '#936639',
                    '#a68a64',
                    '#b6ad90',
                    '#c2c5aa',
                    '#a4ac86',
                    '#656d4a',
                    '#414833',
                    '#333d29'
                ],
                keywords: ['brown', 'green', 'gradient']
            },
            {
                colors: [
                    '#012a4a',
                    '#013a63',
                    '#01497c',
                    '#014f86',
                    '#2a6f97',
                    '#2c7da0',
                    '#468faf',
                    '#61a5c2',
                    '#89c2d9',
                    '#a9d6e5'
                ],
                keywords: ['blue', 'cold', 'gradient']
            },
            {
                colors: [
                    '#0466c8',
                    '#0353a4',
                    '#023e7d',
                    '#002855',
                    '#001845',
                    '#001233',
                    '#33415c',
                    '#5c677d',
                    '#7d8597',
                    '#979dac'
                ],
                keywords: ['blue', 'cold', 'gradient']
            },
            {
                colors: [
                    '#006466',
                    '#065a60',
                    '#0b525b',
                    '#144552',
                    '#1b3a4b',
                    '#212f45',
                    '#272640',
                    '#312244',
                    '#3e1f47',
                    '#4d194d'
                ],
                keywords: ['cold', 'dark', 'gradient']
            },
            {
                colors: [
                    '#fbf8cc',
                    '#fde4cf',
                    '#ffcfd2',
                    '#f1c0e8',
                    '#cfbaf0',
                    '#a3c4f3',
                    '#90dbf4',
                    '#8eecf5',
                    '#98f5e1',
                    '#b9fbc0'
                ],
                keywords: ['pastel', 'gradient']
            },
            {
                colors: [
                    '#ff7b00',
                    '#ff8800',
                    '#ff9500',
                    '#ffa200',
                    '#ffaa00',
                    '#ffb700',
                    '#ffc300',
                    '#ffd000',
                    '#ffdd00',
                    '#ffea00'
                ],
                keywords: ['orange', 'warm', 'bright', 'yellow', 'gradient']
            },
            {
                colors: [
                    '#ff6d00',
                    '#ff7900',
                    '#ff8500',
                    '#ff9100',
                    '#ff9e00',
                    '#240046',
                    '#3c096c',
                    '#5a189a',
                    '#7b2cbf',
                    '#9d4edd'
                ],
                keywords: ['orange', 'violet', 'gradient']
            },
            {
                colors: [
                    '#2d00f7',
                    '#6a00f4',
                    '#8900f2',
                    '#a100f2',
                    '#b100e8',
                    '#bc00dd',
                    '#d100d1',
                    '#db00b6',
                    '#e500a4',
                    '#f20089'
                ],
                keywords: ['violet', 'cold', 'bright', 'pink', 'gradient']
            },
            {
                colors: [
                    '#eddcd2',
                    '#fff1e6',
                    '#fde2e4',
                    '#fad2e1',
                    '#c5dedd',
                    '#dbe7e4',
                    '#f0efeb',
                    '#d6e2e9',
                    '#bcd4e6',
                    '#99c1de'
                ],
                keywords: ['pastel', 'gradient']
            },
            {
                colors: [
                    '#e2e2df',
                    '#d2d2cf',
                    '#e2cfc4',
                    '#f7d9c4',
                    '#faedcb',
                    '#c9e4de',
                    '#c6def1',
                    '#dbcdf0',
                    '#f2c6de',
                    '#f9c6c9'
                ],
                keywords: ['pastel', 'gradient']
            },
            {
                colors: [
                    '#ff4800',
                    '#ff5400',
                    '#ff6000',
                    '#ff6d00',
                    '#ff7900',
                    '#ff8500',
                    '#ff9100',
                    '#ff9e00',
                    '#ffaa00',
                    '#ffb600'
                ],
                keywords: ['orange', 'warm', 'bright', 'gradient']
            },
            {
                colors: [
                    '#797d62',
                    '#9b9b7a',
                    '#baa587',
                    '#d9ae94',
                    '#f1dca7',
                    '#ffcb69',
                    '#e8ac65',
                    '#d08c60',
                    '#b58463',
                    '#997b66'
                ],
                keywords: ['warm', 'vintage', 'gradient']
            },
            {
                colors: [
                    '#99e2b4',
                    '#88d4ab',
                    '#78c6a3',
                    '#67b99a',
                    '#56ab91',
                    '#469d89',
                    '#358f80',
                    '#248277',
                    '#14746f',
                    '#036666'
                ],
                keywords: ['green', 'cold', 'turquoise', 'gradient']
            },
            {
                colors: [
                    '#54478c',
                    '#2c699a',
                    '#048ba8',
                    '#0db39e',
                    '#16db93',
                    '#83e377',
                    '#b9e769',
                    '#efea5a',
                    '#f1c453',
                    '#f29e4c'
                ],
                keywords: ['gradient']
            },
            {
                colors: [
                    '#757bc8',
                    '#8187dc',
                    '#8e94f2',
                    '#9fa0ff',
                    '#ada7ff',
                    '#bbadff',
                    '#cbb2fe',
                    '#dab6fc',
                    '#ddbdfc',
                    '#e0c3fc'
                ],
                keywords: ['blue', 'cold', 'violet', 'gradient']
            },
            {
                colors: [
                    '#dec9e9',
                    '#dac3e8',
                    '#d2b7e5',
                    '#c19ee0',
                    '#b185db',
                    '#a06cd5',
                    '#9163cb',
                    '#815ac0',
                    '#7251b5',
                    '#6247aa'
                ],
                keywords: ['cold', 'violet', 'gradient']
            },
            {
                colors: [
                    '#ea698b',
                    '#d55d92',
                    '#c05299',
                    '#ac46a1',
                    '#973aa8',
                    '#822faf',
                    '#6d23b6',
                    '#6411ad',
                    '#571089',
                    '#47126b'
                ],
                keywords: ['pink', 'violet', 'gradient']
            },
            {
                colors: [
                    '#ff0000',
                    '#ff8700',
                    '#ffd300',
                    '#deff0a',
                    '#a1ff0a',
                    '#0aff99',
                    '#0aefff',
                    '#147df5',
                    '#580aff',
                    '#be0aff'
                ],
                keywords: ['bright']
            },
            {
                colors: [
                    '#e8a598',
                    '#ffb5a7',
                    '#fec5bb',
                    '#fcd5ce',
                    '#fae1dd',
                    '#f8edeb',
                    '#f9e5d8',
                    '#f9dcc4',
                    '#fcd2af',
                    '#fec89a'
                ],
                keywords: ['warm', 'pastel', 'gradient']
            },
            {
                colors: [
                    '#e3f2fd',
                    '#bbdefb',
                    '#90caf9',
                    '#64b5f6',
                    '#42a5f5',
                    '#2196f3',
                    '#1e88e5',
                    '#1976d2',
                    '#1565c0',
                    '#0d47a1'
                ],
                keywords: ['cold', 'blue', 'gradient']
            },
            {
                colors: [
                    '#b76935',
                    '#a56336',
                    '#935e38',
                    '#815839',
                    '#6f523b',
                    '#5c4d3c',
                    '#4a473e',
                    '#38413f',
                    '#263c41',
                    '#143642'
                ],
                keywords: ['brown', 'gradient']
            },
            {
                colors: [
                    '#ff5400',
                    '#ff6d00',
                    '#ff8500',
                    '#ff9100',
                    '#ff9e00',
                    '#00b4d8',
                    '#0096c7',
                    '#0077b6',
                    '#023e8a',
                    '#03045e'
                ],
                keywords: ['orange', 'blue', 'gradient']
            },
            {
                colors: [
                    '#3fc1c0',
                    '#20bac5',
                    '#00b2ca',
                    '#04a6c2',
                    '#0899ba',
                    '#0f80aa',
                    '#16679a',
                    '#1a5b92',
                    '#1c558e',
                    '#1d4e89'
                ],
                keywords: ['turquoise', 'cold', 'blue', 'gradient']
            },
            {
                colors: [
                    '#fff75e',
                    '#fff056',
                    '#ffe94e',
                    '#ffe246',
                    '#ffda3d',
                    '#ffd53e',
                    '#fecf3e',
                    '#fdc43f',
                    '#fdbe39',
                    '#fdb833'
                ],
                keywords: ['yellow', 'warm', 'orange', 'gradient']
            },
            {
                colors: [
                    '#e574bc',
                    '#ea84c9',
                    '#ef94d5',
                    '#f9b4ed',
                    '#eabaf6',
                    '#dabfff',
                    '#c4c7ff',
                    '#adcfff',
                    '#96d7ff',
                    '#7fdeff'
                ],
                keywords: ['pink', 'cold', 'pastel', 'blue', 'gradient']
            },
            {
                colors: [
                    '#053c5e',
                    '#1d3958',
                    '#353652',
                    '#4c334d',
                    '#643047',
                    '#7c2e41',
                    '#942b3b',
                    '#ab2836',
                    '#c32530',
                    '#db222a'
                ],
                keywords: ['red', 'gradient']
            },
            {
                colors: [
                    '#033270',
                    '#1368aa',
                    '#4091c9',
                    '#9dcee2',
                    '#fedfd4',
                    '#f29479',
                    '#f26a4f',
                    '#ef3c2d',
                    '#cb1b16',
                    '#65010c'
                ],
                keywords: ['blue', 'red', 'gradient']
            },
            {
                colors: [
                    '#ccd5ae',
                    '#dbe1bc',
                    '#e9edc9',
                    '#f4f4d5',
                    '#fefae0',
                    '#fcf4d7',
                    '#faedcd',
                    '#e7c8a0',
                    '#deb68a',
                    '#d4a373'
                ],
                keywords: ['warm', 'pastel', 'vintage', 'gradient']
            },
            {
                colors: [
                    '#5c0000',
                    '#751717',
                    '#ba0c0c',
                    '#ff0000',
                    '#ffebeb',
                    '#ecffeb',
                    '#27a300',
                    '#2a850e',
                    '#2d661b',
                    '#005c00'
                ],
                keywords: ['red', 'green', 'gradient']
            },
            {
                colors: [
                    '#8ecae6',
                    '#73bfdc',
                    '#58b4d1',
                    '#219ebc',
                    '#126782',
                    '#023047',
                    '#ffb703',
                    '#fd9e02',
                    '#fb8500',
                    '#fb9017'
                ],
                keywords: ['blue', 'orange', 'gradient']
            },
            {
                colors: [
                    '#97dffc',
                    '#93caf6',
                    '#8eb5f0',
                    '#858ae3',
                    '#7364d2',
                    '#613dc1',
                    '#5829a7',
                    '#4e148c',
                    '#461177',
                    '#3d0e61'
                ],
                keywords: ['blue', 'cold', 'violet', 'gradient']
            },
            {
                colors: [
                    '#baebff',
                    '#bbdbfe',
                    '#bccbfd',
                    '#bebcfc',
                    '#bfacfb',
                    '#c09cfa',
                    '#c18cf9',
                    '#c37df8',
                    '#c46df7',
                    '#c55df6'
                ],
                keywords: ['blue', 'cold', 'pastel', 'violet', 'gradient']
            },
            {
                colors: [
                    '#004733',
                    '#2b6a4d',
                    '#568d66',
                    '#a5c1ae',
                    '#f3f4f6',
                    '#dcdfe5',
                    '#df8080',
                    '#cb0b0a',
                    '#ad080f',
                    '#8e0413'
                ],
                keywords: ['red', 'gradient']
            },
            {
                colors: [
                    '#532a09',
                    '#7b4618',
                    '#915c27',
                    '#ad8042',
                    '#bfab67',
                    '#bfc882',
                    '#a4b75c',
                    '#647332',
                    '#3e4c22',
                    '#2e401c'
                ],
                keywords: ['brown', 'green', 'gradient']
            },
            {
                colors: [
                    '#fcac5d',
                    '#fcb75d',
                    '#fcbc5d',
                    '#fcc75d',
                    '#fccc5d',
                    '#fcd45d',
                    '#fcdc5d',
                    '#fce45d',
                    '#fcec5d',
                    '#fcf45d'
                ],
                keywords: ['orange', 'warm', 'pastel', 'yellow', 'gradient']
            },
            {
                colors: [
                    '#fff200',
                    '#ffe600',
                    '#ffd900',
                    '#ffcc00',
                    '#ffbf00',
                    '#ffb300',
                    '#ffa600',
                    '#ff9900',
                    '#ff8c00',
                    '#ff8000'
                ],
                keywords: ['yellow', 'warm', 'bright', 'orange', 'gradient']
            },
            {
                colors: [
                    '#669900',
                    '#99cc33',
                    '#ccee66',
                    '#006699',
                    '#3399cc',
                    '#990066',
                    '#cc3399',
                    '#ff6600',
                    '#ff9900',
                    '#ffcc00'
                ],
                keywords: ['gradient']
            },
            {
                colors: [
                    '#23233b',
                    '#2c4268',
                    '#007bba',
                    '#00a9e2',
                    '#7ccdf4',
                    '#bce3fa',
                    '#9b9c9b',
                    '#b2b0b0',
                    '#c5c6c6',
                    '#ebebeb'
                ],
                keywords: ['blue', 'gray', 'gradient']
            },
            {
                colors: [
                    '#ffb950',
                    '#ffad33',
                    '#ff931f',
                    '#ff7e33',
                    '#fa5e1f',
                    '#ec3f13',
                    '#b81702',
                    '#a50104',
                    '#8e0103',
                    '#7a0103'
                ],
                keywords: ['orange', 'warm', 'red', 'gradient']
            },
            {
                colors: [
                    '#eb5e28',
                    '#f27f34',
                    '#f9a03f',
                    '#f6b049',
                    '#f3c053',
                    '#a1c349',
                    '#94b33d',
                    '#87a330',
                    '#799431',
                    '#6a8532'
                ],
                keywords: ['orange', 'warm', 'green', 'gradient']
            },
            {
                colors: [
                    '#a1ef7a',
                    '#b0ef8e',
                    '#baf19c',
                    '#d0f4ba',
                    '#eaf8da',
                    '#dce9fc',
                    '#bbdef9',
                    '#9cd2f7',
                    '#89ccf6',
                    '#78c6f7'
                ],
                keywords: ['green', 'cold', 'pastel', 'blue', 'gradient']
            },
            {
                colors: [
                    '#a564d3',
                    '#b66ee8',
                    '#c879ff',
                    '#d689ff',
                    '#e498ff',
                    '#f2a8ff',
                    '#ffb7ff',
                    '#ffc4ff',
                    '#ffc9ff',
                    '#ffceff'
                ],
                keywords: ['violet', 'cold', 'pastel', 'pink', 'gradient']
            },
            {
                colors: [
                    '#0377a8',
                    '#118fb0',
                    '#1fa6b8',
                    '#2fb5c7',
                    '#3ec4d6',
                    '#51ccd1',
                    '#63d4cc',
                    '#8be8d7',
                    '#a0f1da',
                    '#b4fadc'
                ],
                keywords: ['cold', 'turquoise', 'gradient']
            },
            {
                colors: [
                    '#e6f2ff',
                    '#ccdcff',
                    '#b3beff',
                    '#9a99f2',
                    '#8b79d9',
                    '#805ebf',
                    '#6f46a6',
                    '#60308c',
                    '#511f73',
                    '#431259'
                ],
                keywords: ['cold', 'violet', 'gradient']
            },
            {
                colors: [
                    '#ffe863',
                    '#ffe150',
                    '#ffd93d',
                    '#facb2e',
                    '#f5bd1f',
                    '#722e9a',
                    '#682a92',
                    '#5d2689',
                    '#522882',
                    '#47297b'
                ],
                keywords: ['yellow', 'violet', 'gradient']
            },
            {
                colors: [
                    '#4a006f',
                    '#470a77',
                    '#45147e',
                    '#421e86',
                    '#3f288d',
                    '#3d3195',
                    '#3a3b9c',
                    '#3745a4',
                    '#354fab',
                    '#3259b3'
                ],
                keywords: ['violet', 'cold', 'blue', 'gradient']
            },
            {
                colors: [
                    '#0466c8',
                    '#0353a4',
                    '#023e7d',
                    '#002855',
                    '#001845',
                    '#001233',
                    '#38b000',
                    '#70e000',
                    '#9ef01a',
                    '#ccff33'
                ],
                keywords: ['blue', 'green', 'gradient']
            },
            {
                colors: [
                    '#421869',
                    '#491a74',
                    '#721cb8',
                    '#995bd5',
                    '#bf99f2',
                    '#9cf945',
                    '#8edf34',
                    '#80c423',
                    '#509724',
                    '#1f6924'
                ],
                keywords: ['cold', 'violet', 'green', 'gradient']
            },
            {
                colors: [
                    '#0450b4',
                    '#046dc8',
                    '#1184a7',
                    '#15a2a2',
                    '#6fb1a0',
                    '#b4418e',
                    '#d94a8c',
                    '#ea515f',
                    '#fe7434',
                    '#fea802'
                ],
                keywords: []
            },
            {
                colors: [
                    '#00193a',
                    '#002b53',
                    '#023f73',
                    '#034780',
                    '#7a0213',
                    '#a10220',
                    '#bf0a26',
                    '#cd0c2b',
                    '#131313',
                    '#262626'
                ],
                keywords: ['blue', 'red', 'gradient']
            },
            {
                colors: [
                    '#072ac8',
                    '#1360e2',
                    '#1e96fc',
                    '#60b6fb',
                    '#a2d6f9',
                    '#cfe57d',
                    '#fcf300',
                    '#fedd00',
                    '#ffc600',
                    '#ffcb17'
                ],
                keywords: ['blue', 'yellow', 'gradient']
            },
            {
                colors: [
                    '#461873',
                    '#58148e',
                    '#6910a8',
                    '#8c07dd',
                    '#9f21e3',
                    '#b333e9',
                    '#cb5df1',
                    '#dc93f6',
                    '#eabffa',
                    '#f7ebfd'
                ],
                keywords: ['violet', 'cold', 'pink', 'gradient']
            },
            {
                colors: [
                    '#e4a5ff',
                    '#deabff',
                    '#d8b1ff',
                    '#d1b7ff',
                    '#cbbdff',
                    '#c5c4ff',
                    '#bfcaff',
                    '#b8d0ff',
                    '#b2d6ff',
                    '#acdcff'
                ],
                keywords: ['cold', 'pastel', 'violet', 'blue', 'gradient']
            },
            {
                colors: [
                    '#0c3e5e',
                    '#155b87',
                    '#2d92d1',
                    '#74bbe8',
                    '#97d1f4',
                    '#0c5e50',
                    '#158774',
                    '#2ed1b5',
                    '#74e8d4',
                    '#97f4e5'
                ],
                keywords: ['blue', 'cold', 'turquoise', 'gradient']
            },
            {
                colors: [
                    '#c200fb',
                    '#d704b2',
                    '#e2068d',
                    '#ec0868',
                    '#f41c34',
                    '#fc2f00',
                    '#f45608',
                    '#ec7d10',
                    '#f69d0d',
                    '#ffbc0a'
                ],
                keywords: ['pink', 'bright', 'orange', 'gradient']
            },
            {
                colors: [
                    '#62040a',
                    '#9d0610',
                    '#d90816',
                    '#f72634',
                    '#f9626c',
                    '#bd4ef9',
                    '#a713f6',
                    '#8207c5',
                    '#5b058a',
                    '#35034f'
                ],
                keywords: ['red', 'violet', 'gradient']
            },
            {
                colors: [
                    '#39d05c',
                    '#35e95f',
                    '#35d475',
                    '#35ac7a',
                    '#347f83',
                    '#2e518a',
                    '#40288f',
                    '#5702a1',
                    '#6500a3',
                    '#8127b9'
                ],
                keywords: ['green', 'cold', 'violet', 'gradient']
            },
            {
                colors: [
                    '#014737',
                    '#03543f',
                    '#046c4e',
                    '#057a55',
                    '#0e9f6e',
                    '#31c48d',
                    '#84e1bc',
                    '#bcf0da',
                    '#def7ec',
                    '#f3faf7'
                ],
                keywords: ['turquoise', 'cold', 'green', 'gradient']
            },
            {
                colors: [
                    '#2b2d42',
                    '#4e2c70',
                    '#702b9e',
                    '#b429f9',
                    '#9c43f8',
                    '#855df7',
                    '#6d77f6',
                    '#5591f5',
                    '#3eabf4',
                    '#26c5f3'
                ],
                keywords: ['cold', 'violet', 'blue', 'gradient']
            },
            {
                colors: [
                    '#f0d7df',
                    '#f9e0e2',
                    '#f8eaec',
                    '#f7ddd9',
                    '#f7e6da',
                    '#e3e9dd',
                    '#c4dbd9',
                    '#d4e5e3',
                    '#cae0e4',
                    '#c8c7d6'
                ],
                keywords: ['pastel', 'gray', 'gradient']
            },
            {
                colors: [
                    '#73b7b8',
                    '#52a1a3',
                    '#76c8b1',
                    '#50b99b',
                    '#dc244b',
                    '#af1d3c',
                    '#f6cb52',
                    '#f3b816',
                    '#f05a29',
                    '#d23f0f'
                ],
                keywords: ['turquoise', 'red', 'gradient']
            },
            {
                colors: [
                    '#f56a00',
                    '#fa8b01',
                    '#ffad03',
                    '#ffc243',
                    '#ffcf70',
                    '#cea7ee',
                    '#b67be6',
                    '#9d4edd',
                    '#72369d',
                    '#461e5c'
                ],
                keywords: ['orange', 'violet', 'gradient']
            },
            {
                colors: [
                    '#ff61ab',
                    '#ff6176',
                    '#ff8161',
                    '#ffb561',
                    '#ffea62',
                    '#dfff61',
                    '#abff61',
                    '#76ff61',
                    '#61ff81',
                    '#61ffb5'
                ],
                keywords: ['pastel', 'green', 'gradient']
            },
            {
                colors: [
                    '#797d62',
                    '#9b9b7a',
                    '#baa587',
                    '#d9ae94',
                    '#aeb0a4',
                    '#dbdbd5',
                    '#e8ac65',
                    '#d08c60',
                    '#b58463',
                    '#997b66'
                ],
                keywords: ['warm', 'vintage', 'gradient']
            },
            {
                colors: [
                    '#336699',
                    '#5c98c0',
                    '#70b1d4',
                    '#84cae7',
                    '#a1e1cf',
                    '#bdf7b7',
                    '#8ee3a7',
                    '#5fcf97',
                    '#30bb87',
                    '#00a676'
                ],
                keywords: ['blue', 'cold', 'green', 'gradient']
            }
        ]
    }
];

/**
 * @deprecated use FilterControlType
 */
var ControlType;
(function (ControlType) {
    ControlType["auto"] = "auto";
    /**
     * @deprecated
     */
    ControlType["date"] = "Date";
    /**
     * @deprecated
     */
    ControlType["dateTimePicker"] = "dateTimePicker";
    ControlType["dropDownList"] = "dropDownList";
    ControlType["input"] = "input";
    ControlType["checkBox"] = "checkBox";
})(ControlType || (ControlType = {}));
var TypeAheadType;
(function (TypeAheadType) {
    TypeAheadType["Local"] = "Local";
    TypeAheadType["Remote"] = "Remote";
})(TypeAheadType || (TypeAheadType = {}));

// Css attributes from tailwindcss
const BackdropFilterEnum = {
    'blur-sm': 'blur(4px)',
    blur: 'blur(8px)',
    'blur-md': 'blur(12px)',
    'blur-lg': 'blur(16px)',
    'blur-xl': 'blur(24px)',
    'blur-2xl': 'blur(40px)',
    'blur-3xl': 'blur(64px)',
    'brightness-50': 'brightness(.5)',
    'brightness-75': 'brightness(.75)',
    'brightness-100': 'brightness(1)',
    'brightness-125': 'brightness(1.25)',
    'brightness-150': 'brightness(1.5)',
    'brightness-200': 'brightness(2)',
    'contrast-0': 'contrast(0)',
    'contrast-50': 'contrast(.5)',
    'contrast-75': 'contrast(.75)',
    'contrast-100': 'contrast(1)',
    'contrast-125': 'contrast(1.25)',
    'contrast-150': 'contrast(1.5)',
    'contrast-200': 'contrast(2)',
    'grayscale-0': 'grayscale(0)',
    grayscale: 'grayscale(100%)',
    'hue-rotate-0': 'hue-rotate(0deg)',
    'hue-rotate-15': 'hue-rotate(15deg)',
    'hue-rotate-30': 'hue-rotate(30deg)',
    'hue-rotate-60': 'hue-rotate(60deg)',
    'hue-rotate-90': 'hue-rotate(90deg)',
    'hue-rotate-180': 'hue-rotate(180deg)',
    'invert-0': 'invert(0)',
    invert: 'invert(100%)',
    'opacity-10': 'opacity(0.1)',
    'saturate-50': 'saturate(.5)',
    'sepia-0': 'sepia(0)',
    sepia: 'sepia(100%)'
};
const FilterEnum = {
    'blur-none': 'blur(0)',
    'blur-sm': 'blur(4px)',
    blur: 'blur(8px)',
    'blur-md': 'blur(12px)',
    'blur-lg': 'blur(16px)',
    'blur-xl': 'blur(24px)',
    'blur-2xl': 'blur(40px)',
    'blur-3xl': 'blur(64px)',
    'brightness-0': 'brightness(0)',
    'brightness-50': 'brightness(.5)',
    'brightness-75': 'brightness(.75)',
    'brightness-90': 'brightness(.9)',
    'brightness-95': 'brightness(.95)',
    'brightness-100': 'brightness(1)',
    'brightness-105': 'brightness(1.05)',
    'brightness-110': 'brightness(1.1)',
    'brightness-125': 'brightness(1.25)',
    'brightness-150': 'brightness(1.5)',
    'brightness-200': 'brightness(2)',
    'contrast-0': 'contrast(0)',
    'contrast-50': 'contrast(.5)',
    'contrast-75': 'contrast(.75)',
    'contrast-100': 'contrast(1)',
    'contrast-125': 'contrast(1.25)',
    'contrast-150': 'contrast(1.5)',
    'contrast-200': 'contrast(2)',
    'drop-shadow-sm': 'drop-shadow(0 1px 1px rgb(0 0 0 / 0.05))',
    'drop-shadow': 'drop-shadow(0 1px 2px rgb(0 0 0 / 0.1)) drop-shadow(0 1px 1px rgb(0 0 0 / 0.06))',
    'drop-shadow-md': 'drop-shadow(0 4px 3px rgb(0 0 0 / 0.07)) drop-shadow(0 2px 2px rgb(0 0 0 / 0.06))',
    'drop-shadow-lg': 'drop-shadow(0 10px 8px rgb(0 0 0 / 0.04)) drop-shadow(0 4px 3px rgb(0 0 0 / 0.1))',
    'drop-shadow-xl': 'drop-shadow(0 20px 13px rgb(0 0 0 / 0.03)) drop-shadow(0 8px 5px rgb(0 0 0 / 0.08))',
    'drop-shadow-2xl': 'drop-shadow(0 25px 25px rgb(0 0 0 / 0.15))',
    'drop-shadow-none': 'drop-shadow(0 0 #0000)',
    'grayscale-0': 'grayscale(0)',
    grayscale: 'grayscale(100%)',
    'hue-rotate-0': 'hue-rotate(0deg)',
    'hue-rotate-15': 'hue-rotate(15deg)',
    'hue-rotate-30': 'hue-rotate(30deg)',
    'hue-rotate-60': 'hue-rotate(60deg)',
    'hue-rotate-90': 'hue-rotate(90deg)',
    'hue-rotate-180': 'hue-rotate(180deg)',
    'invert-0': 'invert(0)',
    invert: 'invert(100%)',
    'saturate-0': 'saturate(0)',
    'saturate-50': 'saturate(.5)',
    'saturate-100': 'saturate(1)',
    'saturate-150': 'saturate(1.5)',
    'saturate-200': 'saturate(2)',
    'sepia-0': 'sepia(0)',
    sepia: 'sepia(100%)'
};

// export function convertSelectMemberToSlicer(options: SelectedMemberOptions): ISlicer {
//   if (!options?.propertyName) {
//     return null
//   }
//   return {
//     dimension: options.propertyName,
//     members: options.selectedMembers,
//     exclude: options.excludeSelected
//   }
// }

/**
 * @deprecated use {@link FilterSelectionType}
 */
var InputControlSelectionType;
(function (InputControlSelectionType) {
    InputControlSelectionType["Multiple"] = "Multiple";
    InputControlSelectionType["Single"] = "Single";
})(InputControlSelectionType || (InputControlSelectionType = {}));
/**
 * 树状结构的选择模式
 */
var TreeSelectionMode;
(function (TreeSelectionMode) {
    TreeSelectionMode["Individual"] = "Individual";
    TreeSelectionMode["ParentOnly"] = "ParentOnly";
    TreeSelectionMode["LeafOnly"] = "LeafOnly";
    TreeSelectionMode["ParentChild"] = "ParentChild"; // 输出所有选中的 Parent 和 Children
})(TreeSelectionMode || (TreeSelectionMode = {}));
var PresentationEnum;
(function (PresentationEnum) {
    PresentationEnum[PresentationEnum["Flat"] = 0] = "Flat";
    PresentationEnum[PresentationEnum["Hierarchy"] = 1] = "Hierarchy";
})(PresentationEnum || (PresentationEnum = {}));

var SortDirection;
(function (SortDirection) {
    SortDirection["asc"] = "asc";
    SortDirection["desc"] = "desc";
})(SortDirection || (SortDirection = {}));

var SemanticStyle;
(function (SemanticStyle) {
    SemanticStyle["border-left"] = "border-left";
    SemanticStyle["border-right"] = "border-right";
    SemanticStyle["border-top"] = "border-top";
    SemanticStyle["border-bottom"] = "border-bottom";
    SemanticStyle["color"] = "color";
    SemanticStyle["background"] = "background";
})(SemanticStyle || (SemanticStyle = {}));
/**
 * @hidden
 */
const DataType = mkenum({
    String: 'string',
    Number: 'number',
    Boolean: 'boolean',
    Date: 'date',
    Currency: 'currency',
    Percent: 'percent'
});
function convertPropertyToTableColumn(dimension, property) {
    // property = isString(property) ? {name: property} : {...property}
    // property.unit = isString(property.unit) ? {name: property.unit} : property.unit
    // const column = {
    //   property,
    //   dimension,
    //   name: property.name,
    //   label: property.label,
    //   dataType: property.dataType,
    // } as unknown as TableColumn
    // if (property.text) {
    //   column.text = convertPropertyToTableColumn(dimension, property.text)
    // }
    // column.unit = property.unit
    return null;
}

var TimeRangeEnum;
(function (TimeRangeEnum) {
    TimeRangeEnum["Today"] = "Today";
    TimeRangeEnum["Last7Days"] = "Last7Days";
    TimeRangeEnum["Last4Weeks"] = "Last4Weeks";
    TimeRangeEnum["Last3Months"] = "Last3Months";
    TimeRangeEnum["MonthToDate"] = "MonthToDate";
    TimeRangeEnum["QuarterToDate"] = "QuarterToDate";
    TimeRangeEnum["YearToDate"] = "YearToDate";
    TimeRangeEnum["All"] = "All";
})(TimeRangeEnum || (TimeRangeEnum = {}));
const TimeRangeOptions = [
    {
        value: TimeRangeEnum.Today,
        label: {
            en_US: 'Today',
            zh_Hans: '今天'
        }
    },
    {
        value: TimeRangeEnum.Last7Days,
        label: {
            en_US: 'Last 7 days',
            zh_Hans: '最近7天'
        }
    },
    {
        value: TimeRangeEnum.Last4Weeks,
        label: {
            en_US: 'Last 4 weeks',
            zh_Hans: '最近4周'
        }
    },
    {
        value: TimeRangeEnum.Last3Months,
        label: {
            en_US: 'Last 3 months',
            zh_Hans: '最近3个月'
        }
    },
    {
        value: TimeRangeEnum.MonthToDate,
        label: {
            en_US: 'Month to date',
            zh_Hans: '本月至今'
        }
    },
    {
        value: TimeRangeEnum.QuarterToDate,
        label: {
            en_US: 'Quarter to date',
            zh_Hans: '本季度至今'
        }
    },
    {
        value: TimeRangeEnum.YearToDate,
        label: {
            en_US: 'Year to date',
            zh_Hans: '本年至今'
        }
    },
    {
        value: TimeRangeEnum.All,
        label: {
            en_US: 'All time',
            zh_Hans: '所有时间'
        }
    }
];
function calcTimeRange(value) {
    const today = new Date();
    let start = today;
    switch (value) {
        case 'Today': {
            break;
        }
        case 'Last7Days': {
            start = subDays(new Date(), 6);
            break;
        }
        case 'Last4Weeks': {
            start = subDays(new Date(), 27);
            break;
        }
        case 'Last3Months': {
            start = subDays(new Date(), 90);
            break;
        }
        case 'MonthToDate': {
            start = startOfMonth(today);
            break;
        }
        case 'QuarterToDate': {
            start = startOfQuarter(today);
            break;
        }
        case 'YearToDate': {
            start = startOfYear(today);
            break;
        }
        case 'All': {
            start = null;
            break;
        }
    }
    return [
        start?.toISOString().slice(0, 10),
        subSeconds(addDays(new Date(today.toISOString().slice(0, 10)), 1), 1).toISOString()
    ];
}

const NX_SMART_CHART_TYPE = new InjectionToken('Nx Smart Chart Type');
const NX_SCALE_CHROMATIC = new InjectionToken('Nx Scale Chromatic Service');
/**
 * merge 界面复杂度默认配置与 ChartSettings
 */
// export function mergeComplexity<T>(settings: Partial<NxChartOptions>, options?: NxChartComplexityOptions): T {
//   settings = omitBy<NxChartOptions>(settings, isNil)
//   switch (settings?.complexity) {
//     case ChartComplexity.Minimalist:
//       return merge(merge(options?.baseOption, options?.minimalist), settings)
//     case ChartComplexity.Concise:
//       return merge(merge(options?.baseOption, options?.concise), settings)
//     case ChartComplexity.Normal:
//       return merge(merge(options?.baseOption, options?.normal), settings)
//     case ChartComplexity.Comprehensive:
//       return merge(merge(options?.baseOption, options?.comprehensive), settings)
//     case ChartComplexity.Extremely:
//       return merge(merge(options?.baseOption, options?.extremely), settings)
//     default:
//       return settings as unknown as T
//   }
// }
// export function Complexity() {
//   return (target: NxChartEngine, propertyKey: string) => {
//     const original = Object.getOwnPropertyDescriptor(target, propertyKey)
//     const setter = function (newVal: NxChartOptions) {
//       // merge 而不是直接覆盖, 因为会有默认值存在
//       target.__chartOptionsOrigin = merge(target.__chartOptionsOrigin, newVal)
//       original?.set?.apply(target, mergeComplexity(target.__chartOptionsOrigin, target.complexityOptions))
//     }
//     Object.defineProperty(target, propertyKey, {
//       // get: getter,
//       set: setter,
//     })
//   }
// }

/**
 * @deprecated
 * SmartCharts 组件的图形界面复杂度, 在不同的尺寸下需要不同的界面复杂度, 如全屏显示时可以显示及其全面的界面
 * 复杂度对于每一种图形需要不同的设置
 */
var ChartComplexity;
(function (ChartComplexity) {
    ChartComplexity["Minimalist"] = "Minimalist";
    ChartComplexity["Concise"] = "Concise";
    ChartComplexity["Normal"] = "Normal";
    ChartComplexity["Comprehensive"] = "Comprehensive";
    ChartComplexity["Extremely"] = "Extremely";
})(ChartComplexity || (ChartComplexity = {}));
/**
 * @deprecated
 */
var NxChartLibrary;
(function (NxChartLibrary) {
    NxChartLibrary["echarts"] = "echarts";
    NxChartLibrary["antv-g2"] = "antv-g2";
    NxChartLibrary["chartjs"] = "chartjs";
    NxChartLibrary["ngx-charts"] = "ngx-charts";
})(NxChartLibrary || (NxChartLibrary = {}));
/**
 * @deprecated
 */
var NxChromaticType;
(function (NxChromaticType) {
    NxChromaticType["Single"] = "Single";
    NxChromaticType["Sequential"] = "Sequential";
    NxChromaticType["Categorical"] = "Categorical";
})(NxChromaticType || (NxChromaticType = {}));
/**
 * @deprecated use ChartTypeEnum
 */
var NxChartType;
(function (NxChartType) {
    NxChartType["Column"] = "Column";
    NxChartType["ColumnStacked"] = "ColumnStacked";
    NxChartType["ColumnDual"] = "ColumnDual";
    NxChartType["ColumnStackedDual"] = "ColumnStackedDual";
    NxChartType["ColumnStacked100"] = "ColumnStacked100";
    NxChartType["ColumnStackedDual100"] = "ColumnStackedDual100";
    NxChartType["ColumnGrouped"] = "ColumnGrouped";
    NxChartType["ColumnPolar"] = "ColumnPolar";
    NxChartType["Bar"] = "Bar";
    NxChartType["BarStacked"] = "BarStacked";
    NxChartType["BarDual"] = "BarDual";
    NxChartType["BarStackedDual"] = "BarStackedDual";
    NxChartType["BarStacked100"] = "BarStacked100";
    NxChartType["BarStackedDual100"] = "BarStackedDual100";
    NxChartType["BarGrouped"] = "BarGrouped";
    NxChartType["BarPolar"] = "BarPolar";
    NxChartType["Histogram"] = "Histogram";
    NxChartType["Area"] = "Area";
    NxChartType["AreaStacked"] = "AreaStacked";
    NxChartType["AreaStacked100"] = "AreaStacked100";
    NxChartType["HorizontalArea"] = "HorizontalArea";
    NxChartType["HorizontalAreaStacked"] = "HorizontalAreaStacked";
    NxChartType["HorizontalAreaStacked100"] = "HorizontalAreaStacked100";
    NxChartType["Line"] = "Line";
    NxChartType["Lines"] = "Lines";
    NxChartType["StepLine"] = "StepLine";
    NxChartType["LineDual"] = "LineDual";
    NxChartType["Combination"] = "Combination";
    NxChartType["CombinationStacked"] = "CombinationStacked";
    NxChartType["CombinationDual"] = "CombinationDual";
    NxChartType["CombinationStackedDual"] = "CombinationStackedDual";
    NxChartType["HorizontalCombinationStacked"] = "HorizontalCombinationStacked";
    NxChartType["Pie"] = "Pie";
    NxChartType["Doughnut"] = "Doughnut";
    NxChartType["Nightingale"] = "Nightingale";
    NxChartType["Scatter"] = "Scatter";
    NxChartType["Bubble"] = "Bubble";
    NxChartType["Radar"] = "Radar";
    NxChartType["Boxplot"] = "Boxplot";
    NxChartType["Heatmap"] = "Heatmap";
    NxChartType["Treemap"] = "Treemap";
    NxChartType["Waterfall"] = "Waterfall";
    NxChartType["Bullet"] = "Bullet";
    NxChartType["VerticalBullet"] = "VerticalBullet";
    NxChartType["HorizontalWaterfall"] = "HorizontalWaterfall";
    NxChartType["HorizontalCombinationDual"] = "HorizontalCombinationDual";
    NxChartType["HorizontalCombinationStackedDual"] = "HorizontalCombinationStackedDual";
    // 3D
    NxChartType["Bar3D"] = "Bar3D";
    NxChartType["Line3D"] = "Line3D";
    NxChartType["Scatter3D"] = "Scatter3D";
    // Custom types
    NxChartType["Custom"] = "Custom";
    NxChartType["GeoMap"] = "GeoMap";
    NxChartType["Timeline"] = "Timeline";
    NxChartType["Sankey"] = "Sankey";
    NxChartType["Sunburst"] = "Sunburst";
    NxChartType["RadialBar"] = "RadialBar";
    NxChartType["RadialBarStacked"] = "RadialBarStacked";
    NxChartType["RadialPie"] = "RadialPie";
    NxChartType["RadialPieStacked"] = "RadialPieStacked";
    NxChartType["RadialScatter"] = "RadialScatter";
    NxChartType["Funnel"] = "Funnel";
    NxChartType["PolarLine"] = "PolarLine";
    NxChartType["Rose"] = "Rose";
    NxChartType["Tree"] = "Tree";
    NxChartType["ThemeRiver"] = "ThemeRiver";
})(NxChartType || (NxChartType = {}));

/**
 * 作为状态管理功能的初创原型
 * @deprecated 使用 ComponentStore
 */
class OptionsStore2 extends ComponentStore$1 {
    constructor() {
        super({});
        /**
         * 组件输入和内部改变合集
         */
        this._options$ = new BehaviorSubject({});
        this.inputOptions$ = this.select(state => state.inputOptions);
        this.innerOptions$ = this.select(state => state.innerOptions);
        /**
         * 最终结果
         */
        this.options$ = combineLatest([this._options$, this.select(state => state.defaultOptions)])
            .pipe(map(([options, defaults]) => ({
            ...defaults,
            ...options,
        })));
        /**
         * 当内部改变时发出组件输入和内部改变的合集
         */
        this.optionsChange = this.select(state => state.inputOptions).pipe(withLatestFrom(this._options$), map(([inner, options]) => options), filter((options) => !matches(options)({})));
        this.input = this.updater((state, inputOptions) => ({
            ...state,
            inputOptions
        }));
        this.patchInput = this.updater((state, options) => ({
            ...state,
            inputOptions: {
                ...state.inputOptions,
                ...options,
            }
        }));
        this.patchOptions = this.updater((state, options) => ({
            ...state,
            innerOptions: {
                ...state.innerOptions,
                ...options,
            }
        }));
        this.patch = this.patchOptions;
        this.patchDefault = this.updater((state, options) => ({
            ...state,
            defaultOptions: {
                ...state.defaultOptions,
                ...options,
            }
        }));
        merge(this.inputOptions$, this.innerOptions$)
            .pipe(map((options) => {
            return {
                ...this._options$.value,
                ...options,
            };
        }))
            .subscribe(this._options$);
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: OptionsStore2, deps: [], target: i0.ɵɵFactoryTarget.Injectable }); }
    static { this.ɵprov = i0.ɵɵngDeclareInjectable({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: OptionsStore2 }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: OptionsStore2, decorators: [{
            type: Injectable
        }], ctorParameters: () => [] });
/**
 * @deprecated 使用 ComponentStore
 */
class OptionsStore {
    constructor() {
        /**
         * 最终结果
         */
        this.options$ = new BehaviorSubject({});
        /**
         * 组件输入
         */
        this._inputOptions$ = new BehaviorSubject({});
        /**
         * 内部改变
         */
        this._innerOptions$ = new BehaviorSubject({});
        /**
         * 组件输入和内部改变合集
         */
        this._options$ = new BehaviorSubject({});
        /**
         * 默认值
         */
        this._default$ = new BehaviorSubject({});
        /**
         * 当内部改变时发出组件输入和内部改变的合集
         */
        this.optionsChange = this._innerOptions$.pipe(withLatestFrom(this._options$), map(([inner, options]) => options), filter((options) => !matches(options)({})));
        merge(this._inputOptions$, this._innerOptions$)
            .pipe(map((options) => {
            return {
                ...this._options$.value,
                ...options,
            };
        }))
            .subscribe(this._options$);
        combineLatest([this._options$, this._default$])
            .pipe(map(([options, defaults]) => ({
            ...defaults,
            ...options,
        })))
            .subscribe(this.options$);
    }
    input(options) {
        this._inputOptions$.next(options);
    }
    patchOptions(value) {
        this._innerOptions$.next({
            ...this._innerOptions$.value,
            ...value,
        });
    }
    patchInput(value) {
        this._inputOptions$.next({
            ...this._inputOptions$.value,
            ...value,
        });
    }
    patch(value) {
        this._innerOptions$.next({
            ...this._innerOptions$.value,
            ...value,
        });
    }
    patchDefault(value) {
        this._default$.next({
            ...this._default$.value,
            ...value,
        });
    }
    get value() {
        return this.options$.value;
    }
    get(selector) {
        const selectorFn = getSelectorFn(selector);
        return selectorFn(this.value);
    }
    selectInput(selector) {
        const selectorFn = getSelectorFn(selector);
        return this._inputOptions$.pipe(map(selectorFn), distinctUntilChanged());
    }
    select(selector, config) {
        const selectorFn = getSelectorFn(selector);
        const distinctFun = config?.distinctDeeply ? distinctUntilChanged(isEqual) : distinctUntilChanged();
        return this.options$.pipe(map(selectorFn), distinctFun);
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: OptionsStore, deps: [], target: i0.ɵɵFactoryTarget.Injectable }); }
    static { this.ɵprov = i0.ɵɵngDeclareInjectable({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: OptionsStore }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: OptionsStore, decorators: [{
            type: Injectable
        }], ctorParameters: () => [] });
function getSelectorFn(selector) {
    if (isFunction(selector)) {
        return selector;
    }
    else if (isString(selector)) {
        return (state) => {
            return get(state, selector);
        };
    }
    else {
        return (state) => {
            return state;
        };
    }
}
function connect(store1, states) {
    return (store2) => {
        if (isArray$1(states)) {
            states.forEach(state => {
                store1.select(state).subscribe(value => store2.patch({ [state]: value }));
            });
        }
        else if (isString(states)) {
            store1.select(states).subscribe(value => store2.patch({ [states]: value }));
        }
        else {
            store1.select().subscribe(value => store2.patch(value));
        }
    };
}

function write(updater) {
    return function (state) {
        return produce(state, (draft) => {
            const r = updater(draft);
            return r === undefined ? draft : r;
        });
    };
}
class SubStore extends Store {
    #destroyRef = inject(DestroyRef);
    #logger = inject(NGXLogger, { optional: true });
    #subscription;
    #upbackSubscription;
    #initialized = false;
    #context = {
        config: this.getConfig(),
        setEvent: (action) => { }
    };
    constructor(parent, storeDef, options) {
        super(storeDef);
        this.parent = parent;
        this.options = options;
    }
    subscribeParent(properties) {
        const base = this.parent.pipe(startWith(this.parent.getValue()));
        return properties.reduce((obs, prop) => {
            return obs.pipe(select((state) => {
                return Array.isArray(state)
                    ? state.find((item) => item?.[this.options.arrayKey ?? 'id'] === prop)
                    : state?.[prop];
            }));
        }, base);
    }
    connect(properties) {
        properties = this.options.properties = properties ?? this.options.properties;
        if (!properties) {
            return this;
        }
        // When reconnect
        this.#initialized = false;
        this.#upbackSubscription?.unsubscribe();
        this.#upbackSubscription = this.pipe(distinctUntilChanged$1(), filter$1(() => this.#initialized), takeUntilDestroyed(this.#destroyRef)).subscribe((newValue) => {
            this.#logger?.trace(`SubStore [${this.name}] update back to parent:`, newValue);
            this.parent.update(write((state) => {
                properties.reduce((accumulator, currentValue, currentIndex, arr) => {
                    if (currentIndex === arr.length - 1) {
                        if (Array.isArray(accumulator)) {
                            const index = accumulator.findIndex((item) => item?.[this.options.arrayKey ?? 'id'] === currentValue);
                            if (index > -1) {
                                accumulator[index] = newValue;
                            }
                        }
                        else if (isObject$1(accumulator)) {
                            accumulator[currentValue] = newValue;
                        }
                    }
                    else {
                        return Array.isArray(accumulator)
                            ? accumulator.find((item) => item?.[this.options.arrayKey ?? 'id'] === currentValue)
                            : accumulator?.[currentValue];
                    }
                }, state);
            }));
        });
        this.#subscription?.unsubscribe();
        this.#subscription = this.subscribeParent(properties)
            .pipe(takeUntilDestroyed(this.#destroyRef))
            .subscribe({
            next: (value) => {
                this.#logger?.trace(`SubStore [${this.name}] update state from parent:`, value);
                this.update(() => value ?? this.state);
                this.#initialized = true;
            },
            error: (err) => {
                this.error();
            },
            complete: () => {
                this.complete();
            }
        });
        return this;
    }
    disconnect() {
        this.#subscription?.unsubscribe();
        this.#upbackSubscription?.unsubscribe();
    }
}
function createSubStore(parent, storeConfig, ...propsFactories) {
    const { state, config } = createState(...propsFactories);
    const { name, arrayKey } = storeConfig;
    return new SubStore(parent, { name, state, config }, { arrayKey }).connect(storeConfig.properties);
}
function dirtyCheck(store, params) {
    const destroyRef = inject(DestroyRef);
    const active = signal(false, ...(ngDevMode ? [{ debugName: "active" }] : []));
    const head = signal(null, ...(ngDevMode ? [{ debugName: "head" }] : []));
    const currentState = signal(null, ...(ngDevMode ? [{ debugName: "currentState" }] : []));
    const comparator = params?.comparator ?? ((head, current) => head !== current);
    store
        .pipe(map$1((state) => cloneDeep(params?.watchProperty ? pick(state, params.watchProperty) : state)), takeUntilDestroyed(destroyRef))
        .subscribe((value) => currentState.set(value));
    const dirty = computed(() => {
        return active() ? comparator(head(), currentState()) : false;
    }, ...(ngDevMode ? [{ debugName: "dirty" }] : []));
    return {
        active,
        dirty,
        setHead() {
            active.set(true);
            head.set(currentState());
        },
        setPristine(pristine) {
            const state = params?.watchProperty ? pick(pristine, params.watchProperty) : pristine;
            active.set(true);
            head.set(state);
        }
    };
}
function dirtyCheckWith(store, with$, params) {
    const destroyRef = inject(DestroyRef);
    const { setPristine, setHead, ...reset } = dirtyCheck(store, params);
    with$.pipe(takeUntilDestroyed(destroyRef)).subscribe(setPristine);
    return { ...reset };
}
function debugDirtyCheckComparator(a, b) {
    const dirty = negate(isEqual)(a, b);
    if (dirty) {
        const string1 = JSON.stringify(a);
        const string2 = JSON.stringify(b);
        console.group('DirtyCheckComparator dirty:');
        console.log(string1);
        console.log(string2);
        console.groupEnd();
    }
    return dirty;
}

const ODATA_SRV = 'ZMyOData_SRV';
const ODATA_URI = `/sap/opu/odata/sap/${ODATA_SRV}/`;
const ODATA_URI_METADATA = `${ODATA_URI}$metadata`;
const ODATA_ENTITY = 'MyEntity';
const ODATA_ENTITY_DIMENSION = 'Factory';
const ODATA_ENTITY_VALUEHELP_PROPERTY = 'Factory';
const ODATA_ENTITY_VALUEHELP_ENTITY = 'ZTV_I_FactoryVH';
const ODATA_META_DATA = `<?xml version="1.0" encoding="utf-8"?>
<edmx:Edmx Version="1.0"
    xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx"
    xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata"
    xmlns:sap="http://www.sap.com/Protocols/SAPData">
    <edmx:Reference xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx">
        <edmx:Include Namespace="com.sap.vocabularies.Common.v1" Alias="Common"/>
    </edmx:Reference>
    <edmx:DataServices m:DataServiceVersion="2.0">
        <Schema Namespace="ZMyOData_SRV" xml:lang="zh" sap:schema-version="1"
            xmlns="http://schemas.microsoft.com/ado/2008/09/edm">
            <EntityType Name="MyEntityType" sap:semantics="aggregate" sap:label="My Entity" sap:content-version="1">
                <Key>
                    <PropertyRef Name="ID"/>
                </Key>
                <Property Name="ID" Type="Edm.String" Nullable="false"/>
                <Property Name="Factory" Type="Edm.String" MaxLength="10" sap:aggregation-role="dimension" sap:display-format="UpperCase" sap:text="FactoryName"/>
                <Property Name="FactoryName" Type="Edm.String" MaxLength="10" sap:aggregation-role="dimension" sap:display-format="UpperCase"/>
                <Property Name="ProdQuantity" Type="Edm.Decimal" Precision="16" Scale="0" sap:aggregation-role="dimension" sap:label="产出数量"/>
                <Property Name="PlanQuantity" Type="Edm.Decimal" Precision="16" Scale="0" sap:aggregation-role="dimension" sap:label="计划数量"/>
                <Property Name="Rate" Type="Edm.Decimal" Precision="8" Scale="0" sap:aggregation-role="measure" sap:unit="Percentage" sap:filterable="false"/>
                <Property Name="Percentage" Type="Edm.String" MaxLength="3" sap:aggregation-role="dimension" sap:semantics="unit-of-measure"/>
                <Property Name="A" Type="Edm.Decimal" Precision="16" Scale="0" sap:aggregation-role="measure" sap:label="当期"/>
                <Property Name="M" Type="Edm.Decimal" Precision="16" Scale="0" sap:aggregation-role="measure" sap:label="上期"/>
                <Property Name="Y" Type="Edm.Decimal" Precision="16" Scale="0" sap:aggregation-role="measure" sap:label="同期"/>
            </EntityType>
            <EntityType Name="ZTV_I_FactoryVHType" sap:label="工厂搜索帮助" sap:content-version="1">
                <Key>
                    <PropertyRef Name="Product"/>
                    <PropertyRef Name="Factory"/>
                </Key>
                <Property Name="Product" Type="Edm.String" Nullable="false" MaxLength="2" sap:display-format="UpperCase"/>
                <Property Name="Factory" Type="Edm.String" Nullable="false" MaxLength="10" sap:display-format="UpperCase" sap:text="FactoryName"/>
                <Property Name="FactoryName" Type="Edm.String" MaxLength="10" sap:display-format="UpperCase"/>
            </EntityType>
            <EntityType Name="ZSCM_C_PurExpCategoryResult" sap:semantics="aggregate" sap:label="供应链：采购支出分析-带品类参数" sap:content-version="1">
                <Key>
                    <PropertyRef Name="ID"/>
                </Key>
                <Property Name="ID" Type="Edm.String" Nullable="false"/>
                <Property Name="OrderNo" Type="Edm.String" MaxLength="10" sap:aggregation-role="dimension" sap:display-format="UpperCase" sap:label="订单编号"/>
                <Property Name="Materials" Type="Edm.String" MaxLength="18" sap:aggregation-role="dimension" sap:display-format="UpperCase" sap:label="物料号"/>
                <Property Name="MaterialsText" Type="Edm.String" MaxLength="60" sap:aggregation-role="dimension" sap:display-format="UpperCase" sap:label="物料描述"/>
                <Property Name="Amount" Type="Edm.Decimal" Precision="17" Scale="3" sap:aggregation-role="measure" sap:label="金额" sap:filterable="false"/>
                <Property Name="Quantity" Type="Edm.Decimal" Precision="18" Scale="3" sap:aggregation-role="measure" sap:unit="QuantityUnit" sap:label="数量" sap:filterable="false"/>
            </EntityType>
            <EntityType Name="ZSCM_C_PurExpCategoryParameters" sap:semantics="parameters" sap:content-version="1">
                <Key>
                    <PropertyRef Name="p_category"/>
                </Key>
                <Property Name="p_category" Type="Edm.String" Nullable="false" MaxLength="10" sap:parameter="mandatory" sap:label="物料品类" sap:creatable="false" sap:updatable="false" sap:sortable="false" sap:filterable="false"/>
                <NavigationProperty Name="Results" Relationship="ZMyOData_SRV.assoc_2ED98D58F9F501E27A6A88BCD5004593" FromRole="FromRole_assoc_2ED98D58F9F501E27A6A88BCD5004593" ToRole="ToRole_assoc_2ED98D58F9F501E27A6A88BCD5004593"/>
            </EntityType>
            <Association Name="assoc_2ED98D58F9F501E27A6A88BCD5004593" sap:content-version="1">
                <End Type="ZMyOData_SRV.ZSCM_C_PurExpCategoryParameters" Multiplicity="1" Role="FromRole_assoc_2ED98D58F9F501E27A6A88BCD5004593"/>
                <End Type="ZMyOData_SRV.ZSCM_C_PurExpCategoryResult" Multiplicity="*" Role="ToRole_assoc_2ED98D58F9F501E27A6A88BCD5004593"/>
            </Association>
            <EntityContainer Name="ZMyOData_SRV_Entities" m:IsDefaultEntityContainer="true" sap:supported-formats="atom json xlsx">
                <EntitySet Name="MyEntity" EntityType="ZMyOData_SRV.MyEntityType" sap:creatable="false" sap:updatable="false" sap:deletable="false" sap:content-version="1"/>
                <EntitySet Name="ZSCM_C_PurExpCategoryResults" EntityType="ZMyOData_SRV.ZSCM_C_PurExpCategoryResult" sap:creatable="false" sap:updatable="false" sap:deletable="false" sap:addressable="false" sap:content-version="1"/>
                <EntitySet Name="ZSCM_C_PurExpCategory" EntityType="ZMyOData_SRV.ZSCM_C_PurExpCategoryParameters" sap:creatable="false" sap:updatable="false" sap:deletable="false" sap:pageable="false" sap:content-version="1"/>
                <EntitySet Name="ZTV_I_FactoryVH" EntityType="ZMyOData_SRV.ZTV_I_FactoryVHType" sap:creatable="false" sap:updatable="false" sap:deletable="false" sap:content-version="1"/>
                <AssociationSet Name="assoc_2ED98D58F9F501E27A6A88BCD5004593" Association="ZMyOData_SRV.assoc_2ED98D58F9F501E27A6A88BCD5004593" sap:creatable="false" sap:updatable="false" sap:deletable="false" sap:content-version="1">
                    <End EntitySet="ZSCM_C_PurExpCategory" Role="FromRole_assoc_2ED98D58F9F501E27A6A88BCD5004593"/>
                    <End EntitySet="ZSCM_C_PurExpCategoryResults" Role="ToRole_assoc_2ED98D58F9F501E27A6A88BCD5004593"/>
                </AssociationSet>
            </EntityContainer>
            <Annotations Target="ZMyOData_SRV.MyEntityType/Factory"
                xmlns="http://docs.oasis-open.org/odata/ns/edm">
                <Annotation Term="Common.ValueList">
                    <Record>
                        <PropertyValue Property="Label" String="工厂搜索帮助"/>
                        <PropertyValue Property="CollectionPath" String="ZTV_I_FactoryVH"/>
                        <PropertyValue Property="SearchSupported" Bool="true"/>
                        <PropertyValue Property="Parameters">
                            <Collection>
                                <Record Type="Common.ValueListParameterInOut">
                                    <PropertyValue Property="LocalDataProperty" PropertyPath="Product"/>
                                    <PropertyValue Property="ValueListProperty" String="Product"/>
                                </Record>
                                <Record Type="Common.ValueListParameterInOut">
                                    <PropertyValue Property="LocalDataProperty" PropertyPath="Factory"/>
                                    <PropertyValue Property="ValueListProperty" String="Factory"/>
                                </Record>
                                <Record Type="Common.ValueListParameterDisplaOnly">
                                    <PropertyValue Property="ValueListProperty" String="FactoryName"/>
                                </Record>
                            </Collection>
                        </PropertyValue>
                    </Record>
                </Annotation>
            </Annotations>
        </Schema>
    </edmx:DataServices>
</edmx:Edmx>`;
const ODATA_ANNOTATION = `<?xml version="1.0" encoding="utf-8"?>
<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx">
    <edmx:Reference Uri="../../catalogservice;v=2/Vocabularies(TechnicalName='%2FIWBEP%2FVOC_COMMON',Version='0001',SAP__Origin='BW')/$value">
        <edmx:Include Namespace="com.sap.vocabularies.Common.v1" Alias="Common"/>
    </edmx:Reference>
    <edmx:Reference Uri="../../catalogservice;v=2/Vocabularies(TechnicalName='%2FIWBEP%2FVOC_UI',Version='0001',SAP__Origin='BW')/$value">
        <edmx:Include Namespace="com.sap.vocabularies.UI.v1" Alias="UI"/>
    </edmx:Reference>
    <edmx:Reference Uri="../../catalogservice;v=2/Vocabularies(TechnicalName='%2FIWBEP%2FVOC_COMMUNICATION',Version='0001',SAP__Origin='BW')/$value">
        <edmx:Include Namespace="com.sap.vocabularies.Communication.v1" Alias="Communication"/>
    </edmx:Reference>
    <edmx:Reference Uri="../../../sap/${ODATA_SRV}/$metadata">
        <edmx:Include Namespace="${ODATA_SRV}" Alias="SAP"/>
    </edmx:Reference>
    <edmx:DataServices>
        <Schema Namespace="${ODATA_SRV}_anno_mdl.v1" xmlns="http://docs.oasis-open.org/odata/ns/edm">
            <Annotations Target="${ODATA_SRV}.MyEntityType">
                <Annotation Term="UI.DataPoint" Qualifier="periodic">
                    <Record>
                        <PropertyValue Property="Value" Path="PeriodicMoMRate"/>
                        <PropertyValue Property="Title" String="环比"/>
                        <PropertyValue Property="TargetValue" Path="MoMRate"/>
                        <PropertyValue Property="TrendCalculation">
                            <Record>
                                <PropertyValue Property="ReferenceValue" Path="MoMRate"/>
                                <PropertyValue Property="IsRelativeDifference" Bool="true"/>
                                <PropertyValue Property="UpDifference" Decimal="0"/>
                                <PropertyValue Property="StrongUpDifference" Decimal="0"/>
                                <PropertyValue Property="DownDifference" Decimal="0"/>
                                <PropertyValue Property="StrongDownDifference" Decimal="0"/>
                            </Record>
                        </PropertyValue>
                    </Record>
                </Annotation>
            </Annotations>
        </Schema>
    </edmx:DataServices>
</edmx:Edmx>`;
const ODATA_ENTITY_DATA = [
    {
        Factory: '000000001',
        FactoryName: 'Factory 1',
        ProdQuantity: 1000,
    },
    {
        Factory: '000000002',
        FactoryName: 'Factory 2',
        ProdQuantity: 500,
    },
    {
        Factory: '000000003',
        FactoryName: 'Factory 3',
        ProdQuantity: 10000,
    },
];
const ODATA_VALUEHELP_DATA = [
    {
        Factory: '000000001',
        FactoryName: 'Factory 1',
    },
    {
        Factory: '000000002',
        FactoryName: 'Factory 2',
    },
    {
        Factory: '000000003',
        FactoryName: 'Factory 3',
    },
];
const ODATA_VALUEHELP_SELECT_OPTIONS = [
    {
        value: '000000001',
        text: 'Factory 1',
    },
    {
        value: '000000002',
        text: 'Factory 2',
    },
    {
        value: '000000003',
        text: 'Factory 3',
    },
];
const DATA = [
    {
        Field: 'Name 1',
        Value: 10,
    },
    {
        Field: 'Name 2',
        Value: 50,
    },
    {
        Field: 'Name 3',
        Value: 20,
    },
];

var WidgetMenuType;
(function (WidgetMenuType) {
    WidgetMenuType["Toggle"] = "Toggle";
    WidgetMenuType["Action"] = "Action";
    WidgetMenuType["Menus"] = "Menus";
    WidgetMenuType["Divider"] = "Divider";
})(WidgetMenuType || (WidgetMenuType = {}));
class WidgetService {
    constructor() {
        this.menus$ = new BehaviorSubject(null);
        this._menuClick$ = new Subject();
        this.refresh$ = new Subject();
        this.explains = signal([], ...(ngDevMode ? [{ debugName: "explains" }] : []));
    }
    setMenus(menus) {
        this.menus$.next(menus);
    }
    toggleMenu(menu) {
        this.menus$.next(toggleMenu(this.menus$.value, menu.key));
    }
    clickMenu(menu) {
        if (menu.type === WidgetMenuType.Toggle) {
            this.toggleMenu(menu);
        }
        this._menuClick$.next(menu);
    }
    onMenuClick() {
        return this._menuClick$;
    }
    refresh(force = false) {
        this.refresh$.next(force);
    }
    onRefresh() {
        return this.refresh$.asObservable();
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: WidgetService, deps: [], target: i0.ɵɵFactoryTarget.Injectable }); }
    static { this.ɵprov = i0.ɵɵngDeclareInjectable({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: WidgetService }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: WidgetService, decorators: [{
            type: Injectable
        }] });
function toggleMenu(menus, key) {
    menus.forEach((item) => {
        if (item.type === WidgetMenuType.Menus) {
            toggleMenu(item.menus, key);
        }
        else if (item.key === key) {
            item.selected = !item.selected;
        }
    });
    return [...menus];
}

function replaceParameters(title, entityType) {
    if (entityType && title) {
        const myRegexp = new RegExp('\\[@(.*?)\\]', 'g');
        let match = myRegexp.exec(title);
        while (match !== null) {
            const paramName = match[1];
            title = title.replace(parameterFormatter(paramName), getEntityProperty(entityType, paramName)?.value ?? paramName);
            match = myRegexp.exec(title);
        }
    }
    return title;
}

const DEFAULT_DIGITS_INFO = '1.0-1';
/**
 * Story 组件的公共父类
 *
 * * T: Options type
 * * S: State type
 *
 * `dataSettings` 和 `options` 属性需要将变化发出 (为了返回给 Widget 进行存储, 即实现在 Widget 组件本身也能修改属性值并进行保存)
 *
 */
class AbstractStoryWidget extends ComponentStore {
    /**
     * Title
     */
    get title() {
        return this._titled();
    }
    set title(value) {
        this._title.set(value);
    }
    /**
     * Data Settings
     */
    get dataSettings() {
        return this.get((state) => state.dataSettings);
    }
    set dataSettings(value) {
        this.patchState({
            dataSettings: value,
            selectionVariant: value?.selectionVariant,
            presentationVariant: value?.presentationVariant
        });
    }
    /**
     * Component Options
     */
    get options() {
        return this.get((state) => state.options);
    }
    set options(value) {
        this._options$.next(cloneDeep(value));
    }
    get styling() {
        return this.styling$();
    }
    set styling(value) {
        this.styling$.set(value);
    }
    /**
     * Language Locale
     */
    get locale() {
        return this.locale$.value;
    }
    set locale(value) {
        this.locale$.next(value);
    }
    /**
     * @deprecated use editableSignal
     *
     * Editable
     */
    get editable() {
        return this.editableSignal();
    }
    set editable(value) {
        this.editableSignal.set(coerceBooleanProperty(value));
    }
    /**
     * Selected Members Filters
     */
    get slicers() {
        return this.slicers$.value;
    }
    set slicers(value) {
        this.slicers$.next(value);
    }
    get pin() {
        return this._pin();
    }
    set pin(value) {
        this._pin.set(coerceBooleanProperty(value));
    }
    constructor() {
        super({});
        this.translateService = inject(TranslateService, { optional: true });
        this.widgetService = inject(WidgetService, { optional: true, skipSelf: true });
        this.coreService = inject(NxCoreService);
        this.destroyRef = inject(DestroyRef);
        this._title = signal(null, ...(ngDevMode ? [{ debugName: "_title" }] : []));
        this._titled = computed(() => replaceParameters(this._title(), this.entityType()), ...(ngDevMode ? [{ debugName: "_titled" }] : []));
        this._dataSettings$ = this.select((state) => state.dataSettings);
        this.dataSettingsSignal = toSignal(this._dataSettings$);
        this._options$ = new BehaviorSubject(null);
        /**
         * @deprecated use optionsSignal
         */
        this.options$ = this.select((state) => state.options).pipe(filter$1(nonNullable));
        this.optionsSignal = toSignal(this.options$, { initialValue: null });
        this.styling$ = signal(null, ...(ngDevMode ? [{ debugName: "styling$" }] : []));
        this.locale$ = new BehaviorSubject(null);
        this.editableSignal = signal(false, ...(ngDevMode ? [{ debugName: "editableSignal" }] : []));
        this.editable$ = toObservable(this.editableSignal);
        this.slicers$ = new BehaviorSubject([]);
        this._pin = signal(false, ...(ngDevMode ? [{ debugName: "_pin" }] : []));
        this.pin$ = toObservable(this._pin);
        /**
         * @deprecated use linkSlicersChange
         */
        // @Output() slicersChange = new EventEmitter<Array<ISlicer | IAdvancedFilter>>()
        this.optionsChange = createEventEmitter(this.options$.pipe(withLatestFrom$1(this._options$), filter$1(([otions, _options]) => !isEqual(otions, _options)), map$1(([otions]) => otions)));
        this.dataSettingsChange = createEventEmitter(this._dataSettings$);
        this.explain = output();
        this.slicersChange = output();
        this.linkSlicersChange = output();
        this.entityType = signal(null, ...(ngDevMode ? [{ debugName: "entityType" }] : []));
        /**
         * @deprecated 为什么在这里定义 loading 状态管理 ？
         */
        this.isLoading$ = new BehaviorSubject(false);
        // State Query
        this._selectionVariant$ = this.select((state) => state.selectionVariant);
        this.presentationVariant$ = combineLatest([
            this.select((state) => state.presentationVariant),
            this.select((state) => state.rank)
        ]).pipe(map$1(([presentationVariant, rank]) => {
            if (isNil$1(presentationVariant) && isNil$1(rank)) {
                /**
                 * @todo 因为 ocap core 里有 bug， 会忽略 nil 的值， 不能对旧值覆盖， 所以得用 empty object
                 */
                return {};
            }
            presentationVariant = {
                ...(presentationVariant ?? {}),
                maxItems: rank ?? presentationVariant.maxItems
            };
            return presentationVariant;
        }));
        this.selectOptions$ = merge(this.select((state) => state.slicers), combineLatest([
            this._selectionVariant$.pipe(map$1((selectionVariant) => selectionVariant?.selectOptions)),
            this.slicers$
        ]).pipe(combineLatestWith(this.pin$), filter$1(([, pin]) => !pin), map$1(([[selectOptions, slicers]]) => {
            const results = [...(slicers ?? [])];
            selectOptions?.forEach((options) => {
                if (!results.find((item) => getPropertyName(item?.dimension) === getPropertyName(options.dimension))) {
                    results.push(options);
                }
            });
            return results;
        }))).pipe(distinctUntilChanged$1(isEqual));
        this.hasSlicers$ = this.selectOptions$.pipe(map$1((selectOptions) => !isEmpty(selectOptions)));
        this.selectionVariant$ = combineLatest([this._selectionVariant$, this.selectOptions$]).pipe(map$1(([selectionVariant, selectOptions]) => ({ ...(selectionVariant ?? {}), selectOptions })));
        this.dataSettings$ = combineLatest([
            this._dataSettings$,
            this._selectionVariant$,
            this.presentationVariant$
        ]).pipe(map$1(([dataSettings, selectionVariant, presentationVariant]) => {
            return {
                ...(dataSettings ?? {}),
                selectionVariant,
                presentationVariant
            };
        }));
        this.menuClick$ = this.widgetService?.onMenuClick();
        // State updaters
        this.setSelectOptions = this.updater((state, slicers) => {
            if (slicers) {
                state.slicers = [...slicers];
                this.slicersChange.emit(state.slicers);
            }
        });
        this.orderBy = this.updater((state, orderBy) => {
            state.presentationVariant = state.presentationVariant ?? {};
            state.presentationVariant.sortOrder = state.presentationVariant.sortOrder ?? [];
            const index = state.presentationVariant.sortOrder.findIndex((item) => item.by === orderBy.by);
            if (index > -1) {
                if (orderBy.order) {
                    state.presentationVariant.sortOrder[index].order = orderBy.order;
                }
                else {
                    state.presentationVariant.sortOrder.splice(index, 1);
                }
            }
            else if (orderBy.order) {
                state.presentationVariant.sortOrder.push(orderBy);
            }
        });
        this.rank = this.updater((state, rank) => {
            state.rank = rank;
        });
        this.updateOptions = this.updater((state, options) => {
            state.options = {
                ...state.options,
                ...options
            };
        });
        /**
        |--------------------------------------------------------------------------
        | Subscriptions (effect)
        |--------------------------------------------------------------------------
        */
        this.refreshSub = this.widgetService?.onRefresh().subscribe((force) => this.refresh(force));
        this._options$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((options) => this.patchState({ options }));
        this.widgetService?.onMenuClick().subscribe((menu) => {
            if (menu.key === 'refresh') {
                this.refresh(true);
            }
            else if (menu.action === 'rank') {
                this.rank(menu.selected ? menu.value : null);
            }
        });
    }
    ngAfterViewInit() {
        this.selectMenus()
            .pipe(combineLatestWith(this.dataSettings$, this.presentationVariant$), map$1(([menus, dataSettings, presentationVariant]) => {
            const WIDGET = this.getTranslation('NgCore.Widget');
            const rank = presentationVariant?.maxItems;
            if (dataSettings?.dataSource &&
                dataSettings?.entitySet &&
                (isNotEmpty(dataSettings?.chartAnnotation?.dimensions) || isNotEmpty(dataSettings?.analytics?.rows))) {
                menus = [
                    {
                        key: 'rank',
                        icon: 'military_tech',
                        name: WIDGET?.Rank ?? 'Rank',
                        type: WidgetMenuType.Menus,
                        menus: [5, 10, 20, 50].map((value) => ({
                            key: `rank_${value}`,
                            icon: 'done',
                            name: `${WIDGET?.Top ?? 'Top'} ${value}`,
                            action: 'rank',
                            type: WidgetMenuType.Toggle,
                            selected: value === rank,
                            value
                        }))
                    },
                    ...menus
                ];
            }
            return [...menus];
        }), takeUntilDestroyed(this.destroyRef))
            .subscribe((widgetMenus) => {
            this.widgetService?.setMenus(widgetMenus);
        });
    }
    focus(origin) {
        //
    }
    getLabel() {
        return this.key;
    }
    /**
     * 子类对 Refresh 逻辑进行增强
     *
     * @returns
     */
    refresh(force = false) {
        //
    }
    /**
     * 子类对 Menus 菜单的增强
     *
     * @returns
     */
    selectMenus() {
        return of([]);
    }
    translate(key) {
        return this.translateService?.stream(key).pipe(takeUntilDestroyed(this.destroyRef)) ?? of(null);
    }
    getTranslation(code, text, params) {
        return this.translateService?.instant(code, { Default: text, ...(params ?? {}) });
    }
    setExplains(items) {
        this.widgetService?.explains.set(items);
        this.explain.emit(items);
    }
    get densityCosy() {
        return this.styling?.appearance?.displayDensity === DisplayDensity.comfortable;
    }
    get densityCompact() {
        return this.styling?.appearance?.displayDensity === DisplayDensity.compact;
    }
    get densityComfortable() {
        return this.styling?.appearance?.displayDensity === DisplayDensity.cosy;
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: AbstractStoryWidget, deps: [], target: i0.ɵɵFactoryTarget.Directive }); }
    static { this.ɵdir = i0.ɵɵngDeclareDirective({ minVersion: "14.0.0", version: "21.1.4", type: AbstractStoryWidget, isStandalone: true, inputs: { key: "key", title: "title", dataSettings: "dataSettings", options: "options", styling: "styling", locale: "locale", editable: "editable", slicers: "slicers", pin: "pin" }, outputs: { optionsChange: "optionsChange", dataSettingsChange: "dataSettingsChange", explain: "explain", slicersChange: "slicersChange", linkSlicersChange: "linkSlicersChange" }, host: { properties: { "class.editable": "this.editable", "class.ngm-density__comfortable": "this.densityCosy", "class.ngm-density__compact": "this.densityCompact", "class.ngm-density__cosy": "this.densityComfortable" } }, usesInheritance: true, ngImport: i0 }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "21.1.4", ngImport: i0, type: AbstractStoryWidget, decorators: [{
            type: Directive
        }], ctorParameters: () => [], propDecorators: { key: [{
                type: Input
            }], title: [{
                type: Input
            }], dataSettings: [{
                type: Input
            }], options: [{
                type: Input
            }], styling: [{
                type: Input
            }], locale: [{
                type: Input
            }], editable: [{
                type: HostBinding,
                args: ['class.editable']
            }, {
                type: Input
            }], slicers: [{
                type: Input
            }], pin: [{
                type: Input
            }], optionsChange: [{
                type: Output
            }], dataSettingsChange: [{
                type: Output
            }], explain: [{ type: i0.Output, args: ["explain"] }], slicersChange: [{ type: i0.Output, args: ["slicersChange"] }], linkSlicersChange: [{ type: i0.Output, args: ["linkSlicersChange"] }], densityCosy: [{
                type: HostBinding,
                args: ['class.ngm-density__comfortable']
            }], densityCompact: [{
                type: HostBinding,
                args: ['class.ngm-density__compact']
            }], densityComfortable: [{
                type: HostBinding,
                args: ['class.ngm-density__cosy']
            }] } });

function saveAsYaml(fileName, obj) {
    const content = stringify(obj);
    // Create element with <a> tag
    const link = document.createElement('a');
    // Create a blog object with the file content which you want to add to the file
    const file = new Blob([content], { type: 'text/plain' });
    // Add file content in the object URL
    link.href = URL.createObjectURL(file);
    // Add file name
    link.download = fileName;
    // Add click event to <a> tag to save file.
    link.click();
    URL.revokeObjectURL(link.href);
}
async function uploadYamlFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = ((f) => {
            return (e) => {
                resolve(parse(e.target.result));
            };
        })(file);
        reader.readAsText(file, 'UTF-8');
    });
}
// 
async function parseYAML(content) {
    return parse(content);
}

function debounceUntilChanged(dueTime, key) {
    const isEqual = key ? (a, b) => a?.[key] === b?.[key] : (a, b) => a === b;
    return (source) => new Observable((observer) => {
        let lastValue;
        let timeoutId;
        const subscription = source.subscribe({
            next(value) {
                if (isEqual(lastValue, value)) {
                    clearTimeout(timeoutId);
                    timeoutId = setTimeout(() => {
                        observer.next(value);
                    }, dueTime);
                }
                else {
                    clearTimeout(timeoutId);
                    observer.next(value);
                }
                lastValue = value;
            },
            error(err) {
                observer.error(err);
            },
            complete() {
                observer.complete();
            }
        });
        return () => {
            clearTimeout(timeoutId);
            subscription.unsubscribe();
        };
    });
}

function linkedModel(options) {
    const { initialValue, compute, update } = options;
    const internalState = computed(compute, ...(ngDevMode ? [{ debugName: "internalState" }] : []));
    let currentValue = initialValue;
    const derived = signal(initialValue, ...(ngDevMode ? [{ debugName: "derived" }] : []));
    // Use effect to automatically synchronize
    effect(() => {
        currentValue = internalState();
        derived.set(currentValue);
    });
    effect(() => {
        if (derived() !== currentValue) {
            update(derived(), currentValue);
            currentValue = derived();
        }
    });
    return derived;
}
function attrModel(model, name) {
    return linkedModel({
        initialValue: null,
        compute: () => model()?.[name],
        update: (value) => {
            model.update((state) => ({ ...(state ?? {}), [name]: value }));
        }
    });
}

function bindFormControlToSignal(formControl, signal) {
    // Sync formControl → signal
    const sub = formControl.valueChanges
        .pipe(startWith(formControl.value), distinctUntilChanged$1())
        .subscribe((val) => {
        // Avoid unnecessary updates
        if (val !== signal()) {
            signal.set(val);
        }
    });
    // Sync signal → formControl
    effect(() => {
        const current = signal();
        if (formControl.value !== current) {
            formControl.setValue(current); // prevent loop
        }
    });
    // Optional: return unsubscribe function
    return () => sub.unsubscribe();
}

/**
 * @deprecated Will be replaced by the official `Resource` after upgrading to Angular 19
 */
function myResource(options) {
    const valueSig = signal(null, ...(ngDevMode ? [{ debugName: "valueSig" }] : []));
    const errorSig = signal(null, ...(ngDevMode ? [{ debugName: "errorSig" }] : []));
    const statusSig = signal('idle', ...(ngDevMode ? [{ debugName: "statusSig" }] : []));
    const refreshTrigger = signal(0, ...(ngDevMode ? [{ debugName: "refreshTrigger" }] : []));
    const requestSig = computed(() => {
        // 使用 refreshTrigger 使得 refresh 时也会重新请求
        refreshTrigger();
        return options.request();
    }, ...(ngDevMode ? [{ debugName: "requestSig" }] : []));
    // 自动 effect 监控 requestSig 变化，执行 loader
    effect(() => {
        const requestVal = requestSig();
        statusSig.set('loading');
        errorSig.set(null);
        options
            .loader({ request: untracked(() => requestVal) }) // 避免循环依赖
            .then((res) => {
            valueSig.set(res);
            statusSig.set('success');
        })
            .catch((err) => {
            errorSig.set(err);
            statusSig.set('error');
        });
    });
    return {
        value: computed(() => valueSig()),
        error: computed(() => errorSig()),
        status: computed(() => statusSig()),
        reload: () => refreshTrigger.set(refreshTrigger() + 1)
    };
}
/**
 *
 * @deprecated Will be replaced by the official `Resource` after upgrading to Angular 19
 */
function myRxResource(options) {
    const valueSig = signal(null, ...(ngDevMode ? [{ debugName: "valueSig" }] : []));
    const errorSig = signal(null, ...(ngDevMode ? [{ debugName: "errorSig" }] : []));
    const statusSig = signal('idle', ...(ngDevMode ? [{ debugName: "statusSig" }] : []));
    const refreshTrigger = signal(0, ...(ngDevMode ? [{ debugName: "refreshTrigger" }] : []));
    const requestSig = computed(() => {
        refreshTrigger();
        return options.request();
    }, ...(ngDevMode ? [{ debugName: "requestSig" }] : []));
    let currentSub = null;
    // 保证资源释放（避免订阅泄漏）
    const destroyRef = inject(DestroyRef);
    effect(() => {
        const req = requestSig();
        statusSig.set('loading');
        errorSig.set(null);
        // 取消上一个订阅
        if (currentSub) {
            currentSub.unsubscribe();
        }
        const obs$ = options.loader({ request: untracked(() => req) });
        currentSub = obs$.subscribe({
            next: (res) => {
                valueSig.set(res);
                statusSig.set('success');
            },
            error: (err) => {
                errorSig.set(err);
                statusSig.set('error');
            }
        });
    });
    // 注销组件时，清理订阅
    destroyRef.onDestroy(() => {
        if (currentSub) {
            currentSub.unsubscribe();
        }
    });
    return {
        value: computed(() => valueSig()),
        error: computed(() => errorSig()),
        status: computed(() => statusSig()),
        reload: () => refreshTrigger.set(refreshTrigger() + 1)
    };
}

/*
 * Public API Surface of core
 */

/**
 * @license
 * Copyright Xpert LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

/**
 * Generated bundle index. Do not edit.
 */

export { AbstractStoryWidget, AnimationsService, ArraySlicePipe, AsteriskPipe, BackdropFilterEnum, BaseDimensionMemberRetriever, ButtonClickEvents, CapitalizePipe, ChartComplexity, ColorPalettes, ControlType, DATA, DEFAULT_DIGITS_INFO, DataType, Disappear1, DisappearAnimations, DisappearBL, DisappearFadeOut, DisappearSlideDown, DisappearSlideLeft, DynamicGridDirective, EntriesPipe, FileExtensionPipe, FileTypePipe, FilterByPipe, FilterEnum, FilterPipe, HeightChangeAnimation, IfAnimation, IfAnimations, IndicatorFormulaSchema, IndicatorSchema, InputControlSelectionType, IsNilPipe, KEYCODES, KEYS, KebabToCamelCasePipe, KeysPipe, LeanRightEaseInAnimation, ListHeightStaggerAnimation, ListSlideStaggerAnimation, MEMBER_RETRIEVER_TOKEN, MapPipe, MaskPipe, NAVIGATION_KEYS, NX_SCALE_CHROMATIC, NX_SMART_CHART_TYPE, NX_THEME_DEFAULT, NX_THEME_OPTIONS, NX_THEME_OPTIONS_FACTORY, NgFilterPipeModule, NgMapPipeModule, NgmDndDirective, NgmTransformScaleDirective, NxChartLibrary, NxChartService, NxChartType, NxChromaticType, NxCoreModule, NxCoreService, NxShortNumberService, ODATA_ENTITY, ODATA_ENTITY_DATA, ODATA_ENTITY_DIMENSION, ODATA_ENTITY_VALUEHELP_ENTITY, ODATA_ENTITY_VALUEHELP_PROPERTY, ODATA_META_DATA, ODATA_SRV, ODATA_URI, ODATA_URI_METADATA, ODATA_VALUEHELP_DATA, ODATA_VALUEHELP_SELECT_OPTIONS, OptionsStore, OptionsStore2, OverlayAnimation1, OverlayAnimations, PlatformUtil, PresentationEnum, PropertyPipe, ROUTE_ANIMATIONS_ELEMENTS, ROW_COLLAPSE_KEYS, ROW_EXPAND_KEYS, ResizeObserverDirective, ReversePipe, SUPPORTED_KEYS, SafePipe, SemanticStyle, SlideLeftRightAnimation, SlideUpAnimation, SlideUpDownAnimation, SortDirection, SubStore, TimeRangeEnum, TimeRangeOptions, TranslatePipe, TreeSelectionMode, TypeAheadType, WidgetMenuType, WidgetService, attrModel, bindFormControlToSignal, calcEntityTypePrompt, calcTimeRange, camelCaseObject, click, cloneArray, cloneHierarchicalArray, cloneValue, connect, convertPropertyToTableColumn, convertQueryResultColumns, convertTableToCSV, convertToBoolProperty, createDimensionMemberRetrieverTool, createEventEmitter, createSubStore, debounceUntilChanged, debugDirtyCheckComparator, dirtyCheck, dirtyCheckWith, filterNil, flatPivotColumns, getErrorMessage, getNodeSizeViaRange, getSelectorFn, includeIgnoreCase, injectChartCommand, injectDimensionMemberRetrieverTool, injectDimensionMemberTool, isDate, isEdge, isFirefox, isIE, isLeftClick, isNavigationKey, isNotEmpty, isNotEqual, isNotNullOrUndefined, isNotNullOrUndefinedOrEmpty, isNullOrUndefined, isObject, isRGBColor, isRouteAnimationsAll, isRouteAnimationsElements, isRouteAnimationsNone, isRouteAnimationsPage, linkedModel, listAnimation, listEnterAnimation, makeChartDimensionSchema, makeChartEnum, makeChartMeasureSchema, makeChartRulesPrompt, makeChartSchema, makeCubePrompt, makeTablePrompt, makeid, markdownTable, mergeObjects, mkenum, myResource, myRxResource, parseYAML, readExcelJson, readExcelWorkSheets, replaceParameters, resizeObservable, rgb2hex, routeAnimations, saveAsYaml, splitByHighlight, toFormData, toParams, uploadYamlFile, write, zodToProperties };
//# sourceMappingURL=metad-core.mjs.map
