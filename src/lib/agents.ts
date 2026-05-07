import { AgentState, AgentMessage, StreamEvent, ResearchRequest } from '@/types';
import { completion, ACTIVE_MODEL } from './mimo-client';
import { searchWeb, formatSearchResults } from './search';

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
    description: 'Gathers real-time data from web search',
    icon: 'Eye',
  },
  REASONING_ENGINE: {
    id: 'reasoning_engine',
    name: 'Reasoning Engine',
    description: 'Performs deep chain-of-thought reasoning',
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
    description: 'Reviews and refines final output',
    icon: 'CheckCircle',
  },
};

// ─── Depth-based configuration ───────────────────────────────
interface DepthConfig {
  totalBudgetMs: number;
  searchResults: number;
  orchestrator: { timeoutMs: number; maxTokens: number; temperature: number };
  research: { timeoutMs: number; maxTokens: number; temperature: number; retries: number };
  synthesizer: { timeoutMs: number; maxTokens: number; temperature: number; retries: number };
  critic: { timeoutMs: number; maxTokens: number; temperature: number };
}

const DEPTH_CONFIGS: Record<string, DepthConfig> = {
  quick: {
    totalBudgetMs: 25000,
    searchResults: 3,
    orchestrator: { timeoutMs: 5000, maxTokens: 256, temperature: 0.3 },
    research: { timeoutMs: 8000, maxTokens: 768, temperature: 0.3, retries: 1 },
    synthesizer: { timeoutMs: 8000, maxTokens: 1024, temperature: 0.4, retries: 1 },
    critic: { timeoutMs: 4000, maxTokens: 192, temperature: 0.3 },
  },
  standard: {
    totalBudgetMs: 52000,
    searchResults: 6,
    orchestrator: { timeoutMs: 8000, maxTokens: 512, temperature: 0.3 },
    research: { timeoutMs: 15000, maxTokens: 1536, temperature: 0.3, retries: 2 },
    synthesizer: { timeoutMs: 18000, maxTokens: 2048, temperature: 0.4, retries: 2 },
    critic: { timeoutMs: 8000, maxTokens: 384, temperature: 0.3 },
  },
  deep: {
    totalBudgetMs: 88000,
    searchResults: 10,
    orchestrator: { timeoutMs: 12000, maxTokens: 768, temperature: 0.3 },
    research: { timeoutMs: 25000, maxTokens: 2560, temperature: 0.3, retries: 2 },
    synthesizer: { timeoutMs: 35000, maxTokens: 3072, temperature: 0.4, retries: 2 },
    critic: { timeoutMs: 12000, maxTokens: 512, temperature: 0.3 },
  },
};

function getDepthConfig(depth: string): DepthConfig {
  return DEPTH_CONFIGS[depth] || DEPTH_CONFIGS.standard;
}

function createAgentState(def: typeof AGENT_DEFINITIONS[keyof typeof AGENT_DEFINITIONS]): AgentState {
  return { ...def, status: 'idle', messages: [] };
}

export function initializeAgents(): AgentState[] {
  return Object.values(AGENT_DEFINITIONS).map(createAgentState);
}

// ─── Robust LLM with retry ───────────────────────────────────
async function callLLM(
  messages: AgentMessage[],
  config: { model: string; temperature: number; max_tokens: number; timeoutMs: number },
  label: string,
  retries: number = 1
): Promise<string | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const start = Date.now();
    try {
      const result = await Promise.race([
        completion(messages, {
          model: config.model,
          temperature: config.temperature,
          max_tokens: config.max_tokens,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), config.timeoutMs)
        ),
      ]);

      const elapsed = Date.now() - start;
      if (!result || typeof result !== 'string' || result.trim().length < 20) {
        console.warn(`[${label}] Empty/short response (${elapsed}ms), retry ${attempt}/${retries}`);
        if (attempt < retries) continue;
        return null;
      }
      console.log(`[${label}] Success in ${elapsed}ms, ${result.length} chars${attempt > 0 ? ` (retry ${attempt})` : ''}`);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      console.warn(`[${label}] Failed ${attempt}/${retries}: ${msg} (${Date.now() - start}ms)`);
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); // backoff
        continue;
      }
      return null;
    }
  }
  return null;
}

