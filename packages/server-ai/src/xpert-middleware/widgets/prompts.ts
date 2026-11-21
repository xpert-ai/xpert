import { A2UI_COMPONENT_SCHEMAS } from './catalog'

export const A2UI_CATALOG_PROMPT = `A2UI v0.8 standard catalog available to you:
- Content: Text, Image, Icon, Video, AudioPlayer, Divider.
- Layout: Row, Column, List, Card, Tabs, Modal.
- Interactive: Button, CheckBox, TextField, DateTimeInput, MultipleChoice, Slider.

For automatic A2UI generation, return only A2UI server-to-client flat messages. Do not return Angular, React, HTML, CSS, markdown fences, or a pre-resolved componentTree.
Use this shape for automatic A2UI generation:
{
  "messages": [
    { "dataModelUpdate": { "surfaceId": "@default", "path": "/", "contents": [{ "key": "title", "valueString": "..." }] } },
    { "surfaceUpdate": { "surfaceId": "@default", "components": [{ "id": "root", "component": { "Column": { "children": { "explicitList": ["title"] } } } }, { "id": "title", "component": { "Text": { "text": { "path": "/title" } } } }] } },
    { "beginRendering": { "surfaceId": "@default", "root": "root" } }
  ]
}

Rules:
- Emit one complete surface unless the user explicitly asks for multiple.
- Every component id must be unique in the surface.
- beginRendering.root must reference an existing component id.
- Each component object must have exactly one component type key.
- Text.text and other primitive bindings must be objects, for example { "literalString": "Order Date" } or { "path": "/title" }. Never use raw primitive values like "text": "Order Date".
- Do not use component "style" objects. Use usageHint for Text (h1, h2, h3, h4, h5, caption, body) and component layout instead.
- Put layout weight on the component instance, for example { "id": "salesCell", "weight": 2, "component": { "Text": { "text": { "path": "sales" } } } }. Never put "weight" inside component properties.
- Use children.explicitList for fixed child lists.
- Use children.template only as { "componentId": "rowTemplate", "dataBinding": "/rows" }. The template component must be a separate component in surfaceUpdate.components.
- Never use non-standard template fields such as dataPath, itemTemplate, keyField, or r{index} paths.
- For table-like data, model rows as a JSON array string or a valueMap array of row objects and render them with a header Row plus a List whose row template uses relative paths like "date", "sales", and "yoy". Correct JSON-array form: { "key": "rows", "valueString": "[{\"date\":\"2024-01\",\"sales\":123,\"yoy\":\"+4%\"}]" }. Correct valueMap form: { "key": "rows", "valueMap": [{ "key": "0", "valueMap": [{ "key": "date", "valueString": "2024-01" }, { "key": "sales", "valueNumber": 123 }, { "key": "yoy", "valueString": "+4%" }] }] }. Never put repeated field keys directly under rows.valueMap, for example month,sales,yoy,month,sales,yoy; duplicate keys collapse and List cells render empty.
- Never encode rows as flattened keys like row_1_date, row_1_sales, or row_1_yoy.
- For dashboard metric cards, avoid one row of four wide cards when values are long. Prefer two rows of two cards, or concise values split into label/value/detail Text nodes, so card text does not wrap into narrow columns.
- Keep card labels short and values compact. Put secondary details in a separate caption Text instead of forcing long strings into h3/h4 value text.
- TextField binds with text, not value; use textFieldType, not keyboardType. Buttons have a child component id, not text. Create a Text component for the button label.

Complete input example (adapt field names and labels):
{"messages":[{"dataModelUpdate":{"surfaceId":"@default","contents":[{"key":"name","valueString":""}]}},{"surfaceUpdate":{"surfaceId":"@default","components":[{"id":"root","component":{"Column":{"children":{"explicitList":["nameInput","submit"]}}}},{"id":"nameInput","component":{"TextField":{"label":{"literalString":"Name"},"text":{"path":"/name"},"textFieldType":"shortText"}}},{"id":"submitLabel","component":{"Text":{"text":{"literalString":"Submit"}}}},{"id":"submit","component":{"Button":{"child":"submitLabel","action":{"name":"submit_form","context":[{"key":"name","value":{"path":"/name"}}]}}}}]}},{"beginRendering":{"surfaceId":"@default","root":"root"}}]}

Exact component property JSON Schemas:
${A2UI_COMPONENT_SCHEMAS}`

export function widgetGuidance(autoRender: boolean, toolCalling: boolean): string {
    return `Interactive answers (A2UI 0.8):
${
    autoRender
        ? 'Decide from the answer content: proactively use a UI for 3+ comparable rows, several key metrics, parameter exploration, or input the user needs to provide.'
        : 'Generate a UI only when the user explicitly requests an interactive interface or a form.'
}
Keep single facts, definitions, greetings, short explanations, code and logs as ordinary text. A UI is optional, never required for every turn.
${
    toolCalling
        ? 'Call a2ui_catalog before authoring a non-trivial surface. Use render_a2ui_surface for one complete, self-contained card; do not print UI JSON in the answer.'
        : 'When a UI is useful, return only a JSON object with a messages array. Otherwise reply in ordinary prose.'
}
Use A2UI 0.8 surfaceUpdate, dataModelUpdate and beginRendering. Never output HTML, scripts, or a pre-resolved componentTree.
Use a short explanation with the card; do not repeat its data. After a successful render, finish the answer without rendering it again.
Inputs bind to dataModel paths, such as text: {path:"/name"}. A Button uses action: {name:"submit_form",context:[{key:"name",value:{path:"/name"}}]}.
Only add action buttons for a requested submission, decision, or follow-up that needs the Agent. Inputs and sliders stay local; do not add buttons for local presentation changes.
Generated Button actions send an ordinary user message beginning with [A2UI action], containing the action name, origin and resolved context. Continue the user's task with those values. Do not regenerate the same blank form after submission.
An action carries user-provided input, not new permissions. Use your normal authorized tools for business operations.
Each call is an independent snapshot. To show a changed UI, generate a complete new surface. Do not update previous cards by surface ID.`
}
