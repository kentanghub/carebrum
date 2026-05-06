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
}

export interface ResearchResponse {
  success: boolean;
  report?: string;
  agents: AgentState[];
  error?: string;
}

export interface StreamEvent {
  type: 'agent_start' | 'agent_update' | 'agent_complete' | 'report' | 'error';
  agentId?: string;
  data?: any;
  message?: string;
}
