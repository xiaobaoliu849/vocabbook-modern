# VocabBook Modern

A small AI-powered vocabulary learning project built with React, FastAPI, Electron, and EverMem integration.

## Overview

VocabBook Modern is a smart vocab book for English learning.

The idea is simple:

- search a word quickly
- see multiple dictionary results at the same time
- review difficult words with spaced repetition
- chat with an AI partner
- connect EverMem so the assistant can remember useful facts across sessions

It is a small project, but it already includes a deployed cloud API and a working long-memory flow.

## Core Features

### 1. Smart Vocabulary Management

- Add and organize words quickly
- Batch import vocabulary from text files
- View and manage saved words in a dedicated word list
- Track meanings, tags, mastery, and review state

### 2. SM-2 Based Review System

- Uses spaced repetition to schedule reviews scientifically
- Supports difficult-word tracking
- Surfaces due words automatically
- Builds a real long-term review loop instead of simple word collection

### 3. AI Learning Assistant

- AI chat for free conversation practice
- AI translation with saved history
- AI-generated example sentences
- AI memory tips for difficult words
- Context-aware learning support during study sessions

### 4. AI Partner With Long-Term Memory

- Dedicated AI Partner interface for conversation-based learning
- Supports text and image input
- Supports paste, drag-and-drop, and file upload for images
- Integrates long-term memory so the assistant can recall relevant learning context

### 5. EverMem Integration

- Chat memory recall works across sessions
- Review events can be written to EverMem for long-term traceability
- Long-term memory is integrated without forcing the user to leave the main learning workflow

### 6. Premium Subscription Architecture

- Cloud-based user auth and tier system
- Premium users can unlock advanced capabilities
- Remote cloud API deployment is already connected
- Designed to support a future paid product model instead of only a local prototype

### 7. Desktop Product Experience

- Built with Electron for desktop usage
- Fast local startup and local database support
- Global workflow focused on study efficiency instead of browser clutter

## Highlights

### 1. Practical Learning Workflow

- Search a word
- Read multiple dictionary results
- Save it
- Review it later
- Use AI chat to practice
- Use long memory when relevant

### 2. From Prototype to Deployed Demo

- Cloud server is deployed on Alibaba Cloud
- Domain-based access is live through `https://api.historyai.fun`
- The app can authenticate against the remote cloud API
- Premium-tier architecture is already connected to the product flow

### 3. Useful AI Features

The app uses AI in a few practical places:

- sentence generation
- translation
- memory reinforcement
- conversation practice
- memory-based recall

### 4. Multi-Modal AI Partner

The AI Partner supports:

- text input
- image upload
- image paste
- drag-and-drop image input

This makes the assistant useful for real study scenarios, such as asking about screenshots, notes, or learning materials.

### 5. Real Deployment Work

The current version includes:

- deployed cloud auth
- production-style reverse proxy setup
- systemd service management
- front-end and back-end integration fixes
- memory-system validation and fallback design decisions

So even though this is a small project, it is not only local. It has already been connected to a real deployed backend.

## Tech Stack

### Frontend

- React
- TypeScript
- Vite
- Tailwind CSS

### Backend

- FastAPI
- SQLite
- SQLAlchemy

### Desktop

- Electron

### AI / Memory

- OpenAI / DashScope / compatible model providers
- EverMem long-term memory integration

### Cloud

- Alibaba Cloud ECS
- Nginx
- systemd
- Cloudflare DNS / TLS

## Deployment Status

The remote cloud API is deployed and reachable at:

- `https://api.historyai.fun`

The current deployed setup includes:

- remote authentication
- user tier lookup
- premium subscription groundwork
- cloud API access from the local desktop app

## Project Structure

```text
vocabbook-modern/
├── backend/              # FastAPI backend
├── cloud_server/         # Remote auth / subscription cloud service
├── frontend/             # React + Vite frontend
├── electron/             # Electron desktop shell
├── deploy/               # Deployment examples for nginx/systemd
└── docs/                 # Deployment and engineering notes
```

## Local Development

### Install Dependencies

```bash
cd backend
pip install -r requirements.txt

cd ../frontend
npm install

cd ../electron
npm install
```

### Start Development Mode

```bash
./dev.bat
```

Current development mode is configured to use the deployed cloud API by default.

## Demo Focus

If you are recording a demo video, the most valuable flow is:

1. Open the app and show the main learning interface
2. Log in with a cloud account
3. Open AI Partner and start a conversation
4. Paste or upload an image and ask the model to understand it
5. Show review mode and difficult-word learning flow
6. Show premium account state in the UI
7. Mention that authentication and membership now go through the deployed cloud API

## Demo Video

- English demo video: [vocabbook.mp4](./demo/vocabbook.mp4)

## Demo Talking Points

Use these points as natural prompts instead of reading a polished script:

- This is a small smart vocab book project
- You can search a word and get multiple dictionary results at the same time
- You can save words and review them later
- You can chat with an AI partner
- EverMem is integrated for long memory
- You can ask something like "What is my favorite fruit?"
- If the memory is retrieved correctly, the assistant can answer with the saved fact
- The cloud API is already deployed and connected

## Short English Pitch

If you want a very simple English introduction, use this:

> Hi everyone, this is a small project called VocabBook Modern.
>
> It is a smart vocab book for English learning.
>
> You can search a word, get multiple dictionary results, review words later, and chat with an AI partner.
>
> I also integrated EverMem, so the assistant can use long memory across sessions.
>
> For example, if I tell it that my favorite fruit is mango, I can ask again later and it can remember that fact.

## Why This Project Stands Out

- It combines education, AI, desktop UX, and cloud deployment in one coherent product.
- It treats memory as an engineering problem, not just a UI feature.
- It already includes the transition path from local tool to real SaaS product.
- It focuses on actual learner workflow instead of isolated AI demos.

## License

MIT
