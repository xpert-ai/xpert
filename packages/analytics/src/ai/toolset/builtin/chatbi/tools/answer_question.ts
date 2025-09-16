import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { getCurrentTaskInput } from '@langchain/langgraph'
import { ChatMessageEventTypeEnum, TAgentRunnableConfigurable, TMessageComponent } from '@metad/contracts'
import {
	AnalyticsAnnotation,
	AnalyticsBusinessService,
	C_MEASURES,
	DataSettings,
	FilteringLogic,
	getEntityDimensions,
	getEntityProperty,
	Measure,
	PresentationVariant,
	toAdvancedFilter,
	tryFixDimension,
	tryFixOrder,
	tryFixSlicer,
	tryFixVariableSlicer,
	workOutTimeRangeSlicers
} from '@metad/ocap-core'
import { isEmpty, omit } from '@metad/server-common'
import { Subject, takeUntil } from 'rxjs'
import { fixMeasure } from '../../../types'
import { BIVariableEnum, mapTimeSlicer } from '../../bi-toolset'
import { ChatAnswer, ChatBIContext, extractDataValue, TChatBICredentials, tryFixDimensions } from '../types'

export async function drawTableMessage(
	answer: ChatAnswer,
	context: ChatBIContext,
	configurable: TAgentRunnableConfigurable,
	credentials: TChatBICredentials
) {
	const { dsCoreService, entityType, chatbi, language } = context
	const { subscriber, agentKey, xpertName, tool_call_id } = configurable ?? {}
	const { showError } = credentials

	const currentState = getCurrentTaskInput()
	// const lang = currentState[STATE_VARIABLE_SYS]?.language
	const indicators = currentState[BIVariableEnum.INDICATORS]?.map((_) => omit(_, 'default', 'reducer'))
	const chartService = new AnalyticsBusinessService(dsCoreService)
	const destroy$ = new Subject<void>()

	const analytics: AnalyticsAnnotation = {
		rows: tryFixDimensions(answer.dimensions?.map((dimension) => tryFixDimension(dimension, entityType))),
		columns:
			answer.measures?.map((measure) => {
				measure = fixMeasure(measure, entityType)
				const property = getEntityProperty(entityType, measure.measure)
				if (!property) {
					throw new Error(`Measure '${measure.measure}' not found in cube '${entityType.name}'`)
				}
				return measure
			}) ?? []
	}

	if (analytics.columns.length === 0 && entityType.defaultMeasure) {
		analytics.columns.push({
			dimension: C_MEASURES,
			measure: entityType.defaultMeasure
		})
	}

	// Check validation
	if (isEmpty(analytics.columns)) {
		throw new Error('The measures of answer cannot be empty')
	}

	const slicers = []
	if (answer.variables) {
		slicers.push(...answer.variables.map((slicer) => tryFixVariableSlicer(slicer, entityType)))
	}
	if (answer.slicers) {
		slicers.push(...answer.slicers.map((slicer) => tryFixSlicer(slicer, entityType)))
	}
	if (answer.timeSlicers) {
		const timeSlicers = mapTimeSlicer(answer.timeSlicers)
			.map((slicer) => workOutTimeRangeSlicers(new Date(), slicer, entityType))
			.map((ranges) => toAdvancedFilter(ranges, FilteringLogic.And))
		slicers.push(...timeSlicers)
	}

	const presentationVariant: PresentationVariant = {}
	if (answer.limit) {
		presentationVariant.maxItems = answer.limit
	}
	if (answer.orders) {
		presentationVariant.sortOrder = answer.orders.map(tryFixOrder)
	}
	presentationVariant.groupBy = getEntityDimensions(entityType)
		.filter((property) => !analytics.rows?.some((item) => item.dimension === property.name))
		.map((property) => ({
			dimension: property.name,
			hierarchy: property.defaultHierarchy,
			level: null
		}))

	const dataSettings: DataSettings = {
		...answer.dataSettings,
		analytics,
		presentationVariant,
		calculatedMembers: answer.calculated_members,
		parameters: answer.parameters?.reduce((acc, { name, value }) => {
			acc[name] = value
			return acc
		}, {})
	}

	// In parallel: return to the front-end display and back-end data retrieval
	if (showError) {
		await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
			id: tool_call_id,
			category: 'Dashboard',
			type: 'AnalyticalGrid',
			dataSettings,
			slicers,
			title: answer.preface,
			indicators
		} as TMessageComponent)
	}

	return new Promise((resolve, reject) => {
		chartService.selectResult().subscribe((result) => {
			if (result.error) {
				reject(result.error)
			} else {
				if (!showError) {
					dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
						id: tool_call_id,
						category: 'Dashboard',
						type: 'AnalyticalGrid',
						dataSettings,
						slicers,
						title: answer.preface,
						indicators
					} as TMessageComponent).catch((error) => {
						console.error(error)
					})
				}
				resolve(extractDataValue(result.data, {dimensions: analytics.rows, measures: analytics.columns as Measure[]}, credentials))
			}
			destroy$.next()
			destroy$.complete()
		})

		chartService
			.onAfterServiceInit()
			.pipe(takeUntil(destroy$))
			.subscribe(() => {
				chartService.refresh()
			})

		chartService.slicers = slicers
		chartService.dataSettings = dataSettings
	})
}