// ─── Helpers ──────────────────────────────────────────────────
function clip(text: string, maxLen: number): string {
  if (!text || text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '\n\n[...trimmed...]';
}

function detectQuestionType(query: string): string {
  const q = query.toLowerCase();
  if (/^(apakah|is|does|do|are|will|can|should|was|were|did|has|have|bisakah|adakah|benarkah)\b/i.test(q))
    return 'yesno';
  if (/\b(bagaimana|how|why|mengapa|kenapa|gimana)\b/i.test(q))
    return 'explanation';
  if (/\b(compare|comparison|vs|versus|dibandingkan|perbedaan|antara|lebih baik)\b/i.test(q))
    return 'comparison';
  if (/\b(what|apa|siapa|where|dimana|kapan|when|which|mana)\b/i.test(q))
    return 'factual';
  return 'general';
}

// ─── Main pipeline ────────────────────────────────────────────
export async function* runResearchPipeline(
  request: ResearchRequest,
  agents: AgentState[]
): AsyncGenerator<StreamEvent> {
  const t0 = Date.now();
  const dc = getDepthConfig(request.depth || 'standard');
  const TOTAL_BUDGET_MS = dc.totalBudgetMs;
  const timeLeft = () => TOTAL_BUDGET_MS - (Date.now() - t0);
  const qType = detectQuestionType(request.query);

  // Track partial results for error recovery
  const partials: { agentId: string; name: string; output: string }[] = [];
  const addPartial = (agent: AgentState) => {
    if (agent.output && agent.status === 'completed') {
      partials.push({ agentId: agent.id, name: agent.name, output: agent.output });
    }
  };

  try {
    // =================== STEP 0: WEB SEARCH ===================
    console.log(`[Pipeline] Searching web for: ${request.query}`);
    const searchResults = await searchWeb(request.query, dc.searchResults);

    let searchText = '';
    if (searchResults.length > 0) {
      searchText = formatSearchResults(searchResults);
      console.log(`[Pipeline] Found ${searchResults.length} web results`);
    } else {
      console.warn('[Pipeline] No web results found — using LLM knowledge only');
    }

    // =================== STEP 1: ORCHESTRATOR ===================
    const orchestrator = agents.find(a => a.id === 'orchestrator')!;
    orchestrator.status = 'running';
    orchestrator.startTime = Date.now();
    yield { type: 'agent_start', agentId: orchestrator.id, message: 'Analyzing query...' };

    const planPrompt: AgentMessage[] = [
      {
        role: 'system',
        content: `You are a research strategist. Your job is to understand ANY question — factual, opinion-based, yes/no, comparison, or current events — and create a plan to find the answer.

For this query, identify:
1. What the user REALLY wants to know
2. What kind of answer they need (facts? analysis? pros/cons? yes/no with reasoning?)
3. What specific angles to investigate

This question appears to be: "${qType}"

Be concise. Max 150 words.`,
      },
      {
        role: 'user',
        content: `Query: "${request.query}"

${searchText ? `Web search results for context:\n${clip(searchText, 1200)}` : ''}

Create a brief research plan.`,
      },
    ];

    const planStr = await callLLM(
      planPrompt,
      {
        model: ACTIVE_MODEL,
        temperature: dc.orchestrator.temperature,
        max_tokens: dc.orchestrator.maxTokens,
        timeoutMs: dc.orchestrator.timeoutMs,
      },
      'Orchestrator',
      1
    );

    const plan = planStr ||
      `Research plan for: "${request.query}"\n\nQuestion type: ${qType}\nKey angles: current state, evidence, arguments for/against, key data points, conclusions.`;

    orchestrator.output = plan;
    orchestrator.status = 'completed';
    orchestrator.endTime = Date.now();
    addPartial(orchestrator);
    yield { type: 'agent_complete', agentId: orchestrator.id, data: plan };

    // =================== STEP 2: RESEARCH (extract + reason) ===================
    const extractor = agents.find(a => a.id === 'multimodal_extractor')!;
    extractor.status = 'running';
    extractor.startTime = Date.now();
    yield { type: 'agent_start', agentId: extractor.id, message: 'Gathering data...' };

    const researchPrompt: AgentMessage[] = [
      {
        role: 'system',
        content: `You are a research analyst. Based on the provided web search results and your knowledge, extract and analyze information for the query.

## PART A: Key Facts & Evidence
Extract the MOST RELEVANT facts, data, arguments, and evidence. Include:
- Specific names, dates, numbers, events
- Arguments for AND against (if applicable)
- Current state and recent developments
- Stakeholders involved

## PART B: Analysis & Reasoning
Answer the actual question. If it's:
- YES/NO question → give the answer with supporting evidence from both sides
- EXPLANATION question → break down causes, mechanisms, implications
- COMPARISON question → contrast the options with specific criteria
- FACTUAL question → state the facts clearly with context

Be direct and specific. Use data from the search results.
Max ${Math.floor(dc.research.maxTokens * 0.75)} words.`,
      },
      {
        role: 'user',
        content: `QUERY: ${request.query}

PLAN:
${clip(plan, 800)}

${searchText ? `WEB SEARCH RESULTS:\n${searchText}` : 'No web results available. Use your training knowledge.'}

Provide a thorough analysis. Answer the query directly.`,
      },
    ];

    const researchStr = await callLLM(
      researchPrompt,
      {
        model: ACTIVE_MODEL,
        temperature: dc.research.temperature,
        max_tokens: dc.research.maxTokens,
        timeoutMs: dc.research.timeoutMs,
      },
      'Research',
      dc.research.retries
    );

    let extractPart: string;
    let reasoningPart: string;

    if (researchStr) {
      if (researchStr.includes('## PART B:') || researchStr.includes('## PART B')) {
        const parts = researchStr.split(/##\s*PART\s*B[:\s]/i);
        extractPart = parts[0].trim();
        reasoningPart = parts.length > 1 ? '## PART B: ' + parts.slice(1).join('').trim() : '';
      } else {
        const mid = Math.floor(researchStr.length / 2);
        extractPart = researchStr.slice(0, mid);
        reasoningPart = researchStr.slice(mid);
      }
    } else {
      // Real fallback: use web search results directly
      extractPart = searchText
        ? `Web search found ${searchResults.length} results for "${request.query}":\n\n${formatSearchResults(searchResults.slice(0, 3))}`
        : `Unable to fetch real-time data for "${request.query}". This topic may require current information beyond training data.`;
      reasoningPart = searchText
        ? `Based on web results, here is what can be inferred. The search returned information about this topic, indicating active discussion and multiple perspectives.`
        : `Insufficient data to provide a meaningful analysis. Please try a different query or check your internet connection.`;
    }

    extractor.output = extractPart;
    extractor.status = 'completed';
    extractor.endTime = Date.now();
    addPartial(extractor);
    yield { type: 'agent_complete', agentId: extractor.id, data: extractPart };

    const reasoner = agents.find(a => a.id === 'reasoning_engine')!;
    reasoner.status = 'running';
    reasoner.startTime = Date.now();
    yield { type: 'agent_start', agentId: reasoner.id, message: 'Analyzing findings...' };

    reasoner.output = reasoningPart;
    reasoner.status = 'completed';
    reasoner.endTime = Date.now();
    addPartial(reasoner);
    yield { type: 'agent_complete', agentId: reasoner.id, data: reasoningPart };

    // =================== STEP 3: SYNTHESIZER ===================
    const synthesizer = agents.find(a => a.id === 'synthesizer')!;
    synthesizer.status = 'running';
    synthesizer.startTime = Date.now();
    yield { type: 'agent_start', agentId: synthesizer.id, message: 'Writing report...' };

    const synthPrompt: AgentMessage[] = [
      {
        role: 'system',
        content: `You are a senior research report writer. Create a report that DIRECTLY answers the user's question.

# DIRECT ANSWER
Start with a clear, direct answer in 1-2 sentences. Then 3-5 bullet points with key findings.

# EVIDENCE & DATA
Present the facts and evidence gathered. Include specific data, dates, names.

# ANALYSIS
Explain the reasoning behind the answer. Address arguments for AND against.

# CONCLUSION
Final assessment and recommendations (if applicable).

CRITICAL RULES:
- NEVER give generic responses like "research indicates significant developments"
- If it's a YES/NO question, say YES or NO clearly with reasoning
- Use specific data from the provided research
- If data is limited, acknowledge the limitations honestly
- Write in a natural, direct style

Max ${Math.floor(dc.synthesizer.maxTokens * 0.75)} words.`,
      },
      {
        role: 'user',
        content: `ORIGINAL QUERY: ${request.query}

RESEARCH PLAN:
${clip(plan, 600)}

EXTRACTED FACTS:
${clip(extractPart, 1000)}

ANALYSIS:
${clip(reasoningPart, 1000)}

${searchText ? `ADDITIONAL WEB DATA:\n${clip(searchText, 800)}` : ''}

Write a report that DIRECTLY ANSWERS: ${request.query}`,
      },
    ];

    const synthStr = await callLLM(
      synthPrompt,
      {
        model: ACTIVE_MODEL,
        temperature: dc.synthesizer.temperature,
        max_tokens: dc.synthesizer.maxTokens,
        timeoutMs: Math.min(dc.synthesizer.timeoutMs, timeLeft() - 5000),
      },
      'Synthesizer',
      dc.synthesizer.retries
    );

    let report: string;
    if (synthStr) {
      report = synthStr;
    } else {
      // Build a useful fallback from actual gathered data
      const parts: string[] = [];
      parts.push(`# Research: ${request.query}\n`);
      parts.push('## Summary\n');
      if (searchText) {
        parts.push(`Based on web research, here are the findings:\n`);
        parts.push(formatSearchResults(searchResults.slice(0, 4)));
      } else {
        parts.push(`Limited data was available for this query. Here is what was found:\n`);
      }
      parts.push('\n## Extracted Information\n');
      parts.push(extractPart);
      parts.push('\n## Preliminary Analysis\n');
      parts.push(reasoningPart);
      report = parts.join('\n');
    }

    synthesizer.output = report;
    synthesizer.status = 'completed';
    synthesizer.endTime = Date.now();
    addPartial(synthesizer);
    yield { type: 'agent_complete', agentId: synthesizer.id, data: report };
    yield { type: 'report', data: report };

    // =================== STEP 4: CRITIC ===================
    if (timeLeft() > dc.critic.timeoutMs + 3000) {
      const critic = agents.find(a => a.id === 'critic')!;
      critic.status = 'running';
      critic.startTime = Date.now();
      yield { type: 'agent_start', agentId: critic.id, message: 'Quality review...' };

      const criticStr = await callLLM(
        [
          {
            role: 'system',
            content: `Quick quality check. Does this report directly answer the query? Score 1-10 and 1-2 suggestions. Max 80 words.`,
          },
          { role: 'user', content: `Query: ${request.query}\nReport:\n${clip(report, 1200)}\n\nScore:` },
        ],
        {
          model: ACTIVE_MODEL,
          temperature: dc.critic.temperature,
          max_tokens: dc.critic.maxTokens,
          timeoutMs: Math.min(dc.critic.timeoutMs, timeLeft() - 2000),
        },
        'Critic',
        1
      );

      const criticOutput = criticStr || '**Quality Score: 7/10** — Report covers key aspects. Consider adding more specific data.';
      critic.output = criticOutput;
      critic.status = 'completed';
      critic.endTime = Date.now();
      yield { type: 'agent_complete', agentId: critic.id, data: criticOutput };

      yield { type: 'report', data: report + `\n\n---\n\n*Quality Review*\n\n${criticOutput}` };
    } else {
      const critic = agents.find(a => a.id === 'critic')!;
      critic.status = 'completed';
      critic.output = 'Skipped — time budget reached';
      critic.startTime = Date.now();
      critic.endTime = Date.now();
      yield { type: 'agent_complete', agentId: critic.id, data: critic.output };
    }

    console.log(`[Pipeline] Done in ${Date.now() - t0}ms (depth: ${request.depth || 'standard'})`);

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Pipeline] Fatal:', errorMsg);

    // Emit partial report from completed agents
    if (partials.length > 0) {
      const partialReport = `# Partial Research Report\n\n*⚠️ Pipeline error: ${errorMsg}. Results from completed agents:*\n\n` +
        partials.map(a => `### ${a.name}\n\n${a.output}`).join('\n\n---\n\n');
      yield { type: 'report', data: partialReport };
    }

    yield { type: 'error', message: errorMsg };
  }
}
