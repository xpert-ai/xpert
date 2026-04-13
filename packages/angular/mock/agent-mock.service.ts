import { Injectable } from '@angular/core'
import { Agent, AgentStatusEnum, AgentType, Cube, DataSourceOptions } from '@xpert-ai/ocap-core'
import { randCompanyName, randFloat, randNumber, randProductAdjective, randProductCategory } from '@ngneat/falso'
import { Observable, Subject, of } from 'rxjs'

const columns = [
  {
    name: 'OrderId',
    label: '订单号',
    type: 'string'
  },
  {
    name: 'product',
    label: '产品',
    type: 'string'
  },
  {
    name: 'productCategory',
    label: '产品类别',
    type: 'string'
  },
  {
    name: 'Department',
    label: '部门',
    type: 'string'
  },
  {
    name: 'sales',
    label: '销售额',
    type: 'number'
  },
  {
    name: 'quantity',
    label: '销售量',
    type: 'number'
  }
]

const SalesOrder = {
  name: 'SalesOrder',
  label: '销售订单',
  columns
}

const SalesOrder10s = {
  name: 'SalesOrder10s',
  label: '销售订单10秒',
  columns
}

const SalesOrder3s = {
  name: 'SalesOrder3s',
  label: '销售订单3秒',
  columns
}

export const CUBE_SALES_ORDER_NAME = 'SalesOrder'

export const CUBE_SALES_ORDER: Cube = {
  name: CUBE_SALES_ORDER_NAME,
  caption: '销售订单',
  visible: true,
  tables: [{ name: 'sales_order' }],
  dimensions: [
    {
      name: 'Product',
      caption: '产品',
      hierarchies: [
        {
          name: '',
          caption: '产品',
          levels: [
            {
              name: 'Product',
              column: 'product',
              captionColumn: 'ProductName'
            }
          ]
        }
      ]
    },
    {
      name: 'Department',
      caption: '部门',
      hierarchies: [
        {
          name: '',
          levels: [
            {
              name: 'Department',
              column: 'department',
              captionColumn: 'DepartmentName'
            }
          ]
        }
      ]
    }
  ],
  measures: [
    {
      name: 'Sales',
      column: 'sales',
      caption: '销售额'
    },
    {
      name: 'Cost',
      column: 'cost',
      caption: '成本'
    }
  ]
}

@Injectable()
export class MockAgent implements Agent {
  type = AgentType.Browser

  private error$ = new Subject()
  selectStatus(): Observable<AgentStatusEnum> {
    return of(AgentStatusEnum.ONLINE)
  }

  selectError(): Observable<any> {
    return this.error$
  }

  error(err: any): void {
    this.error$.next(err)
  }

