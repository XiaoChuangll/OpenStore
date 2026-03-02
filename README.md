<div align="center">

# OpenStore
**OpenStore** 是一个专注于鸿蒙（HarmonyOS）应用发现与分享的第三方应用商店平台
</div>

<p align="center">
  <img 
    src="/public/favicon.svg" 
    alt="Project Favicon" 
    width="96" 
    height="96" >
  <br><br>
</p>

## ✨ 主要功能

- **应用探索** (`/apps`): 浏览海量鸿蒙应用，支持按分类筛选（如影音娱乐、社交通讯、实用工具等）。
- **今日上新** (`/updates`): 实时追踪应用更新动态，获取最新的应用版本和上架信息。
- **精选专题** (`/topics`): 探索由社区或编辑精选的应用专题集合，发现优质应用。
- **榜单排行** (`/rank`):
  - **总榜**: 最受欢迎的应用排行。
  - **增长榜**: 近期增长最快的潜力应用。
  - **历史榜**: 回顾应用的历史表现。
  - **非华为榜**: 探索非华为设备上的热门应用生态。
- **应用详情**: 深度展示应用信息，包括版本历史、评分评论、下载量趋势、新版本特性等。
- **应用投稿** (`/submit`): 用户可以提交新的应用或专题，支持自动解析应用元数据（如包名、图标、版本信息）。
- **后台管理**: 管理员专用的后台系统，用于审核应用、管理用户和配置系统参数。

## 🛠️ 技术栈

本项目采用现代化的前端技术栈构建，确保高性能和良好的用户体验。

