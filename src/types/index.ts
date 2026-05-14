export interface AgentMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AgentState {
  id: string;
  name: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  model?: string;
  provider?: string;
  description: string;
  icon: string;
  messages: AgentMessage[];
  output?: string;
  startTime?: number;
  endTime?: number;
  tokenCount?: number;
  /** Confidence score from verification */
  confidence?: 'high' | 'medium' | 'low';
}

export interface ResearchRequest {
  query: string;
  sources?: string[];
  depth?: 'quick' | 'standard' | 'deep' | 'academic';
  multimodal?: boolean;
  history?: AgentMessage[];
  mode?: 'research' | 'followup' | 'compare' | 'timeline' | 'academic';
  compareTopics?: [string, string];
  /** Research template to use */
  template?: string;
  /** Maximum refinement iterations (default: 2) */
  maxIterations?: number;
  /** Uploaded document content for RAG */
  documentContent?: string;
  /** Preferred LLM provider */
  provider?: string;
}

export interface ResearchResponse {
  success: boolean;
  report?: string;
  agents: AgentState[];
  error?: string;
}

export interface StreamEvent {
  type: 'agent_start' | 'agent_update' | 'agent_complete' | 'agent_token' | 'report' | 'report_token' | 'report_clear' | 'error' | 'sources' | 'followup_ready' | 'progress' | 'verification' | 'iteration' | 'structured_data' | 'knowledge_update';
  agentId?: string;
  data?: any;
  message?: string;
  token?: string;
  progress?: number;
  step?: number;
  /** Current iteration (for refinement loop) */
  iteration?: number;
  /** Max iterations */
  maxIterations?: number;
}

export interface SearchSource {
  title: string;
  snippet: string;
  url: string;
  source: string;
  fullContent?: string;
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
  wordCount?: number;
  readingTime?: number;
  template?: string;
  iterations?: number;
  verificationScore?: string;
  /** Knowledge graph nodes from this session */
  knowledgeNodes?: KnowledgeNode[];
}

export interface AcademicPaper {
  title: string;
  authors: string[];
  abstract: string;
  url: string;
  year: number;
  citationCount: number;
  source: 'semantic_scholar' | 'arxiv';
  paperId?: string;
}

export interface TOCItem {
  id: string;
  title: string;
  level: number;
  children: TOCItem[];
}

// ===== NEW TYPES FOR TIER 2-3 FEATURES =====

/** Verification result for a single claim */
export interface VerificationResult {
  claim: string;
  confidence: 'high' | 'medium' | 'low';
  sources: string[];
  contradictions: string[];
  notes: string;
}

/** Structured data extracted from research */
export interface StructuredData {
  tables: Array<{ title: string; headers: string[]; rows: string[][] }>;
  statistics: Array<{ label: string; value: string; source: string }>;
  quotes: Array<{ text: string; attribution: string; source: string }>;
  timeline: Array<{ date: string; event: string }>;
}

/** Research template configuration */
export interface ResearchTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  systemPrompts: Record<string, string>;
  outputFormat: string;
  depth: 'quick' | 'standard' | 'deep';
  agentConfig?: Partial<Record<string, { model?: string; temperature?: number }>>;
}

/** Knowledge graph node */
export interface KnowledgeNode {
  id: string;
  label: string;
  type: 'concept' | 'entity' | 'finding' | 'source';
  properties: Record<string, string>;
  connections: Array<{ targetId: string; relation: string }>;
  sessionId: string;
  timestamp: number;
}

/** Plugin/tool definition for agents */
export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, { type: string; description: string; required?: boolean }>;
  execute: (params: Record<string, any>) => Promise<string>;
}
