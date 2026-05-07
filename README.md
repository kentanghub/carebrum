# Cerebrum — Multi-Agent Research System

> **AI-powered research assistant that combines real-time web search with multi-agent intelligence to deliver publication-quality reports in under 60 seconds.**

Cerebrum searches the web live, then orchestrates 5 specialized AI agents to extract, reason, synthesize, and review — turning any question into a well-structured, data-backed report.

## 🔧 How It Works

### Pipeline

```
User Query → Web Search (DuckDuckGo) → Single LLM Call → 5-Agent Output → Report
```

Instead of making 5 separate API calls (which triggers rate limits), Cerebrum uses **one comprehensive prompt** that produces structured output covering Research Plan, Facts & Data, Analysis, Conclusion, and Quality Review. Each section is distributed to its corresponding agent in the UI.

| # | Agent | Responsibility |
|---|-------|----------------|
| 1 | **Orchestrator** | Disambiguates query intent, identifies topic |
| 2 | **Web Extractor** | Real-time web data gathering + fact extraction |
| 3 | **Reasoning Engine** | Deep analysis, pro/contra, cause-effect reasoning |
| 4 | **Report Synthesizer** | Compiles structured markdown report |
| 5 | **Quality Critic** | Accuracy review, identifies limitations |

### Real-Time Web Search

Before the LLM processes your query, Cerebrum searches the web using multiple query variations — critical for:
- **Current events & policies** (e.g., MBG, IKN, trade wars)
- **Acronym disambiguation** (MBG = Makan Bergizi Gratis? Or Money Back Guarantee? Context matters)
- **Niche topics** not in training data

Falls back gracefully to training knowledge when search is unavailable.

### Research Depth Modes

| Mode | Time | Token Budget | Best for |
|------|------|-------------|----------|
| Quick Scan | ~35s | 2,800 | Fast overview, fact checking |
| Standard | ~50s | 4,000 | Balanced depth (default) |
| Deep Research | ~55s | 5,000 | Thorough analysis, more web sources |

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- An API key from any OpenAI-compatible provider (Bluesminds, MiMo, OpenRouter, etc.)

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

- **Framework**: Next.js 16 (App Router, Turbopack)
- **Language**: TypeScript
- **Styling**: Tailwind CSS 4, Framer Motion
- **Markdown**: react-markdown + remark-gfm
- **API Format**: OpenAI-compatible (`/v1/chat/completions`)
- **Streaming**: Server-Sent Events (SSE)
- **Web Search**: DuckDuckGo Lite (free, no API key needed)
- **Deployment**: Vercel (auto-deploy on push)

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
│   ├── NeuralBackground.tsx      # Animated canvas background
│   └── ResearchDashboard.tsx     # Main UI (client component)
├── lib/
│   ├── agents.ts                 # Agent pipeline + prompt orchestration
│   ├── mimo-client.ts            # LLM API client (OpenAI-compatible)
│   ├── search.ts                 # Web search (DuckDuckGo with fallback)
│   └── utils.ts                  # Utilities
└── types/
    └── index.ts                  # TypeScript type definitions
```

## 🌐 Live Demo

**[carebrum.vercel.app](https://carebrum.vercel.app)**

Try queries like:
- *"Is nuclear energy making a comeback globally?"*
- *"Apakah MBG bermanfaat di Indonesia?"*
- *"What's the state of quantum computing in 2025?"*
- *"Bagaimana dampak tarif Trump terhadap ekonomi ASEAN?"*

## 📄 License

MIT
