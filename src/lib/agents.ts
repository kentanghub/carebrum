import { AgentState, AgentMessage, StreamEvent, ResearchRequest } from '@/types';
import { mimoCompletion, streamMimoCompletion, MIMO_MODELS } from './mimo-client';

const AGENT_DEFINITIONS = {
  ORCHESTRATOR: {
    id: 'orchestrator',
    name: 'Orchestrator Agent',
    model: MIMO_MODELS.PRO,
    description: 'Coordinates the entire research workflow and delegates tasks',
    icon: 'Brain',
  },
  MULTIMODAL_EXTRACTOR: {
    id: 'multimodal_extractor',
    name: 'Multimodal Extractor',
    model: MIMO_MODELS.OMNI,
    description: 'Extracts information from text, images, audio, and video sources',
    icon: 'Eye',
  },
  REASONING_ENGINE: {
    id: 'reasoning_engine',
    name: 'Reasoning Engine',
    model: MIMO_MODELS.PRO,
    description: 'Performs deep chain-of-thought reasoning and fact verification',
    icon: 'GitBranch',
  },
  SYNTHESIZER: {
    id: 'synthesizer',
    name: 'Report Synthesizer',
    model: MIMO_MODELS.PRO,
    description: 'Synthesizes findings into comprehensive, structured reports',
    icon: 'FileText',
  },
  CRITIC: {
    id: 'critic',
    name: 'Quality Critic',
    model: MIMO_MODELS.PRO,
    description: 'Reviews and critiques the final output for accuracy and completeness',
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

export async function* runResearchPipeline(
  request: ResearchRequest,
  agents: AgentState[]
): AsyncGenerator<StreamEvent> {
  try {
    // Step 1: Orchestrator analyzes the query and plans the research
    const orchestrator = agents.find(a => a.id === 'orchestrator')!;
    orchestrator.status = 'running';
    orchestrator.startTime = Date.now();
    yield { type: 'agent_start', agentId: orchestrator.id, message: 'Analyzing research query...' };

    const planPrompt: AgentMessage[] = [
      {
        role: 'system',
        content: `You are an expert research orchestrator. Analyze the user's query and create a detailed research plan.
        Identify key aspects to investigate, potential sources, and the depth of analysis needed.
        Respond with a structured plan in markdown format.`,
      },
      {
        role: 'user',
        content: `Query: ${request.query}\nDepth: ${request.depth || 'standard'}\nMultimodal: ${request.multimodal ? 'yes' : 'no'}`,
      },
    ];

    orchestrator.messages = planPrompt;
    const plan = await mimoCompletion(planPrompt, { model: MIMO_MODELS.PRO, temperature: 0.3 });
    orchestrator.output = plan;
    orchestrator.status = 'completed';
    orchestrator.endTime = Date.now();
    yield { type: 'agent_complete', agentId: orchestrator.id, data: plan };

    // Step 2: Multimodal Extraction (simulated with text analysis)
    const extractor = agents.find(a => a.id === 'multimodal_extractor')!;
    extractor.status = 'running';
    extractor.startTime = Date.now();
    yield { type: 'agent_start', agentId: extractor.id, message: 'Extracting and analyzing information...' };

    const extractPrompt: AgentMessage[] = [
      {
        role: 'system',
        content: `You are a multimodal information extractor. Given a research query and plan, extract all relevant facts, data points, and insights.
        If multimodal sources are mentioned, describe what information would be extracted from images, audio, or video.
        Be thorough and extract as much relevant detail as possible.`,
      },
      {
        role: 'user',
        content: `Query: ${request.query}\n\nResearch Plan:\n${plan}\n\nPlease extract all relevant information and present it in a structured format.`,
      },
    ];

    extractor.messages = extractPrompt;
    const extractedInfo = await mimoCompletion(extractPrompt, { model: MIMO_MODELS.OMNI, temperature: 0.2, max_tokens: 8192 });
    extractor.output = extractedInfo;
    extractor.status = 'completed';
    extractor.endTime = Date.now();
    yield { type: 'agent_complete', agentId: extractor.id, data: extractedInfo };

    // Step 3: Reasoning Engine performs deep analysis
    const reasoner = agents.find(a => a.id === 'reasoning_engine')!;
    reasoner.status = 'running';
    reasoner.startTime = Date.now();
    yield { type: 'agent_start', agentId: reasoner.id, message: 'Performing deep chain-of-thought reasoning...' };

    const reasoningPrompt: AgentMessage[] = [
      {
        role: 'system',
        content: `You are an expert reasoning engine. Perform deep chain-of-thought analysis on the extracted information.
        Identify patterns, causal relationships, potential biases, and gaps in information.
        Use step-by-step reasoning and verify facts through multiple angles.
        Highlight any uncertainties or areas needing further investigation.`,
      },
      {
        role: 'user',
        content: `Query: ${request.query}\n\nExtracted Information:\n${extractedInfo}\n\nPerform deep reasoning and analysis.`,
      },
    ];

    reasoner.messages = reasoningPrompt;
    
    // Stream the reasoning process
    let reasoningOutput = '';
    for await (const chunk of streamMimoCompletion(reasoningPrompt, { model: MIMO_MODELS.PRO, temperature: 0.4 })) {
      reasoningOutput += chunk;
      yield { type: 'agent_update', agentId: reasoner.id, message: chunk };
    }
    
    reasoner.output = reasoningOutput;
    reasoner.status = 'completed';
    reasoner.endTime = Date.now();
    yield { type: 'agent_complete', agentId: reasoner.id, data: reasoningOutput };

    // Step 4: Synthesizer creates the final report
    const synthesizer = agents.find(a => a.id === 'synthesizer')!;
    synthesizer.status = 'running';
    synthesizer.startTime = Date.now();
    yield { type: 'agent_start', agentId: synthesizer.id, message: 'Synthesizing comprehensive report...' };

    const synthesizePrompt: AgentMessage[] = [
      {
        role: 'system',
        content: `You are an expert report writer. Synthesize the reasoning and extracted information into a comprehensive, well-structured research report.
        Use markdown formatting with clear sections, bullet points, and highlights.
        Include an executive summary, key findings, detailed analysis, and recommendations.
        Ensure the report is factual, balanced, and actionable.`,
      },
      {
        role: 'user',
        content: `Query: ${request.query}\n\nExtracted Information:\n${extractedInfo}\n\nReasoning and Analysis:\n${reasoningOutput}\n\nCreate a comprehensive research report.`,
      },
    ];

    synthesizer.messages = synthesizePrompt;
    
    // Stream the report generation
    let reportOutput = '';
    for await (const chunk of streamMimoCompletion(synthesizePrompt, { model: MIMO_MODELS.PRO, temperature: 0.5 })) {
      reportOutput += chunk;
      yield { type: 'agent_update', agentId: synthesizer.id, message: chunk };
    }
    
    synthesizer.output = reportOutput;
    synthesizer.status = 'completed';
    synthesizer.endTime = Date.now();
    yield { type: 'agent_complete', agentId: synthesizer.id, data: reportOutput };

    // Step 5: Critic reviews the output
    const critic = agents.find(a => a.id === 'critic')!;
    critic.status = 'running';
    critic.startTime = Date.now();
    yield { type: 'agent_start', agentId: critic.id, message: 'Reviewing report quality...' };

    const criticPrompt: AgentMessage[] = [
      {
        role: 'system',
        content: `You are a quality assurance critic. Review the research report for accuracy, completeness, clarity, and bias.
        Provide a brief assessment and confirm the report meets high standards.
        Keep your response concise (2-3 sentences).`,
      },
      {
        role: 'user',
        content: `Query: ${request.query}\n\nReport:\n${reportOutput}\n\nProvide a quality assessment.`,
      },
    ];

    critic.messages = criticPrompt;
    const criticOutput = await mimoCompletion(criticPrompt, { model: MIMO_MODELS.PRO, temperature: 0.3 });
    critic.output = criticOutput;
    critic.status = 'completed';
    critic.endTime = Date.now();
    yield { type: 'agent_complete', agentId: critic.id, data: criticOutput };

    // Final report output
    yield { type: 'report', data: reportOutput };

  } catch (error) {
    yield { type: 'error', message: error instanceof Error ? error.message : 'Unknown error' };
  }
}
