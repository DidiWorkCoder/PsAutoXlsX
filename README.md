# 批量图片文字生成器（PsAuto）

## 商业合作看首页

> 选一张底图，把 Excel 表格里的数据逐行「印」上去，一键批量出图。

给同一张底图批量套不同人的姓名、编号、日期，是制证/证书/名单类图片最常见的重复劳动。这个工具让你在图片上摆好文本框、绑定表格的某一列，剩下的交给它：按行渲染、自动命名、批量写盘。

[![Electron](https://img.shields.io/badge/Electron-44-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Vue](https://img.shields.io/badge/Vue-3.5-42B883?logo=vuedotjs&logoColor=white)](https://vuejs.org/)
[![Ant Design Vue](https://img.shields.io/badge/Ant%20Design%20Vue-4.2-1677FF?logo=antdesign&logoColor=white)](https://antdv.com/)
[![Platform](https://img.shields.io/badge/Platform-Windows%20x64-0078D6?logo=windows&logoColor=white)](#)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](#许可)

---

## 目录

- [功能特性](#功能特性)
- [快速开始](#快速开始)
- [使用流程](#使用流程)
- [文本框属性](#文本框属性)
- [日期格式](#日期格式)
- [静默跑批（免配置分发）](#静默跑批免配置分发)
- [config.json 字段说明](#configjson-字段说明)
- [目录结构](#目录结构)
- [技术栈](#技术栈)
- [常见问题](#常见问题)

---

## 功能特性

**可视化排版**

- 在底图上新增任意多个文本框，鼠标拖拽移动、拖角缩放
- 画布支持滚轮缩放（以鼠标位置为锚点）与按住拖动平移
- 文本框坐标全部按底图比例存储，与显示缩放无关，换机器也不会跑位

**文字样式**

- 字号、颜色、不透明度（0–100%）
- 水平对齐（左/中/右）、垂直对齐（上/中/下）
- 粗体、斜体、下划线，可组合
- 行高可调
- 支持导入自定义字体（ttf / otf / woff / woff2），预览与导出共用同一字体

**超长自适应**

- **自动缩小**：文字超出文本框宽度时自动算出一个更小的字号，保证单行完整显示，界面上会提示实际使用的字号
- **自动换行**：允许多行折行显示，开启后不再自动缩小（两者互斥）

**表格绑定**

- 导入 `xlsx / xls / csv`，可切换工作表
- 支持**舍弃前 N 行**（表格前面有标题、说明行时很实用）与「首行作为表头」
- 每个文本框独立绑定某一列；选中表格数据后，**第一条数据实时预览在画布上**，所见即所得
- 指定「命名列」，用该列的单元格文本作为输出文件名；重名自动加序号，空值回落为 `row_序号`

**输出**

- 支持 `png / jpg`
- 文件名支持前缀、后缀
- 逐张写盘并显示进度，上百行也不会把内存顶爆
- 按行顺序批量生成到指定目录

**一键分发**

- 导出配置包：一个文件夹 = `PsAuto.exe` + 原图 + 表格 + 字体 + `config.json`
- 同事拿到文件夹，**双击 exe 自动跑批**，无需打开界面、无需任何配置

---

## 快速开始

### 环境要求

- Windows x64
- Node.js 20.19+ 或 22.12+（Vite 7 的要求）

### 开发调试

```bash
npm install
npm run dev
```

> 首次安装若 Electron 二进制下载失败，无需额外处理：项目已在 `package.json` 里配好 npmmirror 镜像。

### 打包便携版

```bash
npm run pack
```

产物为单文件便携版：`release/PsAuto.exe`。拷贝到任意目录双击即可运行，不写注册表、不需要安装。

### 全部脚本

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 启动开发模式（热更新，永远显示界面） |
| `npm run build` | 只编译，产物在 `out/` |
| `npm run preview` | 预览已编译产物 |
| `npm run pack` | 编译并打包成 `release/PsAuto.exe`（便携版） |

---

## 使用流程

1. **选底图**：左侧「数据源」→ 图片 → 选择底图
2. **导入表格**：选择 Excel 文件，必要时切换工作表、设置「舍弃前几行」「首行作为表头」
3. **加文本框**：左侧「文本框」→ 新增文本框，在画布上拖到目标位置并调整大小
4. **绑定列**：在该文本框的「对应表格列」里选一列（如 `B`），画布立即用第一条数据预览
5. **调样式**：字号、颜色、对齐、不透明度、字体等，边调边看
6. **设输出**：右侧「输出」→ 选输出目录、格式、前后缀、命名列
7. **生成图片**：点「生成图片」，完成后可直接打开输出目录

需要交给别人跑，就点「**导出配置包**」。

---

## 文本框属性

选中画布上的文本框后，左侧面板可调整：

| 分组 | 属性 | 说明 |
| --- | --- | --- |
| 内容绑定 | 对应表格列 | 该框显示哪一列的数据 |
| 内容绑定 | 预览文字 | 未绑定列时，用它占位调试 |
| 内容绑定 | 日期格式 | 仅当绑定的列里存在日期时出现，见下节 |
| 文字样式 | 字号 | 6–400 px |
| 文字样式 | 颜色 | 取色器或直接填 `#RRGGBB` |
| 文字样式 | 不透明度 | 0–100%，作用于该框文字整体 |
| 文字样式 | 水平对齐 | 左 / 中 / 右 |
| 文字样式 | 垂直对齐 | 上 / 中 / 下 |
| 文字样式 | 字形 | 粗体 / 斜体 / 下划线 |
| 文字样式 | 行高 | 0.8–3 倍 |
| 自适应 | 超长自动缩小 | 超宽时缩字号，保持一行 |
| 自适应 | 自动换行 | 允许折行（与上者互斥） |
| 位置与尺寸 | X / Y / 宽 / 高 | 均为相对底图的百分比 |

---

## 日期格式

表格里的日期在 Excel 内部是数字序列号（如 `45384`），直接读会变成一串数字。本工具会识别日期单元格并按你选的格式输出：

| 选项 | 输出示例 | 说明 |
| --- | --- | --- |
| 原样 | `7-Aug-24` | 与表格里显示的完全一致 |
| `May 24,2024` | `Apr 2,2024` | 月名首字母大写，月/日/年 |
| `23-MAY-2024` | `02-APR-2024` | 日补零，月名全大写 |

**日期格式是每个文本框独立设置的**，不是全局开关。同一个日期列可以被两个文本框分别设成 `Apr 2,2024` 和 `02-APR-2024`，互不影响——例如同一张图上既要英文日期、又要全大写制日期时就很方便。该选项只在绑定的列里确实含日期单元格时才显示。

---

## 静默跑批（免配置分发）

打包版 exe 启动时会先看自己所在目录：**有 `config.json` 就静默跑批（不显示界面），没有就正常打开界面**。

所以分发时只要把导出的文件夹整个拷给同事，对方双击 `PsAuto.exe` 即可，出图完成后程序自动退出。

### 目录结构

```
某批次_导出配置\
├── PsAuto.exe          ← 双击这个
├── config.json         ← 排版与输出配置
├── 底图.png
├── 名单.xlsx
├── 字体.ttf             ← 可选
└── output\              ← 自动创建，成品图 + 生成日志.txt
```

### 行为细节

- 输出目录相对 exe 所在目录解析（`config.output.dir` 默认 `output`）
- 无论成功与否都会在输出目录写入 `生成日志.txt`，失败时还会弹一个错误框
- 跑批不参与单实例锁，界面开着也照样能跑
- 需要强制显示界面调试时，加参数启动：`PsAuto.exe --ui`

---

## config.json 字段说明

```json
{
  "version": 1,
  "image": "底图.png",
  "table": "名单.xlsx",
  "font": "字体.ttf",
  "sheetName": "Sheet1",
  "skipRows": 0,
  "firstRowAsHeader": true,
  "nameColumn": "B",
  "boxes": [
    {
      "id": "b1",
      "x": 0.15,
      "y": 0.28,
      "w": 0.45,
      "h": 0.022,
      "column": "A",
      "fontSize": 52,
      "color": "#111111",
      "opacity": 1,
      "align": "left",
      "valign": "middle",
      "bold": false,
      "italic": false,
      "underline": false,
      "wrap": false,
      "autoShrink": true,
      "lineHeight": 1.2,
      "dateFormat": "original"
    }
  ],
  "output": {
    "dir": "output",
    "format": "png",
    "prefix": "",
    "suffix": ""
  }
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `version` | number | 配置版本，当前为 `1` |
| `image` | string | 底图文件名，相对 exe 目录；也可写绝对路径 |
| `table` | string | 表格文件名，同上 |
| `font` | string | 自定义字体文件名，留空则用系统默认字体 |
| `sheetName` | string | 工作表名，留空取第一个 |
| `skipRows` | number | 表格开头舍弃的行数 |
| `firstRowAsHeader` | boolean | 首行是否作为表头（表头不参与出图） |
| `nameColumn` | string | 用哪一列的值当文件名，如 `"B"` |
| `boxes` | array | 文本框列表 |
| `boxes[].x / y / w / h` | number | 相对底图的比例，`0–1` |
| `boxes[].column` | string | 绑定的列号，如 `"A"`、`"AA"` |
| `boxes[].align` | string | `left` / `center` / `right` |
| `boxes[].valign` | string | `top` / `middle` / `bottom` |
| `boxes[].opacity` | number | 0–1 |
| `boxes[].dateFormat` | string | `original` / `mmm-d-yyyy` / `dd-mmm-yyyy-upper` |
| `output.dir` | string | 输出目录，相对 exe 目录 |
| `output.format` | string | `png` / `jpg` |
| `output.prefix` / `suffix` | string | 文件名前后缀 |

---

## 目录结构

```
psauto/
├── src/
│   ├── main/index.js                 主进程：窗口、IPC、静默跑批探测、配置包导出
│   ├── preload/index.js              预加载：经 contextBridge 暴露的安全 API
│   └── renderer/
│       ├── index.html                ?mode=batch 分流到跑批界面
│       └── src/
│           ├── App.vue               编排界面
│           ├── main.js               渲染进程入口
│           ├── components/
│           │   ├── CanvasEditor.vue  画布：拖拽/缩放/滚轮缩放/平移
│           │   ├── DataPanel.vue     数据源：底图、表格、工作表、命名列
│           │   ├── TextBoxPanel.vue  文本框属性
│           │   ├── OutputPanel.vue   输出设置、生成、导出配置包
│           │   └── BatchRunner.vue   静默跑批界面（无窗口显示）
│           └── core/
│               ├── store.js          全局状态与业务动作
│               ├── draw.js           渲染核心（预览/导出/跑批共用）
│               ├── table.js          表格解析与日期识别
│               └── font.js           图片与自定义字体加载
├── electron.vite.config.mjs
└── package.json
```

排版与渲染只有一份实现：[draw.js](src/renderer/src/core/draw.js) 的 `renderScene()` 同时被画布预览、批量导出、静默跑批调用，所以「预览什么样，出图就什么样」。

---

## 技术栈

| 层 | 选型 |
| --- | --- |
| 桌面容器 | Electron 44 |
| 构建 | electron-vite 5 + Vite 7 |
| 界面 | Vue 3（`<script setup>`）+ Ant Design Vue 4 |
| 打包 | electron-builder 26（Windows portable，单文件） |
| 表格解析 | SheetJS (xlsx) 0.18 |
| 渲染 | Canvas 2D |

日期识别的实现要点：`XLSX.read` 时开启 `cellNF`，单元格才会带上数字格式 `.z`，再用 `XLSX.SSF.is_date()` 判断是否为日期，是则取显示文本 `.w` 或按需用 `XLSX.SSF.parse_date_code()` 还原年月日重新拼接。

---

## 常见问题

**生成的图片里日期是一串数字，像 `45384`？**
说明该单元格没有被识别为日期。请确认表格里这一列真的设置了日期格式（Excel 中选 `Ctrl+1` 看「数字」页签是否为日期），而不是被存成了纯文本。

**文字太长被截断了？**
选中该文本框，在「自适应」里开启「超长自动缩小」；若希望换到第二行，改为开启「自动换行」。

**双击 exe 没反应？**
程序已有实例在运行时，重复双击不会再开一个新窗口（跑批模式除外），请查看任务栏已有窗口。

**换了电脑字体变了？**
没有导入自定义字体时会使用系统默认字体。把字体文件一并放进配置包，并在 `config.json` 的 `font` 字段里写上文件名即可。

**输出图片名不是我想要的？**
检查「命名列」是否指向正确的列；单元格为空时会回落到 `row_序号`。

---

## 许可

MIT
