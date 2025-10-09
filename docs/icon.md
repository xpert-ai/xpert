# Icon 设计规范

如果你希望在 **JSON 中定义一个统一的数据结构** 来描述前端可使用的不同类型的 icon（例如图片、SVG、字体图标、emoji 等），可以定义一个 **可扩展的“IconSchema”结构**。

下面是一个设计示例 👇

---

### ✅ 通用 JSON 结构定义

```json
{
  "icon": {
    "type": "image", // 或 "svg" | "font" | "emoji" | "lottie"
    "value": "data:image/png;base64,iVBORw0...", // 各类型对应内容
    "color": "#000000", // 可选，用于 font/svg/emoji 等
    "size": 24, // 可选，用于前端渲染尺寸
    "alt": "User avatar", // 可选，辅助信息
    "style": {
      "borderRadius": "50%",
      "backgroundColor": "#f0f0f0"
    } // 可选，自定义样式
  }
}
```

---

### 🧩 支持的类型说明

| type       | 描述               | value 字段内容示例                                                     |
| ---------- | ---------------- | ---------------------------------------------------------------- |
| `"image"`  | 图片（URL 或 base64） | `"https://example.com/icon.png"` 或 `"data:image/png;base64,..."` |
| `"svg"`    | 内联 SVG 内容        | `"<svg xmlns='...'>...</svg>"`                                   |
| `"font"`   | 图标字体             | `"fa-solid fa-user"` 或 `"material-icons:home"`                   |
| `"emoji"`  | Emoji 符号         | `"😊"`                                                           |
| `"lottie"` | Lottie 动画资源      | `"https://example.com/animation.json"`                           |

---

### 💡 示例们

#### 1️⃣ 图片图标

```json
{
  "icon": {
    "type": "image",
    "value": "https://cdn.example.com/logo.png",
    "alt": "Company logo"
  }
}
```

#### 2️⃣ SVG 图标

```json
{
  "icon": {
    "type": "svg",
    "value": "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='M12 2l4 20H8z'/></svg>"
  }
}
```

#### 3️⃣ 字体图标

```json
{
  "icon": {
    "type": "font",
    "value": "fa-solid fa-user",
    "color": "#666",
    "size": 20
  }
}
```

#### 4️⃣ Emoji 图标

```json
{
  "icon": {
    "type": "emoji",
    "value": "🚀",
    "size": 32
  }
}
```

#### 5️⃣ Lottie 动画

```json
{
  "icon": {
    "type": "lottie",
    "value": "https://assets.lottiefiles.com/packages/lf20_abc123.json"
  }
}
```

---

### 🧠 可选的 TypeScript 定义

```ts
type IconType = 'image' | 'svg' | 'font' | 'emoji' | 'lottie'

interface IconDefinition {
  type: IconType
  value: string
  color?: string
  size?: number
  alt?: string
  style?: Record<string, string>
}
```