  request(dataSource: DataSourceOptions, options: any): Promise<any> {
    // console.log(`~~~~~~~~~~~~~~~~~~~~`, dataSource, options)

    return new Promise((resolve, reject) => {
      if (options.method === 'get') {
        if (options.url === 'schema') {
          switch (options.table) {
            case SalesOrder10s.name:
              return resolve([
                {
                  schema: 'default',
                  tables: [SalesOrder10s]
                }
              ])
            case SalesOrder3s.name:
              return resolve([
                {
                  schema: 'default',
                  tables: [SalesOrder3s]
                }
              ])
            case SalesOrder.name:
              return resolve([
                {
                  schema: 'default',
                  tables: [SalesOrder]
                }
              ])
            case 'Empty':
              return resolve([
                {
                  schema: 'default',
                  tables: [
                    {
                      name: 'Empty',
                      columns: []
                    }
                  ]
                }
              ])
            default: {
              if (options.statement === 'SELECT * FROM "SalesOrder"') {
                return resolve([
                  {
                    schema: 'default',
                    tables: [SalesOrder]
                  }
                ])
              }

              return resolve([
                {
                  schema: 'default',
                  tables: [
                    {
                      name: 'Inventory',
                      label: '库存',
                      columns: [
                        {
                          name: 'product',
                          label: '产品',
                          type: 'string'
                        },
                        {
                          name: 'productCategory',
                          label: '产品类别',
                          type: 'string'
                        },
                        {
                          name: 'sales',
                          label: '销售额',
                          type: 'number'
                        },
                        {
                          name: 'quantity',
                          label: '销售量',
                          type: 'number'
                        }
                      ]
                    }
                  ]
                }
              ])
            }
          }
        }
      } else if (options.method === 'post') {
        if (options.url === 'query') {
          // console.log(options.body?.statement)
          const results = []

          if (options.body?.statement?.includes('AS `memberKey`')) {
            const data = []
            randProductAdjective({ length: 3 }).forEach((product) => {
              data.push({ memberKey: product, memberCaption: product }),
                randProductAdjective({ length: 3 })
                  .filter((product2) => !data.find((item) => item.memberKey === product2))
                  .forEach((product2) => {
                    data.push({
                      memberKey: product2,
                      memberCaption: product2,
                      parentKey: product
                    })
                    randProductAdjective({ length: 5 })
                      .filter((product) => !data.find((item) => item.memberKey === product))
                      .forEach((product3) => {
                        data.push({
                          memberKey: product3,
                          memberCaption: product3,
                          parentKey: product2
                        })
                      })
                  })
            })
            return resolve({
              data,
              columns: [
                {
                  name: 'memberKey',
                  label: '成员 Key',
                  type: 'string'
                },
                {
                  name: 'parentKey',
                  label: '父级 Key',
                  type: 'string'
                }
              ]
            })
          }

          if (options.body?.statement?.includes(`"Department" AS "Department"`)) {
            let departmentCode = 0

            randCompanyName({ length: 5 }).forEach((name) => {
              departmentCode++
              const department1 = departmentCode
              results.push({
                Department: department1,
                DepartmentName: name,
                quantity: randFloat()
              })
              randCompanyName({ length: 5 }).forEach((name) => {
                departmentCode++
                const department2 = departmentCode
                results.push({
                  Department: department2,
                  DepartmentName: name,
                  DepartmentParent: department1,
                  quantity: randFloat()
                })

                randCompanyName({ length: 3 }).forEach((name) => {
                  departmentCode++
                  const department3 = departmentCode
                  results.push({
                    Department: department3,
                    DepartmentName: name,
                    DepartmentParent: department2,
                    quantity: randFloat()
                  })
                })
              })
            })

            return resolve({
              data: results,
              columns: [
                {
                  name: 'Department',
                  label: '部门',
                  type: 'string'
                },
                {
                  name: 'DepartmentName',
                  label: '部门',
                  type: 'string'
                },
                {
                  name: 'DepartmentParent',
                  label: '上级部门',
                  type: 'string'
                }
              ]
            })
          }

          randProductCategory({ length: 3 }).forEach((productCategory) => {
            const DepartmentParent = randCompanyName()
            randProductAdjective({ length: 5 }).forEach((product) => {
              results.push({
                OrderId: randNumber(),
                '[Product]': randNumber(),
                '[Product].[MEMBER_CAPTION]': product,
                productCategory,
                Department: randCompanyName(),
                DepartmentParent,
                Sales: randFloat(),
                quantity: randFloat()
              })
            })
          })

          if (options.body?.statement?.includes(SalesOrder10s.name)) {
            setTimeout(() => {
              resolve({
                data: results,
                columns
              })
            }, 10000)

            return
          }

          if (options.body?.statement?.includes(SalesOrder3s.name)) {
            setTimeout(() => {
              resolve({
                data: results,
                columns
              })
            }, 3000)

            return
          }

          if (options.body?.statement?.includes('empty_')) {
            return resolve({
              data: [],
              columns: []
            })
          }

          setTimeout(() => {
            resolve({
              data: results,
              columns: [
                {
                  name: 'OrderId',
                  label: '订单号',
                  type: 'string'
                },
                {
                  name: '[Product]',
                  label: '产品',
                  type: 'string'
                },
                {
                  name: 'productCategory',
                  label: '产品类别',
                  type: 'string'
                },
                {
                  name: '[Department]',
                  label: '部门',
                  type: 'string'
                },
                {
                  name: '[DepartmentParent]',
                  label: '上级部门',
                  type: 'string'
                }
              ]
            })
          }, 1000)

          return
        }
      }

      resolve({})
    })
  }
}
