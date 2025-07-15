import { buildSchema, convertSchemaToXmla } from './helper'
import { MDX } from '@metad/contracts'

const SCHEMA = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Schema name="Sales Schema">
  <Dimension name="Gender" foreignKey="customer_id">
    <Hierarchy name="" hasAll="true" allMemberName="All Genders" primaryKey="customer_id">
      <Table name="customer"/>
      <Level name="Gender" column="gender" uniqueMembers="true"/>
    </Hierarchy>
  </Dimension>
  <Cube name="Sales">
    <Table name="sales_fact"/>
    <DimensionUsage name="Gender" source="Gender" foreignKey="customer_id"/>
    <Dimension name="Gender" foreignKey="customer_id">
      <Hierarchy name="" hasAll="true" allMemberName="All Genders" primaryKey="customer_id">
        <Table name="customer"/>
        <Level name="Gender" column="gender" uniqueMembers="true"/>
      </Hierarchy>
    </Dimension>
    <Dimension name="Time" foreignKey="time_id">
      <Hierarchy name="" hasAll="false" primaryKey="time_id">
        <Table name="time_by_day"/>
        <Level name="Year" column="the_year" type="Numeric" uniqueMembers="true"/>
        <Level name="Quarter" column="quarter" uniqueMembers="false"/>
        <Level name="Month" column="month_of_year" type="Numeric" uniqueMembers="false">
          <CaptionExpression>
            <SQL dialect="generic">time_by_day.the_year + time_by_day.the_month</SQL>
          </CaptionExpression>
        </Level>
      </Hierarchy>
    </Dimension>
    <Measure name="Unit Sales" column="unit_sales" aggregator="sum" formatString="#,###"/>
    <Measure name="Store Sales" column="store_sales" aggregator="sum" formatString="#,###.##"/>
    <Measure name="Store Cost" column="store_cost" aggregator="sum" formatString="#,###.00"/>
    <CalculatedMember name="Profit" dimension="Measures" formula="[Measures].[Store Sales] - [Measures].[Store Cost]">
      <CalculatedMemberProperty name="FORMAT_STRING" value="$#,##0.00"/>
    </CalculatedMember>
  </Cube>
