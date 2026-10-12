# Dialog 视觉试点预览

在仓库根目录运行：

```sh
node tools/dialog-preview/build.mjs
python3 -m http.server 4317 --bind 127.0.0.1 --directory .cache/dialog-preview
```

打开 http://127.0.0.1:4317，可查看初始化向导、插件注册、项目成员、技能上传和删除确认。

构建时直接读取这 5 个生产模板，并编译共享 UI 组件及实际主题、Overlay 样式，并注册与 Cloud 相同的 Zard 键盘事件插件。状态来自本地 fixture，不连接业务 API，不执行上传、邀请、删除或初始化。可切换中英文、深浅色和处理中状态；Escape 返回场景列表。

模板或样式更新后，重新构建并刷新页面。生成文件与截图位于忽略目录 `.cache/dialog-preview/`。此预览用于视觉检查，不能替代真实平台的权限、服务和提交行为验收。
