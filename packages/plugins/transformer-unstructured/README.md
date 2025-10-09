# Unstructured Transformer

This library was generated with [Nx](https://nx.dev).

## Building

Run `nx build transformer-unstructured` to build the library.

## Running unit tests

Run `nx test transformer-unstructured` to execute the unit tests via [Jest](https://jestjs.io).

## Unstructured API

Test API:

`curl -X POST "http://localhost:8000/general/v0/general" -F "files=@sample.pdf"`

```json
[
  {
    "element_id": "8bb18b6e23fc73a0215398c085ae422d",
    "coordinates": [
      [27.549776077270508, 70.30609130859375],
      [502.4502258300781, 70.30609130859375],
      [502.4502258300781, 100.4868392944336],
      [27.549776077270508, 100.4868392944336]
    ],
    "text": "XpertAI2025年产品路线图（Roadmap）",
    "type": "Title",
    "metadata": { "filename": "sample.pdf", "page_number": 1 }
  },
  {
    "element_id": "7852fae1634119206d7a169dfdf39628",
    "coordinates": [
      [25.56244468688965, 410.17584228515625],
      [279.8625183105469, 410.17584228515625],
      [279.8625183105469, 426.8404541015625],
      [25.56244468688965, 426.8404541015625]
    ],
    "text": "在2025年底之前，我们计划推出以下核⼼功能：",
    "type": "NarrativeText",
    "metadata": { "filename": "sample.pdf", "page_number": 1 }
  },
  ...
]
```
