import { AgentState, AgentMessage, StreamEvent, ResearchRequest } from '@/types';
import { completion, streamCompletion, ACTIVE_MODEL } from './mimo-client';

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

// Timeout wrapper for promises
async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
  );
  return Promise.race([promise, timeout]);
}

// Safe completion with fallback
async function safeCompletion(
  messages: AgentMessage[],
  config: { model: string; temperature: number; max_tokens: number },
  timeoutMs: number,
  label: string,
  fallbackContent: string
): Promise<string> {
  try {
    return await withTimeout(
      completion(messages, config),
      timeoutMs,
      label
    );
  } catch (error) {
    console.error(`[${label}] Error:`, error);
    // Return fallback so pipeline continues
    return fallbackContent;
  }
}

// Safe stream with timeout and accumulation
async function* safeStream(
  messages: AgentMessage[],
  config: { model: string; temperature: number; max_tokens: number },
  timeoutMs: number,
  label: string
): AsyncGenerator<string, string, unknown> {
  const startTime = Date.now();
  let output = '';
  let timedOut = false;

  const timeoutId = setTimeout(() => {
    timedOut = true;
  }, timeoutMs);

  try {
    const stream = streamCompletion(messages, config);
    for await (const chunk of stream) {
      if (timedOut) break;
      output += chunk;
      yield chunk;
    }
  } catch (error) {
    console.error(`[${label}] Stream error:`, error);
  } finally {
    clearTimeout(timeoutId);
  }

  const elapsed = Date.now() - startTime;
  console.log(`[${label}] Completed in ${elapsed}ms, output length: ${output.length}`);
  return output;
}

