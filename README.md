# VocabBook Modern

An AI-powered vocabulary learning app for serious English learners, built with React, FastAPI, Electron, and cloud memory integration.

## Overview

VocabBook Modern is designed to solve a practical learning problem: most vocabulary apps are good at storing words, but weak at helping users actually remember, review, and reuse them in context.

This project combines:

- structured spaced repetition for real retention
- AI-powered explanation, translation, and conversation practice
- long-term memory for more personalized learning
- desktop-first usability with a clean, focused interface

The result is a learning tool that feels closer to a personal AI language partner than a static flashcard app.

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

### 1. Hybrid Learning Architecture

This project does not rely on a single memory system.

- Structured learning state stays in the local database
- Cloud auth and subscription state live in the cloud server
- Long-term conversational memory is handled through EverMem

This separation is important because it keeps critical review logic stable while still enabling richer AI memory features.

### 2. From Prototype to Deployable Product

This is not just a local demo.

- Cloud server is deployed on Alibaba Cloud
- Domain-based access is live through `https://api.historyai.fun`
- The app can authenticate against the remote cloud API
- Premium-tier architecture is already integrated into the product flow

### 3. Practical AI UX

Instead of adding AI as decoration, the app uses AI where it actually helps:

- sentence generation
- translation
- memory reinforcement
- conversation practice
- personalized recall

### 4. Multi-Modal AI Partner

The AI Partner supports:

- text input
- image upload
- image paste
- drag-and-drop image input

This makes the assistant useful for real study scenarios, such as asking about screenshots, notes, or learning materials.

### 5. Real Engineering Iteration

The current version includes:

- deployed cloud auth
- production-style reverse proxy setup
- systemd service management
- front-end and back-end integration fixes
- memory-system validation and fallback design decisions

This means the project is not only feature-rich, but also engineered with real deployment constraints in mind.

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

## English Demo Script

You can use this short English script directly in your video:

> Hi, this is VocabBook Modern, an AI-powered vocabulary learning app built for serious English learners.
>
> The goal of this project is not just to store words, but to help users actually remember and use them.
>
> The app combines three important parts: a structured spaced-repetition review system, an AI learning assistant, and long-term memory support.
>
> Here I can manage vocabulary, review difficult words, generate example sentences, translate text, and chat with an AI Partner.
>
> The AI Partner also supports image input, so users can paste or upload screenshots and ask questions naturally.
>
> On the engineering side, this is not only a local prototype. I have already deployed the cloud API on Alibaba Cloud, connected the app to remote authentication, and integrated a premium subscription architecture.
>
> I also validated the boundary between structured learning data and long-term conversational memory, so the product remains practical and stable instead of relying on a single memory mechanism.
>
> In short, VocabBook Modern is designed as a real AI learning product, not just a flashcard app with a chatbot attached.

## Why This Project Stands Out

- It combines education, AI, desktop UX, and cloud deployment in one coherent product.
- It treats memory as an engineering problem, not just a UI feature.
- It already includes the transition path from local tool to real SaaS product.
- It focuses on actual learner workflow instead of isolated AI demos.

## License

MIT
