# Claude Chat Exporter

一个 Chrome 浏览器扩展，用于将 Claude (claude.ai) 的对话记录导出为 Markdown 或 Word 格式。

## 功能

- **Markdown 导出** — 生成 `.md` 文件，完整保留代码块、标题、列表、表格等格式
- **Word 导出** — 生成 `.doc` 文件，可用 Word/WPS 直接打开
- **自定义选项** — 可选包含时间戳、角色标记、消息分隔线
- **标题自动获取** — 自动从页面提取对话标题，也可手动修改
- **内容预览** — 导出前可预览提取的内容

## 安装

1. 下载或克隆本仓库
2. 打开 Chrome，访问 `chrome://extensions/`
3. 右上角开启 **开发者模式**
4. 点击 **加载已解压的扩展程序**
5. 选择本项目文件夹

## 使用

1. 在 [claude.ai](https://claude.ai) 打开一个对话
2. 点击浏览器工具栏中的扩展图标
3. 选择导出格式（Markdown 或 Word）
4. 文件将自动下载

## 文件结构

```
├── manifest.json   # Chrome 扩展清单 (Manifest V3)
├── content.js      # 内容脚本 - 提取对话内容
├── popup.html      # 弹出窗口界面
├── popup.css       # 弹出窗口样式
├── popup.js        # 导出逻辑
└── icons/          # 扩展图标
```

## License

MIT
