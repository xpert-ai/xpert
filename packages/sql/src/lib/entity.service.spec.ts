// import { C_MEASURES } from '@metad/ocap-core'
// import { MockAgent } from './agent-mock.service'
// import { SQLDataSource } from './data-source'
// import { CUBE_SALESORDER, SCHEMA } from './mock-data'
// import { C_MEASURES_ROW_COUNT } from './types'


// describe('SQL Entity Service', () => {
//   let dataSource: SQLDataSource

//   beforeAll(() => {
//     dataSource = new SQLDataSource(
//       {
//         name: 'Sales',
//         type: 'SQL',
//         schema: SCHEMA,
//       },
//       new MockAgent(),
//       null
//     )
//   })

//   it('Query Dimension', (done) => {
//     const entityService = dataSource.createEntityService('Product')
//     entityService.selectEntityType().subscribe((entityType) => {
//       entityService
//         .query({
//           rows: [
//             {
//               dimension: '[Product]',
//               level: '[Product].[Product Type]'
//             },
//             {
//               dimension: '[Product]',
//               level: '[Product].[Product Class]'
//             },
//             {
//               dimension: '[Product]',
//               level: '[Product].[Product]'
//             }
//           ]
//         })
//         .subscribe((result: any) => {
//           expect(result.statement).toEqual(
//             "SELECT concat('[', CASE WHEN `[product]_product_type`.`product_type_id` IS NULL THEN '#' ELSE `[product]_product_type`.`product_type_id` END, ']') AS `[Product].[Product Type]`, `[product]_product_type`.`product_type_id` AS `[Product].[Product Type].[MEMBER_CAPTION]`, concat('[', CASE WHEN `[product]_product_type`.`product_type_id` IS NULL THEN '#' ELSE `[product]_product_type`.`product_type_id` END,'].[',CASE WHEN `[product]_product_class`.`product_class_id` IS NULL THEN '#' ELSE `[product]_product_class`.`product_class_id` END, ']') AS `[Product].[Product Class]`, `[product]_product_class`.`product_class_id` AS `[Product].[Product Class].[MEMBER_CAPTION]`, concat('[', CASE WHEN `[product]_product_type`.`product_type_id` IS NULL THEN '#' ELSE `[product]_product_type`.`product_type_id` END,'].[',CASE WHEN `[product]_product_class`.`product_class_id` IS NULL THEN '#' ELSE `[product]_product_class`.`product_class_id` END,'].[',CASE WHEN `[product]_product`.`product_name` IS NULL THEN '#' ELSE `[product]_product`.`product_name` END, ']') AS `[Product].[Product]`, `[product]_product`.`product_name` AS `[Product].[Product].[MEMBER_CAPTION]` FROM (`product` AS `[product]_product` Left JOIN `product_class` AS `[product]_product_class` ON `[product]_product`.`product_class_id` = `[product]_product_class`.`product_class_id` Left JOIN `product_type` AS `[product]_product_type` ON `[product]_product_class`.`product_type_id` = `[product]_product_type`.`product_type_id`)"
//           )
//           done()
//         })
//     })
//   })