### 前端 (Frontend)
- **核心框架**: [Vue 3](https://vuejs.org/) (Composition API)
- **构建工具**: [Vite](https://vitejs.dev/)
- **开发语言**: [TypeScript](https://www.typescriptlang.org/)
- **UI 组件库**: [Element Plus](https://element-plus.org/)
- **状态管理**: [Pinia](https://pinia.vuejs.org/)
- **路由管理**: [Vue Router](https://router.vuejs.org/)
- **数据可视化**: [ECharts](https://echarts.apache.org/)
- **工具库**: Axios (网络请求), VueUse (组合式工具集), Markdown-it (Markdown 渲染)

### 后端 (Backend / Server)
- **运行时**: Node.js
- **Web 框架**: [Express](https://expressjs.com/)
- **数据库**: SQLite (轻量级本地数据库)
- **认证**: JWT (JSON Web Tokens)

## 🚀 快速开始
## 🚢 部署指南（宝塔面板）

为了方便生产环境部署和运维，以下是基于宝塔面板的完整部署方案，包含环境配置、项目部署、WAF 防火墙配置、网站监控报表等核心环节。

---

### 1. 环境准备（宝塔面板）

#### 1.1 基础环境安装

登录宝塔面板后，在「软件商店」安装以下核心组件：

| 组件 | 版本要求 | 用途说明 |
|------|----------|----------|
| **Node.js 版本管理器** | 16.20.0 或 18.x | 安装后选择对应版本，用于运行后端服务 |
| **PM2 管理器** | 最新版 | 守护 Node.js 进程，实现服务异常自动重启 |
| **Nginx** | 1.22+ | 作为反向代理服务器，处理 HTTP 请求并转发至 Node 服务 |
| **SQLite 可视化工具** | 可选 | 方便可视化管理 SQLite 数据库文件 |
| **宝塔 WAF** | 免费版/付费版 | 网站安全防护（SQL注入、XSS、CC攻击等） |
| **网站监控报表** | 最新版 | 追踪站点访问、性能和异常 |

#### 1.2 环境验证

在宝塔面板「终端」执行以下命令，验证环境是否符合要求：

```bash
# 检查 Node.js 版本（需 ≥16.0.0）
node -v  

# 检查 npm 版本（需 ≥8.0.0）
npm -v   

# 检查 PM2 是否安装成功
pm2 -v   

# 检查 Nginx 版本
nginx -v
```
### 2. 项目部署步骤

#### 2.1 上传代码

**方式 1（手动上传）**：
通过宝塔面板「文件」功能，将项目压缩包上传至服务器推荐路径 `/www/wwwroot/openstore`，解压后删除压缩包。

操作步骤：
1. 登录宝塔面板，进入「文件」菜单
2. 导航至 `/www/wwwroot` 目录
3. 点击「上传」按钮，选择项目压缩包（如 `OpenStore.zip`）
4. 上传完成后，右键点击压缩包选择「解压」
5. 解压完成后，将解压出的文件夹重命名为 `openstore`（如已命名则跳过）
6. 删除上传的压缩包文件

**方式 2（Git 拉取）（推荐）**：
先在宝塔「终端」安装 Git，再拉取代码：

```bash
# 安装 Git（如未安装）
yum install git -y

# 进入网站根目录
cd /www/wwwroot

# 克隆项目
git clone https://github.com/XiaoChuangll/OpenStore.git openstore

# 进入项目目录
cd openstore
```


### 2.2 安装依赖

```bash
npm install
# 或者
yarn install
```

### 2.3 启动开发环境

该命令会同时启动前端 Vite 开发服务器和后端 Express 服务。

```bash
npm run dev
```

启动后，访问 `http://localhost:3000` (或控制台提示的端口) 即可预览。

### 2.4 构建生产版本

```bash
npm run build
```

构建产物将输出到 `dist` 目录。

### 2.5 运行测试

```bash
npm run test
```

#### 3.1 配置 Nginx 反向代理

##### 步骤1：创建站点

宝塔面板「网站」→「添加站点」：

| 配置项 | 填写内容 |
|--------|----------|
| 域名 | 填写你的域名（如 `openstore.example.com`），无域名则填服务器公网 IP |
| 根目录 | `/www/wwwroot/openstore/dist`（前端构建产物目录） |
| PHP 版本 | 选择「纯静态」 |
| 备注 | OpenStore 前端站点 |

点击「提交」完成站点创建。


## 📂 项目结构

```
├── public/              # 静态资源
├── server/              # Express 后端服务代码
├── src/
│   ├── assets/          # 静态资源 (图片、样式)
│   ├── components/      # 公共 Vue 组件
│   ├── router/          # 路由配置
│   ├── services/        # API 接口封装 (NextAPI, HmAPI)
│   ├── stores/          # Pinia 状态管理
│   ├── views/           # 页面视图组件
│   ├── App.vue          # 根组件
│   └── main.ts          # 入口文件
├── index.html           # HTML 模板
├── package.json         # 项目配置与依赖
├── tsconfig.json        # TypeScript 配置
└── vite.config.ts       # Vite 配置
```


## ⭐ Star History


<p align="center">
  <a href="https://star-history.com/#XiaoChuangll/OpenStore&Date" target="_blank">
    <img src="https://api.star-history.com/svg?repos=XiaoChuangll/OpenStore&type=date&theme=default" alt="Star History Chart" style="border-radius: 12px; max-width: 100%;">
  </a>
</p>


## ❤️ 鸣谢

感谢以下贡献者对本项目的支持：

<div style="display: flex; gap: 10px;">
  <a href="https://github.com/XiaoChuangll" title="XiaoChuangll">
    <img src="https://wsrv.nl/?url=github.com/XiaoChuangll.png&w=400&h=400&mask=circle" width="60" alt="XiaoChuangll"/>
  </a>
  <a href="https://github.com/shenjackyuanjie" title="shenjackyuanjie">
    <img src="https://wsrv.nl/?url=github.com/shenjackyuanjie.png&w=400&h=400&mask=circle" width="60" alt="shenjackyuanjie"/>
  </a>
</div>


## 📄 许可证

本项目基于 MIT 许可证开源。您可以在遵守许可证条款的前提下自由使用、修改和分发本项目的代码。

[MIT License](LICENSE)
