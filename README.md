# Cerebrum — Multi-Agent Research System

> **AI-powered multi-agent research assistant that completes deep research in under 60 seconds.**

Cerebrum orchestrates 5 specialized AI agents that collaborate to extract, reason, synthesize, and review information — producing publication-quality research reports from a single query.

## 🔧 How It Works

### Multi-Agent Pipeline

```
User Query → Orchestrator → Extractor + Reasoner → Synthesizer → Critic → Report
```

| # | Agent | Role |
|---|-------|------|
| 1 | **Orchestrator** | Analyzes query, creates research plan |
| 2 | **Multimodal Extractor** | Gathers facts, data, stakeholders |
| 3 | **Reasoning Engine** | Chain-of-thought analysis, patterns, risks |
| 4 | **Report Synthesizer** | Compiles everything into a structured report |
| 5 | **Quality Critic** | Scores and suggests improvements |

### Research Depth Modes

| Mode | Time | Best for |
|------|------|----------|
| Quick Scan | ~30s | Fast overview, headlines |
| Standard | ~2min | Balanced depth (default) |
| Deep Research | ~5min | Thorough analysis |

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- An API key from any OpenAI-compatible provider (Bluesminds, OpenRouter, MiMo, etc.)

### Setup

```bash
# Clone
git clone https://github.com/kentanghub/carebrum.git
cd carebrum

# Install
npm install

# Configure
cp .env.example .env.local
# Edit .env.local — add your API_KEY

# Run
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `API_KEY` | Yes | — | Your API key |
| `API_BASE_URL` | No | *auto* | Custom API endpoint |
| `ACTIVE_MODEL` | No | `deepseek.v3.2` | Model name to use |
| `NEXT_PUBLIC_PROVIDER_NAME` | No | `AI` | Display name in UI |

## 🧱 Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS 4, Framer Motion
- **Markdown**: react-markdown + remark-gfm
- **API Format**: OpenAI-compatible (`/v1/chat/completions`)
- **Streaming**: Server-Sent Events (SSE)

## 📦 Project Structure

```
src/
├── app/
│   ├── api/research/route.ts    # Research API (SSE stream)
│   ├── globals.css               # Global styles
│   ├── layout.tsx                # Root layout
│   └── page.tsx                  # Home page
├── components/
│   ├── AgentNode.tsx             # Individual agent card
│   ├── Logo.tsx                  # SVG logo
│   ├── NeuralBackground.tsx      # Animated background
│   └── ResearchDashboard.tsx     # Main UI (client component)
├── lib/
│   ├── agents.ts                 # Agent definitions + pipeline
│   ├── mimo-client.ts            # LLM API client
│   └── utils.ts                  # Utilities
└── types/
    └── index.ts                  # TypeScript types
```

## 🌐 Live Demo

**[carebrum.vercel.app](https://carebrum.vercel.app)**

## 📄 License

MIT