</Schema>`

describe('MDX Schema', () => {
	beforeEach(() => {
		//
	})

	it('#toXML', () => {
		const schema: MDX.Schema = {
			name: 'Sales Schema',
			Cube: [
				{
					name: 'Sales',
					Table: [
						{
							name: 'sales_fact'
						}
					],
					Dimension: [
						{
							name: 'Gender',
							foreignKey: 'customer_id',
							Hierarchy: [
								{
									hasAll: true,
									allMemberName: 'All Genders',
									primaryKey: 'customer_id',
									Table: [
										{
											name: 'customer'
										}
									],
									Level: [
										{
											name: 'Gender',
											column: 'gender',
											uniqueMembers: true
										}
									]
								}
							]
						},
						{
							name: 'Time',
							foreignKey: 'time_id',
							Hierarchy: [
								{
									hasAll: false,
									primaryKey: 'time_id',
									Table: [
										{
											name: 'time_by_day'
										}
									],
									Level: [
										{
											name: 'Year',
											column: 'the_year',
											type: 'Numeric',
											uniqueMembers: true
										},
										{
											name: 'Quarter',
											column: 'quarter',
											uniqueMembers: false
										},
										{
											name: 'Month',
											column: 'month_of_year',
											type: 'Numeric',
											uniqueMembers: false,
											CaptionExpression: {
												SQL: {
													dialect: 'generic',
													_: 'time_by_day.the_year + time_by_day.the_month'
												}
											}
										}
									]
								}
							]
						}
					],
					Measure: [
						{
							name: 'Unit Sales',
							column: 'unit_sales',
							aggregator: 'sum',
							formatString: '#,###'
						},
						{
							name: 'Store Sales',
							column: 'store_sales',
							aggregator: 'sum',
							formatString: '#,###.##'
						},
						{
							name: 'Store Cost',
							column: 'store_cost',
							aggregator: 'sum',
							formatString: '#,###.00'
						}
					],
					CalculatedMember: [
						{
							name: 'Profit',
							dimension: 'Measures',
							formula: '[Measures].[Store Sales] - [Measures].[Store Cost]',
							CalculatedMemberProperty: [
								{
									name: 'FORMAT_STRING',
									value: '$#,##0.00'
								}
							]
						}
					]
				}
			]
		}

		const str = buildSchema(schema)
		console.warn(str)
		expect(str).toEqual(SCHEMA)

		// parseSchema(str).subscribe(result => {
		//   console.warn(result)
		//   expect(result).toEqual({
		//     Schema: schema
		//   })
		// })
	})

	it('Convert Schema to MDX Schema string', () => {
		const schema = {
			name: 'Sales Schema',
			dimensions: [
				{
					name: 'Gender',
					foreignKey: 'customer_id',
					hierarchies: [
						{
							name: '',
							hasAll: true,
							allMemberName: 'All Genders',
							primaryKey: 'customer_id',
							tables: [
								{
									name: 'customer'
								}
							],
							levels: [
								{
									name: 'Gender',
									column: 'gender',
									uniqueMembers: true
								}
							]
						}
					]
				}
			],
			cubes: [
				{
					name: 'Sales',
					tables: [{ name: 'sales_fact' }],
					dimensionUsages: [
						{
							name: 'Gender',
							source: 'Gender',
							foreignKey: 'customer_id'
						}
					],
					dimensions: [
						{
							name: 'Gender',
							foreignKey: 'customer_id',
							hierarchies: [
								{
									name: '',
									hasAll: true,
									allMemberName: 'All Genders',
									primaryKey: 'customer_id',
									tables: [
										{
											name: 'customer'
										}
									],
									levels: [
										{
											name: 'Gender',
											column: 'gender',
											uniqueMembers: true
										}
									]
								}
							]
						},
						{
							name: 'Time',
							foreignKey: 'time_id',
							hierarchies: [
								{
									name: '',
									hasAll: false,
									primaryKey: 'time_id',
									tables: [
										{
											name: 'time_by_day'
										}
									],
									levels: [
										{
											name: 'Year',
											column: 'the_year',
											type: 'Numeric',
											uniqueMembers: true
										},
										{
											name: 'Quarter',
											column: 'quarter',
											uniqueMembers: false
										},
										{
											name: 'Month',
											column: 'month_of_year',
											type: 'Numeric',
											uniqueMembers: false,
											captionExpression: {
												sql: {
													dialect: 'generic',
													content: 'time_by_day.the_year + time_by_day.the_month'
												}
											}
										}
									]
								}
							]
						}
					],
					measures: [
						{
							name: 'Unit Sales',
							column: 'unit_sales',
							aggregator: 'sum',
							formatString: '#,###'
						},
						{
							name: 'Store Sales',
							column: 'store_sales',
							aggregator: 'sum',
							formatString: '#,###.##'
						},
						{
							name: 'Store Cost',
							column: 'store_cost',
							aggregator: 'sum',
							formatString: '#,###.00'
						}
					],
					calculatedMembers: [
						{
							name: 'Profit',
							dimension: 'Measures',
							formula: '[Measures].[Store Sales] - [Measures].[Store Cost]',
							calculatedProperties: [
								{
									name: 'FORMAT_STRING',
									value: '$#,##0.00'
								}
							]
						}
					]
				}
			]
		}

		const xmlaSchema: MDX.Schema = convertSchemaToXmla('Sales Schema', schema)

		const str = buildSchema(xmlaSchema)
		console.warn(str)
		expect(str).toEqual(SCHEMA)
	})

	it('Convert Tables to MDX Join string', () => {
		const schema = {
			name: 'Sales Schema',
			dimensions: [
				{
					name: 'Product',
					foreignKey: 'product_id',
					hierarchies: [
						{
							name: '',
							hasAll: true,
							allMemberName: 'All Product',
							primaryKey: 'product_id',
							primaryKeyTable: 'product',
							tables: [
								{
									name: 'product'
								},
								{
									name: 'product_class',
									join: {
										type: 'Inner',
										fields: [
											{
												leftKey: 'product_class_id',
												rightKey: 'product_class_id'
											}
										]
									}
								},
								{
									name: 'product_type',
									join: {
										type: 'Inner',
										fields: [
											{
												leftKey: 'product_type_id',
												rightKey: 'product_type_id'
											}
										]
									}
								}
							]
						}
					]
				}
			]
		}

		const xmlaSchema: MDX.Schema = convertSchemaToXmla('Sales Schema', schema)

		const str = buildSchema(xmlaSchema)
		expect(str).toEqual(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Schema name="Sales Schema">
  <Dimension name="Product" foreignKey="product_id">
    <Hierarchy name="" hasAll="true" allMemberName="All Product" primaryKey="product_id" primaryKeyTable="product">
      <Join leftKey="product_class_id" rightKey="product_class_id">
        <Table name="product"/>
        <Join leftKey="product_type_id" rightKey="product_type_id">
          <Table name="product_class"/>
          <Table name="product_type"/>
        </Join>
      </Join>
    </Hierarchy>
  </Dimension>
</Schema>`)
	})
})
