import { Employee } from '@metad/server-core'
import { Repository } from 'typeorm'
import {
	SemanticModel,
	Story,
	StoryPoint,
	StoryWidget,
} from '../../../../entities/internal'
import { createWidget } from '../common'
import { ENTITY_SALES, SEMANTIC_MODEL_NAME } from '../semantic-model'

export const STORY_NAME = 'Demo - 门店销售监控大屏'
export const STORY_OPTIONS = {
	options: {
		themeName: 'dark',
		preferences: {
			story: {
				watermarkOptions: { color: '' },
				styling: { 'background-color': '', color: '' },
				tabBar: 'hidden',
			},
			page: { 'background-color': '' },
			widget: { 'background-color': '', color: '' },
			card: {
				'background-color': 'transparent',
				color: '',
				'border-radius': '0',
				'box-shadow': 'unset',
				background: 'url(/assets/images/components/各模块边框.png) ',
				'background-size': '100% 100%',
			},
			texts: { color: '' },
			tables: { color: '' },
			control: { color: '' },
		},
		advancedStyle:
			'nx-breadcrumb-bar .z-tab-nav-bar.breadcrumb {\r\n    border-bottom: unset;\r\n}',
	},
	filterBar: {
		dataSettings: {
			selectionFieldsAnnotation: {
				propertyPaths: [
					{
						dimension: '[Product]',
					},
				],
			},
			dataSource: 'Demo - FoodMart Model',
			entitySet: 'Sales',
		},
		options: { today: {} },
		styling: { widget: { 'background-color': '' } },
	},
}

export const page1Name = 'Store Sales'
export const page1Options = {
	type: 1,
	key: 'eac0a2ff-9cd5-4c41-a946-d8246d46869a',
	index: 0,
	responsive: null,
	gridOptions: {
		gridType: 'fit',
		fixedColWidth: 15,
		fixedRowHeight: 15,
		allowMultiLayer: true,
		swapWhileDragging: false,
		displayGrid: 'always',
		minRows: 5,
		minCols: 5,
		outerMargin: false,
		defaultLayerIndex: 2,
		baseLayerIndex: 1,
		maxLayerIndex: 3,
	},
	filterBar: null,
	styling: { canvas: { 'background-color': '' }, pageSize: {} },
	fullscreen: true,
}

