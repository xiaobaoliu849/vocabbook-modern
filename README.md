# VocabBook Modern - 智能生词本 2.0

现代化 AI 增强英语学习工具，使用 React + FastAPI + Electron 构建。

## ✨ 特性

- 🎨 **现代化 UI** - 毛玻璃效果、深色模式、流畅动画
- 🧠 **SM-2 算法** - 科学的间隔重复复习
- 🤖 **AI 增强** - 智能例句生成、记忆技巧、对话练习
- 🔍 **多词典支持** - 有道词典查询
- ⌨️ **全局热键** - Ctrl+Alt+V 快速呼出
- 📊 **学习统计** - 进度追踪、热力图

## 🚀 快速开始

### 1. 安装依赖

```bash
# 后端依赖
cd backend
pip install -r requirements.txt

# 前端依赖
cd ../frontend
npm install

# Electron 依赖
cd ../electron
npm install
```

### 2. 开发模式

```bash
# 终端 1: 启动后端
cd backend
python -m uvicorn main:app --reload --port 8000

# 终端 2: 启动前端
cd frontend
npm run dev

# 终端 3: 启动 Electron (可选)
cd electron
set NODE_ENV=development && npm start
```

### 3. 生产构建

```bash
# 构建前端
cd frontend
npm run build

# 启动生产环境
cd ../electron
npm start
```

## 📁 项目结构

```
vocabbook-modern/
├── backend/           # Python FastAPI 后端
│   ├── main.py        # API 入口
│   ├── routers/       # API 路由
│   ├── services/      # 业务服务
│   └── models/        # 数据模型
├── frontend/          # React + Vite 前端
│   ├── src/
│   │   ├── components/
│   │   └── pages/
│   └── package.json
└── electron/          # Electron 桌面壳
    ├── main.js        # 主进程
    └── preload.js
```

## 🔧 配置

### AI 设置

在设置页面配置 AI Provider 和 API Key，支持：
- OpenAI (GPT-4)
- Anthropic (Claude)
- Google (Gemini)
- Ollama (本地模型)

### 数据库

默认使用 `vocab.db`（SQLite），可通过环境变量 `VOCABBOOK_DB_PATH` 指定路径。

## 📝 License

MIT
