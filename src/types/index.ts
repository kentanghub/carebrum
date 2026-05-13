export interface AgentMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AgentState {
  id: string;
  name: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  model?: string;
  description: string;
  icon: string;
  messages: AgentMessage[];
  output?: string;
  startTime?: number;
  endTime?: number;
}

export interface ResearchRequest {
  query: string;
  sources?: string[];
  depth?: 'quick' | 'standard' | 'deep';
  multimodal?: boolean;
  /** Previous conversation for follow-up context */
  history?: AgentMessage[];
  /** Research mode: 'research' for new, 'followup' for follow-up */
  mode?: 'research' | 'followup' | 'compare' | 'timeline';
  /** For compare mode: two topics to compare */
  compareTopics?: [string, string];
}

export interface ResearchResponse {
  success: boolean;
  report?: string;
  agents: AgentState[];
  error?: string;
}

export interface StreamEvent {
  type: 'agent_start' | 'agent_update' | 'agent_complete' | 'report' | 'error' | 'sources' | 'followup_ready';
  agentId?: string;
  data?: any;
  message?: string;
}

export interface SearchSource {
  title: string;
  snippet: string;
  url: string;
  source: string;
}

export interface ResearchSession {
  id: string;
  query: string;
  report: string;
  sources: SearchSource[];
  timestamp: number;
  depth: string;
  history: AgentMessage[];
}
