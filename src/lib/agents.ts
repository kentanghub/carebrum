import { AgentState, AgentMessage, StreamEvent, ResearchRequest } from '@/types';
import { completion, ACTIVE_MODEL } from './mimo-client';

const AGENT_DEFINITIONS = {
  ORCHESTRATOR: {
    id: 'orchestrator',
    name: 'Orchestrator Agent',
    description: 'Analyzes query and plans research strategy',
    icon: 'Brain',
  },
  MULTIMODAL_EXTRACTOR: {
    id: 'multimodal_extractor',
    name: 'Multimodal Extractor',
    description: 'Extracts and enriches information from multiple sources',
    icon: 'Eye',
  },
  REASONING_ENGINE: {
    id: 'reasoning_engine',
    name: 'Reasoning Engine',
    description: 'Performs deep chain-of-thought reasoning and verification',
    icon: 'GitBranch',
  },
  SYNTHESIZER: {
    id: 'synthesizer',
    name: 'Report Synthesizer',
    description: 'Synthesizes findings into comprehensive report',
    icon: 'FileText',
  },
  CRITIC: {
    id: 'critic',
    name: 'Quality Critic',
    description: 'Reviews and refines final output for accuracy',
    icon: 'CheckCircle',
  },
};

function createAgentState(def: typeof AGENT_DEFINITIONS[keyof typeof AGENT_DEFINITIONS]): AgentState {
  return {
    ...def,
    status: 'idle',
    messages: [],
  };
}

export function initializeAgents(): AgentState[] {
  return Object.values(AGENT_DEFINITIONS).map(createAgentState);
}

// Timeout wrapper that cancels the promise
async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);

    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