//   it('Query Dimension with Row Count', (done) => {
//     const entityService = dataSource.createEntityService('Product')
//     entityService.selectEntityType().subscribe((entityType) => {
//       // console.log(entityType)
//       entityService
//         .query({
//           rows: [
//             {
//               dimension: '[Product]',
//               level: '[Product].[Product Type]'
//             },
//             {
//               dimension: '[Product]',
//               level: '[Product].[Product Class]'
//             },
//             {
//               dimension: '[Product]',
//               level: '[Product].[Product]'
//             }
//           ],
//           columns: [
//             {
//               dimension: C_MEASURES,
//               measure: C_MEASURES_ROW_COUNT
//             }
//           ]
//         })
//         .subscribe((result: any) => {
//           expect(result.statement).toEqual(
//             "SELECT concat('[', CASE WHEN `[product]_product_type`.`product_type_id` IS NULL THEN '#' ELSE `[product]_product_type`.`product_type_id` END, ']') AS `[Product].[Product Type]`, `[product]_product_type`.`product_type_id` AS `[Product].[Product Type].[MEMBER_CAPTION]`, concat('[', CASE WHEN `[product]_product_type`.`product_type_id` IS NULL THEN '#' ELSE `[product]_product_type`.`product_type_id` END,'].[',CASE WHEN `[product]_product_class`.`product_class_id` IS NULL THEN '#' ELSE `[product]_product_class`.`product_class_id` END, ']') AS `[Product].[Product Class]`, `[product]_product_class`.`product_class_id` AS `[Product].[Product Class].[MEMBER_CAPTION]`, concat('[', CASE WHEN `[product]_product_type`.`product_type_id` IS NULL THEN '#' ELSE `[product]_product_type`.`product_type_id` END,'].[',CASE WHEN `[product]_product_class`.`product_class_id` IS NULL THEN '#' ELSE `[product]_product_class`.`product_class_id` END,'].[',CASE WHEN `[product]_product`.`product_name` IS NULL THEN '#' ELSE `[product]_product`.`product_name` END, ']') AS `[Product].[Product]`, `[product]_product`.`product_name` AS `[Product].[Product].[MEMBER_CAPTION]`, SUM(1) AS `Measures_Row_Count` FROM (`product` AS `[product]_product` Left JOIN `product_class` AS `[product]_product_class` ON `[product]_product`.`product_class_id` = `[product]_product_class`.`product_class_id` Left JOIN `product_type` AS `[product]_product_type` ON `[product]_product_class`.`product_type_id` = `[product]_product_type`.`product_type_id`) GROUP BY `[product]_product_type`.`product_type_id`, `[product]_product_class`.`product_class_id`, `[product]_product`.`product_name`"
//           )
//           done()
//         })
//     })
//   })

//   it('Query Cube', (done) => {
//     const entityService = dataSource.createEntityService(CUBE_SALESORDER.name)
//     entityService.selectEntityType().subscribe(() => {
//       entityService
//         .query({
//           rows: [
//             {
//               dimension: '[Product]',
//               level: '[Product].[Product]'
//             }
//           ]
//         })
//         .subscribe((result: any) => {
//           expect(result.statement).toEqual(
//             "SELECT concat('[', CASE WHEN `[product]_product`.`brand_name` IS NULL THEN '#' ELSE `[product]_product`.`brand_name` END,'].[',CASE WHEN `[product]_product`.`product_name` IS NULL THEN '#' ELSE `[product]_product`.`product_name` END, ']') AS `[Product]`, `[product]_product`.`product_name` AS `[Product].[MEMBER_CAPTION]`, SUM( `salesorder_sales_fact`.`store_sales` ) AS `Sales` FROM `sales_fact` AS `salesorder_sales_fact` INNER JOIN `product` AS `[product]_product` ON `salesorder_sales_fact`.`product_id` = `[product]_product`.`product_id` GROUP BY `[product]_product`.`brand_name`, `[product]_product`.`product_name`, `[product]_product`.`product_id` ORDER BY `[product]_product`.`brand_name`, `[product]_product`.`product_id`"
//           )
//           done()
//         })
//     })
//   })
// })

// describe('PG SQL Entity Service', () => {
//   let dataSource: SQLDataSource

//   beforeAll(() => {
//     dataSource = new SQLDataSource(
//       {
//         name: 'Sales',
//         type: 'SQL',
//         dialect: 'pg',
//         schema: SCHEMA
//       },
//       new MockAgent(),
//       null
//     )
//   })

