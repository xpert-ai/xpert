import { AgentType, SemanticModel, Syntax } from '@metad/ocap-core'

export const DUCKDB_TOP_SUBSCRIBED_MODEL: SemanticModel = {
  name: 'TopSubscribed',
  type: 'SQL',
  agentType: AgentType.Wasm,
  syntax: Syntax.SQL,
  dialect: 'duckdb',
  catalog: 'main',
  tables: [
    {
      name: 'top_subscribed',
      type: 'csv',
      sourceUrl: window.location.origin + '/assets/data/topSubscribed.csv',
      // batchSize: 100,
      // sourceUrl: 'https://raw.githubusercontent.com/meta-d/samples/main/kaggle/topSubscribed.csv',
      // columns: [
      //   {
      //     name: 'Rank',
      //     type: 'Integer'
      //   },
      //   {
      //     name: 'Youtube Channel',
      //     type: 'String'
      //   },
      //   {
      //     name: 'Subscribers',
      //     type: 'Numeric'
      //   },
      //   {
      //     name: 'Video Views',
      //     type: 'Numeric'
      //   },
      //   {
      //     name: 'Video Count',
      //     type: 'Numeric'
      //   },
      //   {
      //     name: 'Category',
      //     type: 'String'
      //   },
      //   {
      //     name: 'Started',
      //     type: 'Integer'
      //   }
      // ]
    }
  ],
  dbInitialization: `
ALTER TABLE top_subscribed RENAME "Video Count" TO "_Video Count_";
ALTER TABLE top_subscribed ADD COLUMN "Video Count" INTEGER;
Update top_subscribed set "Video Count" = TRY_CAST(REPLACE("_Video Count_", ',', '') AS decimal(20, 0));
`,
// ALTER TABLE top_subscribed RENAME "Subscribers" TO "_Subscribers_";
// ALTER TABLE top_subscribed ADD COLUMN "Subscribers" INTEGER;
// Update top_subscribed set "Subscribers" = TRY_CAST(REPLACE("_Subscribers_", ',', '') AS decimal(20, 0));
  schema: {
    name: 'TopSubscribed',
    cubes: [
      {
        name: 'TopSubscribed',
        caption: 'Top Subscribed Youtube Channels',
        defaultMeasure: 'Subscribers',
        visible: true,
        tables: [{ name: 'top_subscribed' }],
        dimensions: [
          {
            name: 'Channel',
            foreignKey: 'Youtube Channel',
            type: '',
            caption: 'Channel',
            hierarchies: [
              {
                name: '',
                levels: [
                  {
                    name: 'Name',
                    caption: 'Name',
                    column: 'Youtube Channel',
                    uniqueMembers: true
                  }
                ]
              },
              {
                __id__: 'VvNC1QZwqd',
                name: 'Category',
                levels: [
                  {
                    __id__: '2MBXTGBWUd',
                    name: 'Category',
                    visible: true,
                    column: 'Category',
                    semantics: null,
                    keyExpression: null,
                    nameExpression: null,
                    captionExpression: null,
                    ordinalExpression: null,
                    parentExpression: null,
                    properties: null
                  },
                  {
                    __id__: 'F0Fns7uLJd',
                    name: 'Channel',
                    visible: true,
                    column: 'Youtube Channel',
                    semantics: null,
                    keyExpression: null,
                    nameExpression: null,
                    captionExpression: null,
                    ordinalExpression: null,
                    parentExpression: null,
                    closure: null,
                    properties: null,
                    uniqueMembers: true
                  }
                ]
              }
            ]
          },
          {
            name: 'ChannelCategory',
            foreignKey: 'Youtube Channel',
            type: '',
            caption: 'Channel',
            hierarchies: [
              {
                __id__: 'VvNC1QZwqd',
                name: '',
                levels: [
                  {
                    __id__: '2MBXTGBWUd',
                    name: 'Category',
                    visible: true,
                    column: 'Category',
                    semantics: null,
                    keyExpression: null,
                    nameExpression: null,
                    captionExpression: null,
                    ordinalExpression: null,
                    parentExpression: null,
                    properties: null
                  },
                  {
                    __id__: 'F0Fns7uLJd',
                    name: 'Channel',
                    visible: true,
                    column: 'Youtube Channel',
                    semantics: null,
                    keyExpression: null,
                    nameExpression: null,
                    captionExpression: null,
                    ordinalExpression: null,
                    parentExpression: null,
                    closure: null,
                    properties: null,
                    uniqueMembers: true
                  }
                ]
              }
            ]
          },
          {
            name: 'Started',
            foreignKey: 'Started',
            caption: 'Started Year',
            hierarchies: [
              {
                name: '',
                levels: [
                  {
                    name: 'Year',
                    caption: 'Year',
                    column: 'Started',
                    uniqueMembers: true
                  }
                ]
              },
            ]
          }
        ],
        measures: [
          {
            name: 'Subscribers',
            aggregator: 'sum',
            column: 'Subscribers',
            caption: 'Subscribers',
            measureExpression: {
              sql: {
                content: `TRY_CAST(REPLACE(Subscribers, ',', '') AS decimal(20, 0))`
              }
            }
          },
          {
            name: 'Video Count',
            aggregator: 'sum',
            column: 'Video Count',
            caption: 'Video Count',
          },
          {
            name: 'Channel Count',
            aggregator: 'count',
            column: 'Youtube Channel',
            caption: 'Channel Count'
          }
        ]
      }
    ]
  }
}
