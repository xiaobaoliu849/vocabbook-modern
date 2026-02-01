# VocabBook Modern

**VocabBook Modern** is a desktop application for English vocabulary learning, featuring a modern UI, AI-enhanced capabilities, and a scientific review system based on the SM-2 algorithm. It is built as a hybrid application using a Python backend, a React frontend, and Electron as the desktop wrapper.

## Project Overview

*   **Type:** Full-stack Desktop Application (Electron + React + FastAPI)
*   **Goal:** Provide an intelligent, aesthetically pleasing tool for managing vocabulary, utilizing AI for context generation and memory aids.
*   **Key Features:**
    *   **SM-2 Algorithm:** Efficient spaced repetition for memory retention.
    *   **AI Integration:** Supports OpenAI, Anthropic, Gemini, and Ollama for generating example sentences and mnemonics.
    *   **Modern UI:** Glassmorphism design, dark mode, and fluid animations.
    *   **Hotkeys:** Global activation support.

## Architecture & Tech Stack

The application runs three processes concurrently during development:

### 1. Backend (`/backend`)
*   **Framework:** Python FastAPI
*   **Server:** Uvicorn
*   **Database:** SQLite (`vocab.db`), accessed via `aiosqlite`.
*   **Key Libraries:** `openai`, `anthropic`, `beautifulsoup4` (scraping), `pygame` (audio).
*   **Entry Point:** `main.py`

### 2. Frontend (`/frontend`)
*   **Framework:** React 19 + TypeScript
*   **Build Tool:** Vite
*   **Styling:** Tailwind CSS v4
*   **Entry Point:** `src/main.tsx` -> `index.html`

### 3. Electron Shell (`/electron`)
*   **Role:** Desktop window manager and system integrator.
*   **Communication:** Loads the Vite dev server URL (dev) or static files (prod).
*   **Main Process:** `main.js`

## Getting Started

### Prerequisites
*   Node.js & npm
*   Python 3.x & pip

### Installation

1.  **Backend Dependencies:**
    ```bash
    cd backend
    pip install -r requirements.txt
    ```

2.  **Frontend Dependencies:**
    ```bash
    cd frontend
    npm install
    ```

3.  **Electron Dependencies:**
    ```bash
    cd electron
    npm install
    ```

## Development Workflow

The project provides a convenience script for Windows to start all services:

*   **One-Click Start:** Run `dev.bat` in the root directory.
    *   Starts Backend (Port 8000)
    *   Starts Frontend (Vite default, usually 5173)
    *   Starts Electron (Connects to Frontend)

### Manual Start Commands

| Component | Directory | Command | Description |
| :--- | :--- | :--- | :--- |
| **Backend** | `backend/` | `python -m uvicorn main:app --reload` | Starts FastAPI dev server on port 8000. |
| **Frontend** | `frontend/` | `npm run dev` | Starts Vite dev server. |
| **Electron** | `electron/` | `npm start` | Launches the desktop window (requires `NODE_ENV=development`). |

## Directory Structure

```text
vocabbook-modern/
├── backend/                # Python API Server
│   ├── models/             # Database models (Pydantic/SQLAlchemy)
│   ├── routers/            # API endpoints (AI, Dictionary, Review, Stats)
│   ├── services/           # Business logic & external API handlers
│   ├── main.py             # App entry point
│   └── requirements.txt    # Python dependencies
├── frontend/               # React UI
│   ├── src/
│   │   ├── components/     # Reusable UI components (Heatmap, Sidebar)
│   │   ├── pages/          # Route views (AddWord, Review, Settings)
│   │   └── App.tsx         # Main component
│   └── vite.config.ts      # Vite configuration
├── electron/               # Desktop Wrapper
│   ├── main.js             # Main process logic (window creation, IPC)
│   └── preload.js          # Preload script for secure context bridging
├── dev.bat                 # Windows development startup script
└── README.md               # Project documentation
```

## Conventions

*   **Styling:** Use Tailwind CSS utility classes.
*   **State Management:** React hooks for local state; likely standard fetch/axios for API calls.
*   **Database:** SQLite is used for local persistence.
*   **AI Configuration:** managed via the Settings page in the UI, stored locally or in the DB.