//   it('Query Dimension', (done) => {
//     const entityService = dataSource.createEntityService('Product')
//     entityService.selectEntityType().subscribe((entityType) => {
//       // console.log(entityType)
//       entityService
//         .query({
//           rows: [
//             {
//               dimension: '[Product]',
//               level: '[Product].[Product Type]'
//             },
//             {
//               dimension: '[Product]',
//               level: '[Product].[Product Class]'
//             },
//             {
//               dimension: '[Product]',
//               level: '[Product].[Product]'
//             }
//           ]
//         })
//         .subscribe((result: any) => {
//           // console.log(result)
//           expect(result.statement).toEqual(
//             `SELECT concat('[', CASE WHEN "[product]_product_type"."product_type_id" IS NULL THEN '#' ELSE CAST("[product]_product_type"."product_type_id" AS VARCHAR) END, ']') AS "[Product].[Product Type]", "[product]_product_type"."product_type_id" AS "[Product].[Product Type].[MEMBER_CAPTION]", concat('[', CASE WHEN "[product]_product_type"."product_type_id" IS NULL THEN '#' ELSE CAST("[product]_product_type"."product_type_id" AS VARCHAR) END,'].[',CASE WHEN "[product]_product_class"."product_class_id" IS NULL THEN '#' ELSE CAST("[product]_product_class"."product_class_id" AS VARCHAR) END, ']') AS "[Product].[Product Class]", concat('C_', "[product]_product_class"."product_class_id") AS "[Product].[Product Class].[MEMBER_CAPTION]", concat('[', CASE WHEN "[product]_product_type"."product_type_id" IS NULL THEN '#' ELSE CAST("[product]_product_type"."product_type_id" AS VARCHAR) END,'].[',CASE WHEN "[product]_product_class"."product_class_id" IS NULL THEN '#' ELSE CAST("[product]_product_class"."product_class_id" AS VARCHAR) END,'].[',CASE WHEN "[product]_product"."product_name" IS NULL THEN '#' ELSE "[product]_product"."product_name" END, ']') AS "[Product].[Product]", "[product]_product"."product_name" AS "[Product].[Product].[MEMBER_CAPTION]" FROM ("product" AS "[product]_product" Left JOIN "product_class" AS "[product]_product_class" ON "[product]_product"."product_class_id" = "[product]_product_class"."product_class_id" Left JOIN "product_type" AS "[product]_product_type" ON "[product]_product_class"."product_type_id" = "[product]_product_type"."product_type_id")`
//           )
//           done()
//         })
//     })
//   })

//   it('Query Sales Cube with default All level', (done) => {
//     const entityService = dataSource.createEntityService('SalesOrder')
//     entityService.selectEntityType().subscribe(() => {
//       entityService
//         .query({
//           rows: [
//             {
//               dimension: '[Product]'
//             }
//           ]
//         })
//         .subscribe((result: any) => {
//           console.log(result.error)
//           expect(result.statement).toEqual(
//             `SELECT '(All)' AS "[Product]", 'All' AS "[Product].[MEMBER_CAPTION]", SUM( "salesorder_sales_fact"."store_sales" ) AS "Sales" FROM "sales_fact" AS "salesorder_sales_fact" INNER JOIN "product" AS "[product]_product" ON "salesorder_sales_fact"."product_id" = "[product]_product"."product_id" GROUP BY 1`
//           )
//           done()
//         })
//     })
//   })

