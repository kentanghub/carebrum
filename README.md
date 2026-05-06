# Cerebrum - Multi-Agent Research System

> **Powered by Xiaomi MiMo AI Models**

Cerebrum is a sophisticated multi-agent research system that leverages Xiaomi MiMo's advanced AI capabilities to perform comprehensive, deep-dive research on any topic. The system orchestrates multiple specialized AI agents that collaborate to extract, reason, synthesize, and critique information - producing publication-quality research reports.

## Core Problem Solved

In today's information-rich world, professionals, researchers, and students face **information overload**. Finding reliable, comprehensive, and well-synthesized information requires hours of manual research across multiple sources. Cerebrum solves this by automating the entire research pipeline using collaborative AI agents, each powered by specialized MiMo models.

## Core Logic Flow

### Multi-Agent Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    CEREBRUM SYSTEM                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐                                           │
│  │   User Query │                                           │
│  └──────┬───────┘                                           │
│         │                                                   │
│         ▼                                                   │
│  ┌──────────────────────────────────┐                       │
│  │     ORCHESTRATOR AGENT           │                       │
│  │  (MiMo-V2-Pro)                   │                       │
│  │  • Analyzes query complexity     │                       │
│  │  • Creates research plan         │                       │
│  │  • Delegates sub-tasks           │                       │
│  └──────────┬───────────────────────┘                       │
│             │                                               │
│     ┌───────┴───────┐                                       │
│     │               │                                       │
│     ▼               ▼                                       │
│  ┌────────┐    ┌──────────────┐                            │
│  │MULTI-  │    │  REASONING   │                            │
│  │MODAL   │───▶│   ENGINE     │                            │
│  │EXTRACTOR    │ (MiMo-V2-Pro)│                            │
│  │(Omni)  │    │              │                            │
│  └────────┘    │ • Chain-of-  │                            │
│                │   thought    │                            │
│                │ • Fact check │                            │
│                │ • Pattern    │                            │
│                │   analysis   │                            │
│                └──────┬───────┘                            │
│                       │                                     │
│                       ▼                                     │
│              ┌────────────────┐                            │
│              │  SYNTHESIZER   │                            │
│              │ (MiMo-V2-Pro)  │                            │
│              │                │                            │
│              │ • Integrates   │                            │
│              │   findings     │                            │
│              │ • Structures   │                            │
│              │   report       │                            │
│              └───────┬────────┘                            │
│                      │                                      │
│                      ▼                                      │
│              ┌────────────────┐                            │
│              │    CRITIC      │                            │
│              │ (MiMo-V2-Pro)  │                            │
│              │                │                            │
│              │ • Quality      │                            │
│              │   assurance    │                            │
│              │ • Bias check   │                            │
│              └───────┬────────┘                            │
│                      │                                      │
│                      ▼                                      │
│              ┌────────────────┐                            │
│              │  FINAL REPORT  │                            │
│              └────────────────┘                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Agent Collaboration Flow

1. **Orchestrator Agent** (MiMo-V2-Pro): Receives the user query, analyzes its complexity, and creates a structured research plan
2. **Multimodal Extractor** (MiMo-V2-Omni): Extracts information from diverse sources - text, images, audio, and video
3. **Reasoning Engine** (MiMo-V2-Pro): Performs deep chain-of-thought reasoning, verifies facts, and identifies patterns
4. **Report Synthesizer** (MiMo-V2-Pro): Combines all findings into a comprehensive, structured markdown report
5. **Quality Critic** (MiMo-V2-Pro): Reviews the final output for accuracy, completeness, and bias

### Key Features

- **Long-Chain Reasoning**: Utilizes MiMo-V2-Pro's advanced reasoning capabilities for complex problem analysis
- **Multimodal Understanding**: Leverages MiMo-V2-Omni to process text, images, audio, and video
- **Multi-Agent Collaboration**: Specialized agents work together through a shared message bus
- **Real-time Streaming**: Live updates as each agent completes its task
- **Adjustable Depth**: Quick scan, standard, or deep research modes
- **Export Capability**: Download reports as markdown files

## Technology Stack

- **Frontend**: Next.js 16, TypeScript, Tailwind CSS, Framer Motion
- **Backend**: Next.js API Routes, Server-Sent Events
- **AI Models**: Xiaomi MiMo V2.5 Series (Pro, Omni, TTS)
- **API Compatibility**: OpenAI API format

## Getting Started

### Prerequisites

- Node.js 18+
- MiMo API Key (from [platform.xiaomimimo.com](https://platform.xiaomimimo.com))

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/cerebrum.git
cd cerebrum

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local and add your MiMo API key

# Run development server
npm run dev
```

### Environment Variables

```env
MIMO_API_KEY=your_api_key_here
MIMO_BASE_URL=https://api.xiaomimimo.com/v1
```

## Usage

1. Enter your research query in the input field
2. Select research depth (Quick Scan, Standard, or Deep Research)
3. Enable multimodal analysis if your query involves images, audio, or video
4. Click "Start Research" and watch the agents collaborate in real-time
5. Download the final report as a markdown file

## MiMo Integration

This project is specifically designed to showcase the capabilities of Xiaomi MiMo models:

- **MiMo-V2-Pro**: Powers the reasoning, synthesis, and quality assurance agents
- **MiMo-V2-Omni**: Enables multimodal information extraction
- **OpenAI-compatible API**: Seamless integration with existing tools and frameworks

## Demo

[Live Demo](https://your-deployment-url.vercel.app)

## License

MIT License

## Acknowledgments

- Xiaomi MiMo Team for providing the powerful AI models
- The open-source community for the amazing tools and libraries
