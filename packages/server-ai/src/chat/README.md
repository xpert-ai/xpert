# Chat

`ChatMessageTypeEnum` 定义了所有的消息类型，主要分为以下几类：
- `ChatMessageTypeEnum.MESSAGE`：消息，需要持久化在对话消息列表中的消息。
- `ChatMessageTypeEnum.EVENT`：事件，临时事件消息，不需要持久化在对话消息列表中。

## Step message

每个步骤消息的类型定义为 `TChatMessageStep`。

- 第一级分类是 `type` 类型为 `ChatMessageStepType`： 是对消息隶属于哪种 Canvas 类型，包括 `ComputerUse` `File` 和 `Notice`。
- 第二级分类是 `category` 类型为 `ChatMessageStepCategory`： 是觉得消息以何种组件的形式展示，大概有 `WebSearch` `Files` `Program` 和 `Memory` 等类型。

剩下的就是消息的详细信息，如：
- toolset 工具集名称
- tool 工具名称
- title 标题
- message 消息
- created_date 创建日期
- data 具体消息的数据，格式跟随工具类型。

工具内发出的消息要对应这些分类，这些分类最终对应到前端展示的组件，如果有未能满足的类型则需要添加。


### How to add step messages ?

如果需要在工具执行内发出执行步骤消息，可以通过 `dispatchCustomEvent` 来发出步骤消息事件。此事件会被截获保存到消息里，同时实时传递到前端展示。

在工具中发出自定义事件如下代码：

```javascript
// Tool message event
dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
    type: ChatMessageStepType.ComputerUse,
    toolset: 'planning',
    tool: 'create_plan',
    title: `Creating tasks`, // Short title
    message: _.tasks.map((_) => _.name).join('\n\n'), // Details message
    data: {
        title: 'Tasks',
        steps: _.tasks.map((_) => ({..._, content: _.name,}))
    }
}).catch((err) => {
    console.error(err)
})
```

## Component message

组件消息，需要在 AI 消息中展示为复杂组件的消息类型，可以表达结构化的信息。

组件消息的类型定义为 `TMessageContentComponent`， 具体的组件定义为 `TMessageComponent` 其

- 一级分类为 `category`: 'Dashboard' | 'Computer' | 'Tool'
- 二级分类为 `type`: string

目前组件消息是通过 `configurable` 中的 `subscriber` 发出去的。首先需要在工具中通过 `config` 参数获得 `configurable` 然后拿到 `subscriber` 对象，
调用 `next` 方法发出具体消息。

```typescript
async function tool(_, config) => {
	const { configurable } = config ?? {}
	const { subscriber } = configurable ?? {}

    subscriber?.next({
        data: {
            type: ChatMessageTypeEnum.MESSAGE,
            data: {
                id: shortuuid(),
                type: 'component',
                data: {
                    category: 'Computer',
                    type: 'iframe',
                    url: indexFile
                } as TMessageComponent<TMessageComponentIframe>
            }
        }
    } as MessageEvent)
}
```

## Event message

当消息类型为 **Event** 时，需要设置 event 类型为 `ChatMessageEventTypeEnum`，并且需要设置代表具体数据的 `data` 字段。

```typescript
subscriber.next({
    data: {
        type: ChatMessageTypeEnum.EVENT,
        event: ChatMessageEventTypeEnum.ON_TOOL_START,
        data: {
            data,
            agentKey: rest.metadata.agentKey
        }
    }
} as MessageEvent)
```