//   it('Query Dimension with Row Count', (done) => {
//     const entityService = dataSource.createEntityService('Product')
//     entityService.selectEntityType().subscribe(() => {
//       entityService
//         .query({
//           rows: [
//             {
//               dimension: '[Product]',
//               level: '[Product].[Product Type]'
//             },
//             {
//               dimension: '[Product]',
//               level: '[Product].[Product Class]'
//             },
//             {
//               dimension: '[Product]',
//               level: '[Product].[Product]'
//             }
//           ],
//           columns: [
//             {
//               dimension: C_MEASURES,
//               measure: C_MEASURES_ROW_COUNT
//             }
//           ]
//         })
//         .subscribe((result: any) => {
//           expect(result.statement).toEqual(
//             `SELECT concat('[', CASE WHEN "[product]_product_type"."product_type_id" IS NULL THEN '#' ELSE CAST("[product]_product_type"."product_type_id" AS VARCHAR) END, ']') AS "[Product].[Product Type]", "[product]_product_type"."product_type_id" AS "[Product].[Product Type].[MEMBER_CAPTION]", concat('[', CASE WHEN "[product]_product_type"."product_type_id" IS NULL THEN '#' ELSE CAST("[product]_product_type"."product_type_id" AS VARCHAR) END,'].[',CASE WHEN "[product]_product_class"."product_class_id" IS NULL THEN '#' ELSE CAST("[product]_product_class"."product_class_id" AS VARCHAR) END, ']') AS "[Product].[Product Class]", concat('C_', "[product]_product_class"."product_class_id") AS "[Product].[Product Class].[MEMBER_CAPTION]", concat('[', CASE WHEN "[product]_product_type"."product_type_id" IS NULL THEN '#' ELSE CAST("[product]_product_type"."product_type_id" AS VARCHAR) END,'].[',CASE WHEN "[product]_product_class"."product_class_id" IS NULL THEN '#' ELSE CAST("[product]_product_class"."product_class_id" AS VARCHAR) END,'].[',CASE WHEN "[product]_product"."product_name" IS NULL THEN '#' ELSE "[product]_product"."product_name" END, ']') AS "[Product].[Product]", "[product]_product"."product_name" AS "[Product].[Product].[MEMBER_CAPTION]", SUM(1) AS "Measures_Row_Count" FROM ("product" AS "[product]_product" Left JOIN "product_class" AS "[product]_product_class" ON "[product]_product"."product_class_id" = "[product]_product_class"."product_class_id" Left JOIN "product_type" AS "[product]_product_type" ON "[product]_product_class"."product_type_id" = "[product]_product_type"."product_type_id") GROUP BY "[product]_product_type"."product_type_id", "[product]_product_class"."product_class_id", "[product]_product"."product_name"`
//           )
//           done()
//         })
//     })
//   })

//   it('With Indicator', (done) => {
//     const entityService = dataSource.createEntityService('SalesOrder')
//     entityService.selectEntityType().subscribe((entityType) => {
//       // console.log(entityType)
//       entityService
//         .query({
//           rows: [
//             {
//               dimension: '[Time]',
//               level: '[Time].[Year]'
//             }
//           ],
//           columns: [
//             {
//               dimension: C_MEASURES,
//               measure: 'I1'
//             }
//           ]
//         })
//         .subscribe({
//           next: (result: any) => {
//             if (result.error) {
//               console.error(result.error)
//               done()
//             } else {
//               expect(result.statement).toEqual(
//                 `SELECT concat('[', CASE WHEN "[time]_time_by_day"."the_year" IS NULL THEN '#' ELSE CAST("[time]_time_by_day"."the_year" AS VARCHAR) END, ']') AS "[Time]", "[time]_time_by_day"."the_year" AS "[Time].[MEMBER_CAPTION]", SUM( CASE WHEN ( ( "[product]_product"."brand_name" = 'Excel' AND "[product]_product"."product_name" = 'Excel Monthly Auto Magazine' ) OR ( "[product]_product"."brand_name" = 'CDR' ) ) AND ( "[customer]_customer"."country" = 'USA' AND "[customer]_customer"."city" = 'San Francisco' ) THEN "salesorder_sales_fact"."store_sales" ELSE NULL END ) AS "I1" FROM "sales_fact" AS "salesorder_sales_fact" INNER JOIN "time_by_day" AS "[time]_time_by_day" ON "salesorder_sales_fact"."time_id" = "[time]_time_by_day"."time_id" INNER JOIN "product" AS "[product]_product" ON "salesorder_sales_fact"."product_id" = "[product]_product"."product_id" INNER JOIN "customer" AS "[customer]_customer" ON "salesorder_sales_fact"."customer_id" = "[customer]_customer"."customer_id" GROUP BY "[time]_time_by_day"."the_year" ORDER BY "[time]_time_by_day"."the_year"`
//               )
//               done()
//             }
//           },
//           error: (err) => {
//             console.error(err)
//           }
//         })
//     })
//   })
// })