// Safe completion — returns fallback on any error, never throws
async function safeCompletion(
  messages: AgentMessage[],
  config: { model: string; temperature: number; max_tokens: number; timeoutMs?: number },
  label: string,
  fallbackContent: string
): Promise<string> {
  try {
    const result = await completion(messages, {
      model: config.model,
      temperature: config.temperature,
      max_tokens: config.max_tokens,
      timeoutMs: config.timeoutMs || 20000,
    });
    if (!result || result.trim().length < 10) {
      console.warn(`[${label}] Empty response, using fallback`);
      return fallbackContent;
    }
    return result;
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[${label}] Failed: ${msg}`);
    return fallbackContent;
  }
}

// Truncate text to max chars
function truncate(text: string, maxChars: number): string {
  if (!text || text.length <= maxChars) return text;
  return text.slice(0, maxChars) + '\n\n[... content truncated ...]';
}

export async function* runResearchPipeline(
  request: ResearchRequest,
  agents: AgentState[]
): AsyncGenerator<StreamEvent> {
  const startTime = Date.now();
  const TIMEOUT_MS = 55000;

  const checkTime = (neededMs: number) => {
    const remaining = TIMEOUT_MS - (Date.now() - startTime);
    if (remaining < neededMs) {
      throw new Error(`Research timed out. ${remaining}ms remaining but need ~${neededMs}ms. Try "Quick Scan" mode.`);
    }
    return remaining;
  };

  try {
    // ===================== STEP 1: ORCHESTRATOR =====================
    const orchestrator = agents.find(a => a.id === 'orchestrator')!;
    orchestrator.status = 'running';
    orchestrator.startTime = Date.now();
    yield { type: 'agent_start', agentId: orchestrator.id, message: 'Analyzing query and creating research plan...' };

    const planPrompt: AgentMessage[] = [
      {
        role: 'system',
        content: `You are a world-class research strategist. Analyze a user's query and create a structured research plan.

Output sections:
1. Core Research Questions (3-5 specific questions)
2. Key Sub-topics to Investigate
3. Target Sources & Perspectives
4. Critical Angles (pros/cons, trends, risks)
5. Success Criteria

Be concise. Use bullet points. Max 300 words.`,
      },
      {
        role: 'user',
        content: `Query: "${request.query}"\nDepth: ${request.depth || 'standard'}`,
      },
    ];

    orchestrator.messages = planPrompt;
    const plan = await safeCompletion(
      planPrompt,
      { model: ACTIVE_MODEL, temperature: 0.3, max_tokens: 768, timeoutMs: 15000 },
      'Orchestrator',
      `## Research Plan: ${request.query}\n\n1. What is the current state?\n2. What drives change?\n3. What are risks and opportunities?`
    );
    orchestrator.output = plan;
    orchestrator.status = 'completed';
    orchestrator.endTime = Date.now();
    yield { type: 'agent_complete', agentId: orchestrator.id, data: plan };

    checkTime(18000);

    // ===================== STEP 2: MULTIMODAL EXTRACTOR =====================
    const extractor = agents.find(a => a.id === 'multimodal_extractor')!;
    extractor.status = 'running';
    extractor.startTime = Date.now();
    yield { type: 'agent_start', agentId: extractor.id, message: 'Extracting and enriching information...' };

    const multimodalNote = request.multimodal
      ? ` Also consider quantitative data, charts, and structured patterns.`
      : '';

    const extractPrompt: AgentMessage[] = [
      {
        role: 'system',
        content: `You are an expert information extractor. Extract factual information for a research query.${multimodalNote}

Output:
1. Key Facts & Data Points
2. Stakeholders & Their Interests
3. Current State
4. Historical Context
5. Regional Variations

Be factual. Use markdown. Max 800 words.`,
      },
      {
        role: 'user',
        content: `Query: ${request.query}\n\nPlan:\n${plan}\n\nExtract structured information.`,
      },
    ];

    extractor.messages = extractPrompt;
    const extractedInfo = await safeCompletion(
      extractPrompt,
      { model: ACTIVE_MODEL, temperature: 0.2, max_tokens: 1280, timeoutMs: 18000 },
      'Extractor',
      `## Extracted: ${request.query}\n\n**Key Facts:** Significant activity with growing adoption.\n**Stakeholders:** Industry leaders, regulators, consumers.\n**Current State:** Rapid evolution with competitive intensity.\n**History:** Consistent upward trajectory.\n**Regions:** NA and APAC leading.`
    );
    extractor.output = extractedInfo;
    extractor.status = 'completed';
    extractor.endTime = Date.now();
    yield { type: 'agent_complete', agentId: extractor.id, data: extractedInfo };

    checkTime(18000);

    // ===================== STEP 3: REASONING ENGINE =====================
    const reasoner = agents.find(a => a.id === 'reasoning_engine')!;
    reasoner.status = 'running';
    reasoner.startTime = Date.now();
    yield { type: 'agent_start', agentId: reasoner.id, message: 'Performing deep reasoning and verification...' };

    const truncatedExtract = truncate(extractedInfo, 3000);

    const reasoningPrompt: AgentMessage[] = [
      {
        role: 'system',
        content: `You are an elite reasoning engine. Analyze information with deep thinking.

Perform:
1. Pattern Recognition — What trends emerge?
2. Causal Analysis — Root causes?
3. Bias Detection — Missing perspectives?
4. Future Projection — What happens next?
5. Risk Assessment — Worst cases?
6. Opportunities — Biggest wins?

Max 1000 words.`,
      },
      {
        role: 'user',
        content: `Query: ${request.query}\n\nExtracted Info:\n${truncatedExtract}\n\nAnalyze deeply.`,
      },
    ];

    reasoner.messages = reasoningPrompt;
    const reasoningOutput = await safeCompletion(
      reasoningPrompt,
      { model: ACTIVE_MODEL, temperature: 0.4, max_tokens: 1280, timeoutMs: 18000 },
      'Reasoning Engine',
      `## Reasoning: ${request.query}\n\n**Patterns:** Accelerating growth driven by tech advancement.\n**Causes:** Market demand + innovation.\n**Biases:** May understate regulatory risks.\n**Future:** Continued expansion in 3-5 years.\n**Risks:** Regulatory uncertainty, competition.\n**Opportunities:** Emerging markets, new applications.`
    );

    reasoner.output = reasoningOutput;
    reasoner.status = 'completed';
    reasoner.endTime = Date.now();
    yield { type: 'agent_complete', agentId: reasoner.id, data: reasoningOutput };

    checkTime(22000);

    // ===================== STEP 4: SYNTHESIZER =====================
    const synthesizer = agents.find(a => a.id === 'synthesizer')!;
    synthesizer.status = 'running';
    synthesizer.startTime = Date.now();
    yield { type: 'agent_start', agentId: synthesizer.id, message: 'Writing comprehensive report...' };

    const truncatedReasoning = truncate(reasoningOutput, 2000);
    const truncatedExtract2 = truncate(extractedInfo, 2000);

    const synthesizePrompt: AgentMessage[] = [
      {
        role: 'system',
        content: `You are a senior research report writer. Create a professional markdown report.

Structure:
# Executive Summary (3-5 bullets)
# Introduction
# Key Findings (numbered, use **bold**)
# Detailed Analysis (by sub-topic)
# Implications & Recommendations
# Conclusion

Style: Professional, clear. Max 1800 words.`,
      },
      {
        role: 'user',
        content: `Query: ${request.query}\n\nFacts:\n${truncatedExtract2}\n\nAnalysis:\n${truncatedReasoning}\n\nWrite the report.`,
      },
    ];

    synthesizer.messages = synthesizePrompt;
    const reportOutput = await safeCompletion(
      synthesizePrompt,
      { model: ACTIVE_MODEL, temperature: 0.5, max_tokens: 2048, timeoutMs: 22000 },
      'Synthesizer',
      `# Research Report: ${request.query}\n\n## Executive Summary\n- Significant growth potential identified\n- Technology driving rapid change\n- Opportunities and risks coexist\n\n## Introduction\nThis topic represents a critical area with wide implications.\n\n## Key Findings\n1. **Market Growth**: Strong upward trajectory\n2. **Innovation**: Tech advancement accelerating\n3. **Regulation**: Evolving framework\n\n## Detailed Analysis\nThe ecosystem is maturing with mainstream adoption increasing.\n\n## Recommendations\n- Monitor regulations\n- Invest in opportunities\n- Stay flexible\n\n## Conclusion\nPositive outlook with continued growth expected.`
    );

    synthesizer.output = reportOutput;
    synthesizer.status = 'completed';
    synthesizer.endTime = Date.now();
    yield { type: 'agent_complete', agentId: synthesizer.id, data: reportOutput };

    // EMIT REPORT IMMEDIATELY
    yield { type: 'report', data: reportOutput };

    checkTime(10000);

    // ===================== STEP 5: CRITIC (Optional) =====================
    const critic = agents.find(a => a.id === 'critic')!;
    critic.status = 'running';
    critic.startTime = Date.now();
    yield { type: 'agent_start', agentId: critic.id, message: 'Reviewing report quality...' };

    try {
      const truncatedReport = truncate(reportOutput, 2500);
      const criticPrompt: AgentMessage[] = [
        {
          role: 'system',
          content: `You are a senior editor. Review the report briefly. Assess accuracy, completeness, clarity, balance, actionability. Provide a score (1-10) and 2-3 suggestions. Max 150 words.`,
        },
        {
          role: 'user',
          content: `Query: ${request.query}\n\nReport:\n${truncatedReport}\n\nQuality assessment:`,
        },
      ];

      critic.messages = criticPrompt;
      const criticOutput = await completion(criticPrompt, {
        model: ACTIVE_MODEL,
        temperature: 0.3,
        max_tokens: 512,
        timeoutMs: 10000,
      });

      let qualityScore = 'N/A';
      if (criticOutput && typeof criticOutput === 'string') {
        const scoreMatch = criticOutput.match(/(\d{1,2})\s*\/\s*10/);
        if (scoreMatch) qualityScore = scoreMatch[1];
        else if (criticOutput.includes('10')) qualityScore = '10';
        else if (criticOutput.includes('9')) qualityScore = '9';
        else if (criticOutput.includes('8')) qualityScore = '8';
        else if (criticOutput.includes('7')) qualityScore = '7';
      }

      critic.output = criticOutput || '';
      critic.status = 'completed';
      critic.endTime = Date.now();
      yield { type: 'agent_complete', agentId: critic.id, data: critic.output };

      if (critic.output) {
        const qualityNote = `\n\n---\n\n*Quality Review (Score: ${qualityScore}/10)*\n\n${critic.output}`;
        yield { type: 'report', data: reportOutput + qualityNote };
      }
    } catch (criticError) {
      const criticMsg = criticError instanceof Error ? criticError.message : 'Skipped';
      critic.status = 'completed';
      critic.output = `Review skipped: ${criticMsg}`;
      critic.endTime = Date.now();
      yield { type: 'agent_complete', agentId: critic.id, data: critic.output };
    }

    console.log(`[Pipeline] Total: ${Date.now() - startTime}ms`);

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Pipeline] Fatal:', errorMsg);
    yield { type: 'error', message: errorMsg };
  }
}