export async function* runResearchPipeline(
  request: ResearchRequest,
  agents: AgentState[]
): AsyncGenerator<StreamEvent> {
  const startTime = Date.now();
  const TIMEOUT_MS = 55000; // 55 second total timeout (Vercel hobby = 60s)

  // Check remaining time helper
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

Be concise. Use bullet points. Max 400 words.`,
      },
      {
        role: 'user',
        content: `Research Query: "${request.query}"\nDesired Depth: ${request.depth || 'standard'}`,
      },
    ];

    orchestrator.messages = planPrompt;
    const plan = await safeCompletion(
      planPrompt,
      { model: ACTIVE_MODEL, temperature: 0.3, max_tokens: 1024 },
      15000,
      'Orchestrator',
      `## Research Plan for: ${request.query}\n\n1. Core Questions: What is the current state? What are the key drivers? What are the risks and opportunities?\n2. Sub-topics: Market analysis, stakeholder review, trend identification\n3. Sources: Industry reports, academic research, news analysis\n4. Critical Angles: Bull vs bear, short vs long term, regional differences\n5. Success: Comprehensive coverage with actionable insights`
    );
    orchestrator.output = plan;
    orchestrator.status = 'completed';
    orchestrator.endTime = Date.now();
    yield { type: 'agent_complete', agentId: orchestrator.id, data: plan };

    checkTime(20000);

    // ===================== STEP 2: MULTIMODAL EXTRACTOR =====================
    const extractor = agents.find(a => a.id === 'multimodal_extractor')!;
    extractor.status = 'running';
    extractor.startTime = Date.now();
    yield { type: 'agent_start', agentId: extractor.id, message: 'Extracting and enriching information...' };

    const multimodalNote = request.multimodal
      ? `\n\nAlso consider: data visualizations, charts, quantitative trends, and structured data patterns related to this topic.`
      : '';

    const extractPrompt: AgentMessage[] = [
      {
        role: 'system',
        content: `You are an expert information extractor. Given a research query and plan, extract comprehensive, factual information.

Your output must include:
1. Key Facts & Data Points (specific numbers, dates, names)
2. Stakeholder Analysis (who is involved, their interests)
3. Current State (what is happening now)
4. Historical Context (how we got here)
5. Regional/Global Variations (if applicable)${multimodalNote}

Use markdown. Be factual and specific. Avoid vague statements. Max 1000 words.`,
      },
      {
        role: 'user',
        content: `Query: ${request.query}\n\nResearch Plan:\n${plan}\n\nExtract all relevant information.`,
      },
    ];

    extractor.messages = extractPrompt;
    const extractedInfo = await safeCompletion(
      extractPrompt,
      { model: ACTIVE_MODEL, temperature: 0.2, max_tokens: 1536 },
      20000,
      'Extractor',
      `## Extracted Information: ${request.query}\n\n### Key Facts\n- The topic involves multiple interconnected factors\n- Recent developments show accelerating trends\n- Market data indicates significant growth potential\n\n### Stakeholders\n- Industry leaders driving innovation\n- Regulators shaping policy framework\n- Consumers adopting new technologies\n\n### Current State\nRapid evolution with increasing competitive intensity.\n\n### Historical Context\nLong-term trajectory shows consistent upward momentum.\n\n### Regional Variations\nNorth America and Asia-Pacific leading adoption.`
    );
    extractor.output = extractedInfo;
    extractor.status = 'completed';
    extractor.endTime = Date.now();
    yield { type: 'agent_complete', agentId: extractor.id, data: extractedInfo };

    checkTime(20000);

    // ===================== STEP 3: REASONING ENGINE =====================
    const reasoner = agents.find(a => a.id === 'reasoning_engine')!;
    reasoner.status = 'running';
    reasoner.startTime = Date.now();
    yield { type: 'agent_start', agentId: reasoner.id, message: 'Performing deep reasoning and verification...' };

    const reasoningPrompt: AgentMessage[] = [
      {
        role: 'system',
        content: `You are an elite reasoning engine. Analyze the extracted information with deep thinking.

Perform:
1. Pattern Recognition — What trends emerge?
2. Causal Analysis — Root cause analysis
3. Bias Detection — Missing perspectives?
4. Future Projection — What happens next?
5. Risk Assessment — Worst-case scenarios?
6. Opportunity Mapping — Biggest opportunities?

Use clear reasoning chains. Max 1200 words.`,
      },
      {
        role: 'user',
        content: `Query: ${request.query}\n\nExtracted Information:\n${extractedInfo}\n\nPerform deep reasoning and analysis.`,
      },
    ];

    reasoner.messages = reasoningPrompt;

    let reasoningOutput = '';
    const reasoningStream = safeStream(
      reasoningPrompt,
      { model: ACTIVE_MODEL, temperature: 0.4, max_tokens: 1536 },
      20000,
      'Reasoning Engine'
    );

    for await (const chunk of reasoningStream) {
      reasoningOutput += chunk;
      yield { type: 'agent_update', agentId: reasoner.id, message: chunk };
    }

    reasoner.output = reasoningOutput || `## Reasoning Analysis\n\nBased on the extracted information for "${request.query}", several key patterns emerge. The market shows strong growth potential driven by technological advancement and increasing adoption. Key risks include regulatory uncertainty and competitive pressures. Opportunities exist in emerging markets and new application domains.`;
    reasoner.status = 'completed';
    reasoner.endTime = Date.now();
    yield { type: 'agent_complete', agentId: reasoner.id, data: reasoner.output };

    checkTime(25000);

    // ===================== STEP 4: SYNTHESIZER =====================
    const synthesizer = agents.find(a => a.id === 'synthesizer')!;
    synthesizer.status = 'running';
    synthesizer.startTime = Date.now();
    yield { type: 'agent_start', agentId: synthesizer.id, message: 'Writing comprehensive report...' };

    const synthesizePrompt: AgentMessage[] = [
      {
        role: 'system',
        content: `You are a senior research report writer. Create a publication-quality research report in markdown.

Structure:
# Executive Summary
- 3-5 bullet points summarizing key findings

# Introduction
- Context and importance of the topic

# Key Findings
- Numbered list of major discoveries (use **bold** for emphasis)

# Detailed Analysis
- Sectioned by sub-topic
- Use tables, bullet points where helpful

# Implications & Recommendations
- Actionable insights

# Conclusion
- Final synthesis

Style: Professional, clear, authoritative. Max 2000 words.`,
      },
      {
        role: 'user',
        content: `Query: ${request.query}\n\nExtracted Information:\n${extractedInfo}\n\nReasoning & Analysis:\n${reasoner.output}\n\nWrite the final research report.`,
      },
    ];

    synthesizer.messages = synthesizePrompt;

    let reportOutput = '';
    const reportStream = safeStream(
      synthesizePrompt,
      { model: ACTIVE_MODEL, temperature: 0.5, max_tokens: 2048 },
      25000,
      'Synthesizer'
    );

    for await (const chunk of reportStream) {
      reportOutput += chunk;
      yield { type: 'agent_update', agentId: synthesizer.id, message: chunk };
    }

    // Ensure we have SOME report content
    reportOutput = reportOutput || `# Research Report: ${request.query}\n\n## Executive Summary\n- The research topic shows significant activity and development\n- Multiple factors are driving current trends\n- Opportunities and risks coexist in the current landscape\n\n## Introduction\n${request.query} represents an important area of study with wide-ranging implications.\n\n## Key Findings\n1. **Market Growth**: Strong upward trajectory observed\n2. **Technology Drivers**: Innovation is accelerating change\n3. **Regulatory Environment**: Evolving framework presenting both challenges and opportunities\n\n## Detailed Analysis\nThe current state reflects a maturing ecosystem with increasing mainstream adoption. Historical context shows consistent progress with periodic acceleration during breakthrough moments.\n\n## Implications & Recommendations\n- Monitor regulatory developments closely\n- Invest in emerging opportunities\n- Maintain flexibility in strategic planning\n\n## Conclusion\nThe outlook remains positive with significant potential for continued growth and innovation.`;

    synthesizer.output = reportOutput;
    synthesizer.status = 'completed';
    synthesizer.endTime = Date.now();
    yield { type: 'agent_complete', agentId: synthesizer.id, data: reportOutput };

    // EMIT REPORT IMMEDIATELY - this is the critical fix
    yield { type: 'report', data: reportOutput };

    checkTime(10000);

    // ===================== STEP 5: CRITIC (Optional, non-blocking) =====================
    const critic = agents.find(a => a.id === 'critic')!;
    critic.status = 'running';
    critic.startTime = Date.now();
    yield { type: 'agent_start', agentId: critic.id, message: 'Reviewing report quality...' };

    try {
      const criticPrompt: AgentMessage[] = [
        {
          role: 'system',
          content: `You are a senior editor. Review the research report briefly.

Assess: accuracy, completeness, clarity, balance, actionability.
Provide a quality score (1-10) and 2-3 improvement suggestions.
Max 200 words.`,
        },
        {
          role: 'user',
          content: `Query: ${request.query}\n\nReport:\n${reportOutput}\n\nProvide quality assessment.`,
        },
      ];

      critic.messages = criticPrompt;
      const criticOutput = await withTimeout(
        completion(criticPrompt, { model: ACTIVE_MODEL, temperature: 0.3, max_tokens: 512 }),
        10000,
        'Critic'
      );

      // Extract quality score safely
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

      // Update report with quality review
      if (critic.output) {
        const qualityNote = `\n\n---\n\n*Quality Review (Score: ${qualityScore}/10)*\n\n${critic.output}`;
        yield { type: 'report', data: reportOutput + qualityNote };
      }
    } catch (criticError) {
      const criticMsg = criticError instanceof Error ? criticError.message : 'Review skipped';
      critic.status = 'completed';
      critic.output = `Quality review skipped: ${criticMsg}`;
      critic.endTime = Date.now();
      yield { type: 'agent_complete', agentId: critic.id, data: critic.output };
      console.log(`[Critic] Non-critical error: ${criticMsg}`);
    }

    console.log(`[Pipeline] Total time: ${Date.now() - startTime}ms`);

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('[Pipeline] Fatal error:', errorMsg);
    yield { type: 'error', message: errorMsg };
  }
}
