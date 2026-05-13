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
  /** Number of tokens streamed for this agent */
  tokenCount?: number;
}

export interface ResearchRequest {
  query: string;
  sources?: string[];
  depth?: 'quick' | 'standard' | 'deep' | 'academic';
  multimodal?: boolean;
  /** Previous conversation for follow-up context */
  history?: AgentMessage[];
  /** Research mode: 'research' for new, 'followup' for follow-up */
  mode?: 'research' | 'followup' | 'compare' | 'timeline' | 'academic';
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
  type: 'agent_start' | 'agent_update' | 'agent_complete' | 'agent_token' | 'report' | 'report_token' | 'error' | 'sources' | 'followup_ready' | 'progress';
  agentId?: string;
  data?: any;
  message?: string;
  /** For token streaming */
  token?: string;
  /** For progress tracking */
  progress?: number;
  /** Current agent step index */
  step?: number;
}

export interface SearchSource {
  title: string;
  snippet: string;
  url: string;
  source: string;
  /** Full page content from Jina Reader */
  fullContent?: string;
  /** Relevance score */
  score?: number;
}

export interface ResearchSession {
  id: string;
  query: string;
  report: string;
  sources: SearchSource[];
  timestamp: number;
  depth: string;
  history: AgentMessage[];
  /** Word count of the report */
  wordCount?: number;
  /** Reading time in minutes */
  readingTime?: number;
}

export interface AcademicPaper {
  title: string;
  authors: string[];
  abstract: string;
  url: string;
  year: number;
  citationCount: number;
  source: 'semantic_scholar' | 'arxiv' | 'pubmed';
  paperId?: string;
}

export interface TOCItem {
  id: string;
  title: string;
  level: number; // 2 = h2, 3 = h3
  children: TOCItem[];
}