export async function createDemoBigViewStory(
	employee: Employee,
	semanticModel: SemanticModel,
	storyRepository: Repository<Story>,
	storyPageRepository: Repository<StoryPoint>,
	storyWidgetRepository: Repository<StoryWidget>
) {
	let story = new Story()
	story.tenantId = employee.tenantId
	story.createdById = employee.userId
	story.organizationId = employee.organizationId
	story.businessAreaId = semanticModel.businessAreaId
	story.modelId = semanticModel.id
	story.name = STORY_NAME
	story.options = STORY_OPTIONS
	story = await storyRepository.save(story)

	let page1 = new StoryPoint()
	page1.tenantId = employee.tenantId
	page1.createdById = employee.userId
	page1.organizationId = employee.organizationId
	page1.storyId = story.id
	page1.name = page1Name
	page1.options = page1Options
	page1 = await storyPageRepository.save(page1)

	await createWidget(storyWidgetRepository, page1, '背景图形', {
		key: 'e84b6afb-0807-459e-8c2a-84ddca786962',
		styling: {
			layer: { x: 0, y: 0, rows: 16, cols: 16, layerIndex: 1 },
			widget: {
				'background-color': '',
				'box-shadow': 'unset',
				'border-radius': '0',
				background: 'unset',
			},
		},
		component: 'AnalyticalCard',
		title: '',
		dataSettings: {
			dataSource: SEMANTIC_MODEL_NAME,
			entitySet: ENTITY_SALES,
			chartAnnotation: {
				measures: [
					{
						dimension: 'Measures',
						measure: 'Sales',
					},
				],
				dimensions: [
					{
						dimension: '[Customers]',
						hierarchy: '[Customers]',
						level: '[Customers].[Country]',
						properties: ['[Customers].[Lat]', '[Customers].[Long]'],
					},
				],
				chartType: {type: 'Bar'},
			},
		},
		options: {},
		chartSettings: {
			customLogic:
				"// console.log(data)\r\nlet ds = data.results.map((item) => {\r\n    return {\r\n        name: item['[Customers]'],\r\n        point: [item['[Customers].[Long]'], item['[Customers].[Lat]'], 0],\r\n        itemStyleColor: '#f00',\r\n        labelText: item['[Customers]_Text'] + ': ' + Math.floor(item.Sales)\r\n    }\r\n})\r\n\r\n// 点配置信息\r\nlet series = ds.map(item => {\r\n    return {\r\n        name: item.name, // 是否显示左上角图例\r\n        type: 'scatter3D',\r\n        coordinateSystem: 'globe',\r\n        blendMode: 'lighter',\r\n        symbolSize: 16, // 点位大小\r\n\r\n        itemStyle: {\r\n            color: item.itemStyleColor, // 各个点位的颜色设置\r\n            opacity: 1, // 透明度\r\n            borderWidth: 1, // 边框宽度\r\n            borderColor: 'rgba(255,255,255,0.8)' //rgba(180, 31, 107, 0.8)\r\n        },\r\n        label: {\r\n            show: true, // 是否显示字体\r\n            position: 'left', // 字体位置。top、left、right、bottom\r\n            formatter: item.labelText, // 具体显示的值\r\n            textStyle: {\r\n                color: '#fff', // 字体颜色\r\n                borderWidth: 0, // 字体边框宽度\r\n                borderColor: '#fff', // 字体边框颜色\r\n                fontFamily: 'sans-serif', // 字体格式\r\n                fontSize: 18, // 字体大小\r\n                fontWeight: 700 // 字体加粗\r\n            }\r\n        },\r\n        data: [item.point] // 数据来源\r\n    }\r\n})\r\n\r\nreturn {\r\n    // 地球背景色\r\n    // backgroundColor: '#2E2677',\r\n    // 地球参数设置\r\n    globe: {\r\n        baseTexture: '/assets/images/components/globe-bg4.jpg', // 地球表面覆盖的图片,可以替换成自己想要的图片\r\n        shading: 'color', // 地球中三维图形的着色效果\r\n        viewControl: {\r\n            autoRotate: true, // 是否开启视角绕物体的自动旋转查看\r\n            autoRotateSpeed: 3, //物体自转的速度,单位为角度 / 秒，默认为10 ，也就是36秒转一圈。\r\n            autoRotateAfterStill: 2, // 在鼠标静止操作后恢复自动旋转的时间间隔,默认 3s\r\n            rotateSensitivity: 2, // 旋转操作的灵敏度，值越大越灵敏.设置为0后无法旋转。[1, 0]只能横向旋转.[0, 1]只能纵向旋转\r\n            targetCoord: [116.46, 39.92], // 定位到北京\r\n            maxDistance: 200,\r\n            minDistance: 200\r\n        }\r\n    },\r\n    // 地球文字显示信息配置\r\n    series: series\r\n}",
		},
		fullscreen: true,
	})

	await createWidget(storyWidgetRepository, page1, '标题', {
		key: 'bd517a30-4bbd-4fb0-ade8-f868a157c473',
		styling: {
			widget: {
				'background-color': '',
				background:
					'url(https://help.fanruan.com/dvg/uploads/20210623/1624414367674626.png)',
				'background-size': '100% 100%',
			},
			layer: { cols: 16, rows: 1, x: 0, y: 0 },
		},
		component: 'Document',
		title: '标题',
		dataSettings: { dataSource: 'Demo - FoodMart Model', entitySet: null },
		options: {
			content:
				'<p style="text-align: center; line-height: 2;"><span style="font-size: 24pt; color: rgb(21, 246, 247);">销售大数据监控平台</span></p>',
		},
	})
}
