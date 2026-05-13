'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AgentState, StreamEvent, ResearchRequest, SearchSource, AgentMessage, ResearchSession } from '@/types';
import AgentNode from './AgentNode';
import TimelineView from './TimelineView';
import MindMapView from './MindMapView';
import Logo from './Logo';
import NeuralBackground from './NeuralBackground';
import ReportTOC from './ReportTOC';
import ExportModal from './ExportModal';
import CommandPalette from './CommandPalette';
import SkeletonLoader from './SkeletonLoader';
import {
  Sparkles, Zap, BookOpen, Telescope, Loader2, Download, Terminal, Play, Square,
  ExternalLink, CheckCircle2, BrainCircuit, Code2, FileText, Mic, MicOff,
  History, X, MessageSquare, GitCompare, Clock, Share2, ChevronDown, Network,
  Copy, Keyboard, GraduationCap, Eye, Search,
} from 'lucide-react';

const DEPTH_OPTIONS = [
  { value: 'quick', label: 'Quick Scan', desc: 'Overview in ~30s', icon: <Zap className="w-4 h-4" />, color: 'from-blue-500 to-cyan-500' },
  { value: 'standard', label: 'Standard', desc: 'Balanced depth ~2min', icon: <BookOpen className="w-4 h-4" />, color: 'from-emerald-500 to-green-500' },
  { value: 'deep', label: 'Deep Research', desc: 'Thorough analysis ~5min', icon: <Telescope className="w-4 h-4" />, color: 'from-green-500 to-lime-500' },
  { value: 'academic', label: 'Academic', desc: 'Scholarly papers & citations', icon: <GraduationCap className="w-4 h-4" />, color: 'from-purple-500 to-violet-500' },
];

const SAMPLE_QUERIES = [
  'Impact of generative AI on software development in 2025',
  'Sustainable energy adoption barriers in Southeast Asia',
  'The future of decentralized finance and regulatory challenges',
  'Quantum computing applications in pharmaceutical drug discovery',
];

const COMPARE_SAMPLES = [
  ['React vs Vue.js in 2025', 'Which framework is better for new projects?'],
  ['Remote work vs Office work', 'Productivity and employee satisfaction comparison'],
  ['Electric vehicles vs Hydrogen cars', 'Which is the future of transportation?'],
];

const DEFAULT_AGENTS = [
  { id: 'orchestrator', name: 'Orchestrator Agent', status: 'idle' as const, description: 'Analyzes query and plans research strategy', icon: 'Brain', messages: [] },
  { id: 'multimodal_extractor', name: 'Web Extractor', status: 'idle' as const, description: 'Extracts and enriches information from multiple sources', icon: 'Eye', messages: [] },
  { id: 'reasoning_engine', name: 'Reasoning Engine', status: 'idle' as const, description: 'Performs deep chain-of-thought reasoning and verification', icon: 'GitBranch', messages: [] },
  { id: 'synthesizer', name: 'Report Synthesizer', status: 'idle' as const, description: 'Synthesizes findings into comprehensive report', icon: 'FileText', messages: [] },
  { id: 'critic', name: 'Quality Critic', status: 'idle' as const, description: 'Reviews and refines final output for accuracy', icon: 'CheckCircle', messages: [] },
  { id: 'verifier', name: 'Fact Checker', status: 'idle' as const, description: 'Verifies claims against sources with confidence scoring', icon: 'Shield', messages: [] },
];

const TEMPLATE_OPTIONS = [
  { id: 'general', name: 'General Research', icon: '🔬', desc: 'Balanced analysis for any topic' },
  { id: 'market_analysis', name: 'Market Analysis', icon: '📊', desc: 'Industry, competitors, market size' },
  { id: 'literature_review', name: 'Literature Review', icon: '📚', desc: 'Academic papers & methodologies' },
  { id: 'competitor_analysis', name: 'Competitor Analysis', icon: '🏢', desc: 'Deep dive into competitors' },
  { id: 'policy_brief', name: 'Policy Brief', icon: '🏛️', desc: 'Government policy analysis' },
  { id: 'technical_deep_dive', name: 'Technical Deep Dive', icon: '⚙️', desc: 'Architecture & implementation' },
];

export default function ResearchDashboard() {
  // ─── Core State ──────────────────────────────────────────────────────────
  const [query, setQuery] = useState('');
  const [depth, setDepth] = useState<'quick' | 'standard' | 'deep' | 'academic'>('standard');
  const [isRunning, setIsRunning] = useState(false);
  const [agents, setAgents] = useState<AgentState[]>([]);
  const [report, setReport] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // ─── New Features State ──────────────────────────────────────────────────
  const [sources, setSources] = useState<SearchSource[]>([]);
  const [history, setHistory] = useState<AgentMessage[]>([]);
  const [followUpQuery, setFollowUpQuery] = useState('');
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [sessions, setSessions] = useState<ResearchSession[]>([]);
  const [mode, setMode] = useState<'research' | 'followup' | 'compare'>('research');
  const [compareA, setCompareA] = useState('');
  const [compareB, setCompareB] = useState('');
  const recognitionRef = useRef<any>(null);
  const [reportView, setReportView] = useState<'report' | 'timeline' | 'mindmap'>('report');

  // ─── Template & Document state ───────────────────────────────────────────
  const [selectedTemplate, setSelectedTemplate] = useState('general');
  const [documentContent, setDocumentContent] = useState('');
  const [documentName, setDocumentName] = useState('');
  const [currentIteration, setCurrentIteration] = useState(0);
  const [maxIterations, setMaxIterations] = useState(2);
  const [verificationResult, setVerificationResult] = useState('');
  const [showTemplates, setShowTemplates] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Stream state ────────────────────────────────────────────────────────
  const [streamingReport, setStreamingReport] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);
  const [pipelineProgress, setPipelineProgress] = useState(0);
  const [pipelineStep, setPipelineStep] = useState(0);

  // ─── Export & Command Palette ────────────────────────────────────────────
  const [showExport, setShowExport] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);

  // ─── Reading stats ───────────────────────────────────────────────────────
  const wordCount = report ? report.split(/\s+/).filter(Boolean).length : 0;
  const readingTime = Math.max(1, Math.ceil(wordCount / 200));

  // ─── Load sessions from localStorage ─────────────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem('carebrum_sessions');
      if (saved) setSessions(JSON.parse(saved));
    } catch {}
  }, []);

  // ─── Keyboard shortcuts ──────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K / Ctrl+K → Command palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowCommandPalette(prev => !prev);
      }
      // Escape → Close overlays
      if (e.key === 'Escape') {
        if (showCommandPalette) setShowCommandPalette(false);
        else if (showExport) setShowExport(false);
        else if (showHistory) setShowHistory(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showCommandPalette, showExport, showHistory]);

  // ─── Auto-scroll report when streaming ───────────────────────────────────
  useEffect(() => {
    if (isStreaming && reportRef.current) {
      reportRef.current.scrollTop = reportRef.current.scrollHeight;
    }
  }, [streamingReport, isStreaming]);

  const saveSession = useCallback((q: string, r: string, s: SearchSource[]) => {
    const session: ResearchSession = {
      id: Date.now().toString(),
      query: q,
      report: r,
      sources: s,
      timestamp: Date.now(),
      depth,
      history: [...history, { role: 'user', content: q }, { role: 'assistant', content: r }],
      wordCount: r.split(/\s+/).filter(Boolean).length,
      readingTime: Math.max(1, Math.ceil(r.split(/\s+/).filter(Boolean).length / 200)),
    };
    setSessions(prev => {
      const updated = [session, ...prev].slice(0, 50);
      try { localStorage.setItem('carebrum_sessions', JSON.stringify(updated)); } catch {}
      return updated;
    });
  }, [depth, history]);

  // ─── Voice Input ─────────────────────────────────────────────────────────
  const toggleVoice = useCallback(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      addLog('⚠ Voice input not supported in this browser');
      return;
    }
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'id-ID';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results).map((r: any) => r[0].transcript).join('');
      setQuery(transcript);
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognition.start();
    recognitionRef.current = recognition;
    setIsListening(true);
  }, [isListening]);

  // ─── Logs ────────────────────────────────────────────────────────────────
  const addLog = useCallback((message: string) => {
    setLogs((prev) => [...prev.slice(-100), message]);
  }, []);

  // ─── Document Upload ─────────────────────────────────────────────────────
  const handleDocumentUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setDocumentName(file.name);
    addLog(`📄 Loading document: ${file.name}`);

    try {
      if (file.type === 'application/pdf') {
        // For PDF, we'll send the text content (server-side PDF parsing would need a library)
        const text = await file.text();
        setDocumentContent(text);
        addLog(`✓ Document loaded: ${file.name} (${text.length} chars)`);
      } else {
        // Text, markdown, etc.
        const text = await file.text();
        setDocumentContent(text);
        addLog(`✓ Document loaded: ${file.name} (${text.length} chars)`);
      }
    } catch (err) {
      addLog(`✗ Failed to load document: ${err}`);
    }
  }, [addLog]);

  // ─── Command Palette Commands ────────────────────────────────────────────
  const commands = [
    { id: 'start', label: 'Start Research', shortcut: 'Enter', icon: <Play className="w-4 h-4" />, action: () => runResearch() },
    { id: 'stop', label: 'Stop Research', shortcut: 'Esc', icon: <Square className="w-4 h-4" />, action: () => stopResearch() },
    { id: 'history', label: 'Toggle History', shortcut: '', icon: <History className="w-4 h-4" />, action: () => setShowHistory(!showHistory) },
    { id: 'export', label: 'Export Report', shortcut: '', icon: <Download className="w-4 h-4" />, action: () => setShowExport(true) },
    { id: 'copy', label: 'Copy Report', shortcut: '', icon: <Copy className="w-4 h-4" />, action: () => shareReport() },
    { id: 'voice', label: 'Toggle Voice Input', shortcut: '', icon: <Mic className="w-4 h-4" />, action: () => toggleVoice() },
  ];

  // ─── Main Research Runner ────────────────────────────────────────────────
  const runResearch = async () => {
    if (!query.trim() || isRunning) return;

    setIsRunning(true);
    setReport('');
    setStreamingReport('');
    setIsStreaming(true);
    setLogs([]);
    setSources([]);
    setAgents(DEFAULT_AGENTS.map(a => ({ ...a, status: 'idle' as const })));
    setActiveAgent(null);
    setShowReport(false);
    setShowFollowUp(false);
    setMode('research');
    setPipelineProgress(0);
    setPipelineStep(0);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const researchMode = depth === 'academic' ? 'academic' : 'research';
      const request: ResearchRequest = {
        query,
        depth,
        mode: researchMode as any,
        template: selectedTemplate,
        maxIterations,
        documentContent: documentContent || undefined,
      };

      const response = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error(`Failed: ${response.status} ${response.statusText}`);

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim() === '' || line.includes('[DONE]')) continue;
          if (line.startsWith('data: ')) {
            try {
              const event: StreamEvent = JSON.parse(line.slice(6));
              handleEvent(event);
            } catch {}
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        addLog('✗ Research cancelled');
      } else if (error instanceof Error) {
        addLog(`✗ Error: ${error.message}`);
      }
    } finally {
      setIsRunning(false);
      setIsStreaming(false);
      setActiveAgent(null);
    }
  };

  // ─── Follow-up Runner ────────────────────────────────────────────────────
  const runFollowUp = async () => {
    if (!followUpQuery.trim() || isRunning) return;
    const userMsg: AgentMessage = { role: 'user', content: followUpQuery };
    const assistantMsg: AgentMessage = { role: 'assistant', content: report };
    const newHistory = [...history, userMsg, assistantMsg];
    setHistory(newHistory);
    setQuery(followUpQuery);
    setFollowUpQuery('');
    setIsRunning(true);
    setReport('');
    setStreamingReport('');
    setIsStreaming(true);
    setLogs([]);
    setSources([]);
    setAgents(DEFAULT_AGENTS.map(a => ({ ...a, status: 'idle' as const })));
    setShowReport(false);
    setShowFollowUp(false);
    setMode('followup');
    setPipelineProgress(0);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const request: ResearchRequest = { query: followUpQuery, depth, mode: 'followup', history: newHistory };
      const response = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Failed: ${response.status}`);
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.trim() === '' || line.includes('[DONE]')) continue;
          if (line.startsWith('data: ')) {
            try {
              const event: StreamEvent = JSON.parse(line.slice(6));
              handleEvent(event);
            } catch {}
          }
        }
      }
    } catch (error) {
      if (error instanceof Error) addLog(`✗ Error: ${error.message}`);
    } finally {
      setIsRunning(false);
      setIsStreaming(false);
      setActiveAgent(null);
    }
  };

  // ─── Compare Mode ────────────────────────────────────────────────────────
  const runCompare = async () => {
    if (!compareA.trim() || !compareB.trim() || isRunning) return;
    const compareQuery = `Compare and contrast: "${compareA}" vs "${compareB}". Provide a detailed side-by-side analysis covering: 1) Key differences, 2) Pros and cons of each, 3) Use cases where each excels, 4) Final recommendation.`;
    setQuery(compareQuery);
    setMode('compare');
    setTimeout(() => runResearch(), 100);
  };

  // ─── Event Handler ───────────────────────────────────────────────────────
  const handleEvent = (event: StreamEvent) => {
    switch (event.type) {
      case 'agent_start':
        setAgents((prev) => {
          const exists = prev.find((a) => a.id === event.agentId);
          if (exists) return prev.map((a) => a.id === event.agentId ? { ...a, status: 'running' } : a);
          return prev;
        });
        setActiveAgent(event.agentId || null);
        if (event.message) addLog(`→ ${event.agentId}: ${event.message}`);
        break;

      case 'agent_update':
        if (event.message) {
          const cleanMsg = event.message.replace(/\n/g, ' ').trim();
          if (cleanMsg.length > 5) addLog(`  ${cleanMsg.substring(0, 120)}${cleanMsg.length > 120 ? '...' : ''}`);
        }
        break;

      case 'agent_token':
        // Stream token to the active agent's output
        if (event.agentId && event.token) {
          setAgents(prev => prev.map(a =>
            a.id === event.agentId
              ? { ...a, output: (a.output || '') + event.token }
              : a
          ));
        }
        break;

      case 'report_token':
        // Stream report tokens in real-time
        if (event.token) {
          setStreamingReport(prev => prev + event.token);
          setShowReport(true);
        }
        break;

      case 'agent_complete':
        setAgents((prev) => {
          const exists = prev.find((a) => a.id === event.agentId);
          if (exists) return prev.map((a) => a.id === event.agentId ? { ...a, status: 'completed', output: event.data } : a);
          return prev;
        });
        if (event.message) addLog(`✓ ${event.agentId}: completed`);
        break;

      case 'sources':
        setSources(event.data || []);
        addLog(`✓ Found ${event.data?.length || 0} web sources`);
        break;

      case 'report':
        setReport(event.data || '');
        setStreamingReport(event.data || '');
        setShowReport(true);
        setIsStreaming(false);
        addLog('✓ Report generated');
        setHistory(prev => [...prev, { role: 'user', content: query }, { role: 'assistant', content: event.data || '' }]);
        saveSession(query, event.data || '', sources);
        break;

      case 'progress':
        if (event.progress !== undefined) setPipelineProgress(event.progress);
        if (event.step !== undefined) setPipelineStep(event.step);
        if (event.message) addLog(`📊 ${event.message}`);
        break;

      case 'iteration':
        if (event.iteration !== undefined) setCurrentIteration(event.iteration);
        if (event.maxIterations !== undefined) setMaxIterations(event.maxIterations);
        addLog(`🔄 Refinement iteration ${event.iteration}/${event.maxIterations}`);
        break;

      case 'verification':
        if (event.data) {
          setVerificationResult(typeof event.data === 'string' ? event.data : JSON.stringify(event.data));
          addLog('🛡️ Source verification complete');
        }
        break;

      case 'structured_data':
        addLog('📋 Structured data extracted');
        break;

      case 'knowledge_update':
        addLog(`🧠 Knowledge graph updated: ${event.data?.nodeCount || 0} nodes`);
        break;

      case 'followup_ready':
        setShowFollowUp(true);
        break;

      case 'error':
        addLog(`✗ Error: ${event.message}`);
        break;
    }
  };

  const stopResearch = () => {
    abortRef.current?.abort();
    setIsRunning(false);
    setIsStreaming(false);
  };

  const shareReport = () => {
    const text = `# ${query}\n\n${report}`;
    navigator.clipboard.writeText(text).then(() => addLog('✓ Report copied to clipboard'));
  };

  const loadSession = (session: ResearchSession) => {
    setQuery(session.query);
    setReport(session.report);
    setStreamingReport(session.report);
    setSources(session.sources);
    setShowReport(true);
    setShowHistory(false);
    setHistory(session.history || []);
    setShowFollowUp(true);
    setIsStreaming(false);
  };

  const completedCount = agents.filter((a) => a.status === 'completed').length;
  const totalCount = DEFAULT_AGENTS.length;
  const progress = agents.length > 0 ? (completedCount / totalCount) * 100 : 0;

  // Pipeline step labels
  const PIPELINE_STEPS = ['Search & Crawl', 'Orchestrator', 'Extract & Analyze', 'Synthesize & Refine', 'Verify & Review'];

  return (
    <div className="relative min-h-screen bg-[#030806] text-gray-200 overflow-x-hidden">
      <NeuralBackground />

      {/* Header */}
      <header className="relative z-10 border-b border-white/[0.04] backdrop-blur-xl bg-[#030806]/60">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo size={36} animated />
            <div>
              <h1 className="font-bold text-lg text-green-400 tracking-tight drop-shadow-sm">Cerebrum</h1>
              <p className="text-[10px] text-gray-400 -mt-0.5 tracking-wide uppercase">Multi-Agent Research System</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCommandPalette(true)}
              className="p-2 rounded-lg hover:bg-white/[0.04] text-gray-400 hover:text-white transition-colors"
              title="Command Palette (⌘K)"
            >
              <Keyboard className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="p-2 rounded-lg hover:bg-white/[0.04] text-gray-400 hover:text-white transition-colors"
              title="Research History"
            >
              <History className="w-4 h-4" />
            </button>
            <span className="hidden sm:flex items-center gap-1.5 text-[10px] text-gray-400 px-2.5 py-1 rounded-full bg-white/[0.03] border border-white/[0.04]">
              <Sparkles className="w-3 h-3 text-green-400" />
              Powered by AI
            </span>
          </div>
        </div>
      </header>

      {/* History Sidebar — full-screen overlay on mobile */}
      <AnimatePresence>
        {showHistory && (
          <>
            {/* Mobile backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowHistory(false)}
              className="fixed inset-0 bg-black/50 z-40 sm:hidden"
            />
            <motion.div
              initial={{ x: -300, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -300, opacity: 0 }}
              className="fixed inset-0 sm:left-0 sm:top-16 sm:bottom-0 sm:w-80 w-full z-50 bg-[#0a0f0d] border-r border-white/[0.06] p-4 overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-300">Research History</h3>
                <button onClick={() => setShowHistory(false)} className="text-gray-500 hover:text-white p-2">
                  <X className="w-4 h-4" />
                </button>
              </div>
              {sessions.length === 0 ? (
                <p className="text-xs text-gray-500">No research history yet</p>
              ) : (
                <div className="space-y-2">
                  {sessions.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => loadSession(s)}
                      className="w-full text-left p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] hover:border-green-500/20 hover:bg-white/[0.04] transition-all"
                    >
                      <p className="text-xs text-gray-300 line-clamp-2">{s.query}</p>
                      <p className="text-[10px] text-gray-500 mt-1">
                        {new Date(s.timestamp).toLocaleDateString()} • {s.depth} • {s.sources?.length || 0} sources
                        {s.readingTime && ` • ${s.readingTime} min read`}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="relative z-10 max-w-[1600px] mx-auto px-4 sm:px-6 py-8">
        {/* Input Section */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="glass-strong rounded-2xl p-6 sm:p-8">
            {/* Mode Tabs */}
            <div className="flex gap-2 mb-5">
              <button
                onClick={() => setMode('research')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all ${
                  mode === 'research' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-white/[0.03] text-gray-400 border border-white/[0.04]'
                }`}
              >
                <BrainCircuit className="w-3 h-3" /> Research
              </button>
              <button
                onClick={() => setMode('compare')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all ${
                  mode === 'compare' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-white/[0.03] text-gray-400 border border-white/[0.04]'
                }`}
              >
                <GitCompare className="w-3 h-3" /> Compare
              </button>
            </div>

            {mode === 'research' ? (
              <>
                <div className="mb-5">
                  <label className="block text-sm font-medium text-gray-400 mb-2">Ask Anything</label>
                  <div className="relative">
                    <textarea
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); runResearch(); }
                        else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runResearch(); }
                      }}
                      placeholder="Any question, any topic — from global politics to local policy. Try: 'What's the future of AI?'"
                      className="w-full h-24 sm:h-28 p-4 pr-20 rounded-xl bg-white/[0.03] border border-white/[0.06] focus:border-green-500/50 focus:ring-1 focus:ring-green-500/20 resize-none text-sm text-gray-200 placeholder:text-gray-600 transition-all outline-none"
                      disabled={isRunning}
                    />
                    <div className="absolute bottom-3 right-3 flex items-center gap-2">
                      <button
                        onClick={toggleVoice}
                        className={`p-2 rounded-lg transition-all min-w-[44px] min-h-[44px] flex items-center justify-center ${
                          isListening ? 'bg-red-500/20 text-red-400 animate-pulse' : 'text-gray-600 hover:text-green-400'
                        }`}
                        title="Voice input"
                      >
                        {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                      </button>
                      <span className="text-[10px] text-gray-600 font-mono">{query.length}</span>
                    </div>
                  </div>
                </div>

                {!query && !isRunning && (
                  <div className="mb-5">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Try asking</p>
                    <div className="flex flex-wrap gap-2">
                      {SAMPLE_QUERIES.map((q) => (
                        <button key={q} onClick={() => setQuery(q)}
                          className="text-xs px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.04] text-gray-400 hover:text-gray-200 hover:border-white/[0.08] hover:bg-white/[0.05] transition-all">
                          {q.length > 50 ? q.slice(0, 50) + '...' : q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="mb-5 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Topic A</label>
                    <input value={compareA} onChange={(e) => setCompareA(e.target.value)} placeholder="e.g., React"
                      className="w-full p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] focus:border-blue-500/50 text-sm text-gray-200 placeholder:text-gray-600 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Topic B</label>
                    <input value={compareB} onChange={(e) => setCompareB(e.target.value)} placeholder="e.g., Vue.js"
                      className="w-full p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] focus:border-blue-500/50 text-sm text-gray-200 placeholder:text-gray-600 outline-none" />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {COMPARE_SAMPLES.map(([a]) => (
                    <button key={a} onClick={() => { setCompareA(a.split(' vs ')[0]); setCompareB(a.split(' vs ')[1]); }}
                      className="text-xs px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.04] text-gray-400 hover:text-gray-200 transition-all">
                      {a}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Template Selector */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] text-gray-500 uppercase tracking-wider">Research Template</label>
                <button onClick={() => setShowTemplates(!showTemplates)} className="text-[10px] text-gray-500 hover:text-green-400 transition-colors">
                  {showTemplates ? 'Hide' : 'Show all'}
                </button>
              </div>
              <div className={`grid gap-2 ${showTemplates ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3'}`}>
                {TEMPLATE_OPTIONS.filter(t => showTemplates || ['general', 'market_analysis', 'literature_review'].includes(t.id)).map((tmpl) => (
                  <button
                    key={tmpl.id}
                    onClick={() => setSelectedTemplate(tmpl.id)}
                    disabled={isRunning}
                    className={`flex items-center gap-2 p-3 rounded-xl border text-left transition-all ${
                      selectedTemplate === tmpl.id
                        ? 'border-green-500/30 bg-green-500/[0.08]'
                        : 'border-white/[0.04] bg-white/[0.02] hover:border-white/[0.08]'
                    }`}
                  >
                    <span className="text-lg">{tmpl.icon}</span>
                    <div>
                      <div className={`text-xs font-medium ${selectedTemplate === tmpl.id ? 'text-green-300' : 'text-gray-300'}`}>{tmpl.name}</div>
                      <div className="text-[9px] text-gray-500">{tmpl.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Document Upload (RAG) */}
            <div className="mb-5">
              <label className="text-[10px] text-gray-500 uppercase tracking-wider mb-2 block">Document Context (Optional)</label>
              <div
                onClick={() => fileInputRef.current?.click()}
                className={`flex items-center gap-3 p-3 rounded-xl border border-dashed cursor-pointer transition-all ${
                  documentName ? 'border-green-500/30 bg-green-500/[0.05]' : 'border-white/[0.08] bg-white/[0.02] hover:border-white/[0.15]'
                }`}
              >
                <input ref={fileInputRef} type="file" className="hidden" accept=".txt,.md,.json,.csv,.pdf,.html" onChange={handleDocumentUpload} />
                {documentName ? (
                  <>
                    <FileText className="w-4 h-4 text-green-400" />
                    <div className="flex-1">
                      <p className="text-xs text-gray-300">{documentName}</p>
                      <p className="text-[10px] text-gray-500">{documentContent.length} chars • Click to replace</p>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); setDocumentContent(''); setDocumentName(''); }} className="text-gray-500 hover:text-red-400">
                      <X className="w-3 h-3" />
                    </button>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-gray-500" />
                    <div>
                      <p className="text-xs text-gray-400">Upload a document for RAG context</p>
                      <p className="text-[10px] text-gray-500">.txt, .md, .json, .csv, .html — agents will reference this</p>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Depth Selector */}
            <div className="mb-5">
              <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-2">Research Depth</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {DEPTH_OPTIONS.map((option) => (
                  <button key={option.value}
                    onClick={() => !isRunning && setDepth(option.value as any)}
                    disabled={isRunning}
                    className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border transition-all duration-300 min-h-[88px] ${
                      depth === option.value
                        ? 'border-green-500/30 bg-green-500/[0.08] shadow-[0_0_20px_rgba(34,197,94,0.1)]'
                        : 'border-white/[0.04] bg-white/[0.02] hover:border-white/[0.08] hover:bg-white/[0.03]'
                    }`}>
                    <div className={`p-1.5 rounded-md bg-gradient-to-br ${option.color} text-white`}>{option.icon}</div>
                    <div className="text-center">
                      <div className={`text-xs font-medium ${depth === option.value ? 'text-green-300' : 'text-gray-300'}`}>{option.label}</div>
                      <div className="text-[10px] text-gray-500 mt-0.5">{option.desc}</div>
                    </div>
                    {depth === option.value && <motion.div layoutId="depth-indicator" className="absolute inset-0 rounded-xl ring-1 ring-green-500/20" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Action button */}
            <div className="flex justify-end gap-2">
              <motion.button
                onClick={mode === 'compare' ? runCompare : runResearch}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                disabled={mode === 'compare' ? (!compareA.trim() || !compareB.trim()) : !query.trim()}
                className={`flex items-center gap-2 px-8 py-3 rounded-xl font-semibold text-base transition-all ${
                  isRunning
                    ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20'
                    : 'bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg shadow-green-500/20 hover:shadow-green-500/30'
                }`}>
                {isRunning ? <><Square className="w-4 h-4" /> Stop</> : <><Play className="w-4 h-4" /> Start Research</>}
              </motion.button>
            </div>
          </div>
        </motion.div>

        {/* ─── Horizontal Pipeline Strip (replaces 3-col pipeline) ─────────── */}
        {isRunning && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mb-6">
            {/* Progress bar */}
            <div className="flex items-center justify-between text-[10px] text-gray-500 mb-2">
              <span>Research Progress</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/[0.04] overflow-hidden mb-3">
              <motion.div className="h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-500" animate={{ width: `${progress}%` }} transition={{ duration: 0.5 }} />
            </div>

            {/* Pipeline step strip */}
            <div className="flex items-center justify-center gap-1 flex-wrap">
              {PIPELINE_STEPS.map((step, i) => (
                <div key={i} className="flex items-center">
                  <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] transition-all ${
                    i < pipelineStep ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : i === pipelineStep ? 'bg-green-500/20 text-green-400 border border-green-500/30 animate-pulse'
                    : 'bg-white/[0.02] text-gray-600 border border-white/[0.04]'
                  }`}>
                    {i < pipelineStep ? <CheckCircle2 className="w-3 h-3" /> : i === pipelineStep ? <Loader2 className="w-3 h-3 animate-spin" /> : <span className="w-3 h-3 rounded-full bg-white/[0.06]" />}
                    <span>{step}</span>
                  </div>
                  {i < PIPELINE_STEPS.length - 1 && (
                    <div className={`w-4 h-0.5 mx-0.5 ${i < pipelineStep ? 'bg-emerald-500/40' : 'bg-white/[0.04]'}`} />
                  )}
                </div>
              ))}
              {/* Iteration badge */}
              {currentIteration > 0 && (
                <div className="ml-2 px-2 py-1 rounded-full bg-amber-500/20 text-amber-400 text-[10px] border border-amber-500/30">
                  🔄 Iteration {currentIteration}/{maxIterations}
                </div>
              )}
              {/* Document badge */}
              {documentName && (
                <div className="ml-1 px-2 py-1 rounded-full bg-blue-500/20 text-blue-400 text-[10px] border border-blue-500/30">
                  📄 RAG
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* ─── Two Column Grid: Agents + Report ────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Agents + Sources + Logs */}
          <div className="lg:col-span-4 xl:col-span-3 space-y-4 order-2 lg:order-1">
            <div className="flex items-center gap-2 mb-3">
              <BrainCircuit className="w-4 h-4 text-green-400" />
              <h2 className="text-sm font-semibold text-gray-300">Agent Swarm</h2>
              {agents.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/[0.04] text-gray-500 font-mono">
                  {completedCount}/{totalCount}
                </span>
              )}
            </div>

            <div className="space-y-3">
              <AnimatePresence mode="popLayout">
                {agents.length === 0 && !isRunning ? (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass rounded-xl p-8 text-center">
                    <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-white/[0.03] flex items-center justify-center">
                      <Sparkles className="w-5 h-5 text-gray-600" />
                    </div>
                    <p className="text-xs text-gray-500">Agents will appear here</p>
                    <p className="text-[10px] text-gray-600 mt-1">Start a research query above</p>
                  </motion.div>
                ) : agents.length === 0 && isRunning ? (
                  <SkeletonLoader count={5} />
                ) : (
                  agents.map((agent, i) => (
                    <AgentNode key={agent.id} agent={agent} isActive={activeAgent === agent.id} index={i} />
                  ))
                )}
              </AnimatePresence>
            </div>

            {/* Sources Panel with snippets */}
            {sources.length > 0 && (
              <div className="mt-4">
                <div className="flex items-center gap-2 mb-2">
                  <ExternalLink className="w-3.5 h-3.5 text-gray-500" />
                  <h3 className="text-[10px] text-gray-500 uppercase tracking-wider">Web Sources ({sources.length})</h3>
                </div>
                <div className="glass rounded-xl p-3 max-h-64 overflow-y-auto space-y-2 custom-scrollbar">
                  {sources.map((s, i) => (
                    <a key={i} href={s.url} target="_blank" rel="noopener noreferrer"
                      className="group block p-2.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-all border border-white/[0.03] hover:border-green-500/20">
                      <div className="flex items-start gap-2">
                        <span className="text-xs mt-0.5">{getSourceEmoji(s.source)}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] text-green-400 truncate group-hover:text-green-300 transition-colors">{s.title}</p>
                          <p className="text-[10px] text-gray-500 line-clamp-2 mt-0.5 leading-relaxed">{s.snippet}</p>
                          <p className="text-[9px] text-gray-600 truncate mt-1">{s.url}</p>
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Color-coded Logs */}
            <div className="mt-4">
              <div className="flex items-center gap-2 mb-2">
                <Terminal className="w-3.5 h-3.5 text-gray-500" />
                <h3 className="text-[10px] text-gray-500 uppercase tracking-wider">System Logs</h3>
              </div>
              <div className="glass rounded-xl p-3 h-52 overflow-y-auto font-mono text-[11px] leading-relaxed space-y-0.5 custom-scrollbar">
                {logs.length === 0 ? (
                  <span className="text-gray-600">Waiting for research...</span>
                ) : (
                  logs.map((log, i) => (
                    <div key={i} className={`break-all ${
                      log.startsWith('✓') ? 'text-emerald-400'
                      : log.startsWith('✗') ? 'text-rose-400'
                      : log.startsWith('→') ? 'text-blue-400'
                      : log.startsWith('📊') ? 'text-amber-400'
                      : log.startsWith('⚠') ? 'text-yellow-400'
                      : 'text-gray-400'
                    }`}>
                      {log}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right: Report (wider, 8 cols) */}
          <div className="lg:col-span-8 xl:col-span-9 order-1 lg:order-2">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-green-400" />
                <h2 className="text-sm font-semibold text-gray-300">Research Report</h2>
                {report && (
                  <span className="text-[10px] text-gray-500 px-2 py-0.5 rounded-full bg-white/[0.03] border border-white/[0.04]">
                    {wordCount} words • {readingTime} min read
                  </span>
                )}
              </div>
              {report && (
                <div className="flex items-center gap-2">
                  <button onClick={shareReport}
                    className="flex items-center gap-1.5 text-[10px] text-gray-400 hover:text-green-400 transition-colors px-2 py-1 rounded-lg bg-white/[0.03] border border-white/[0.04] hover:border-green-500/20 min-h-[44px]">
                    <Copy className="w-3 h-3" /> Copy
                  </button>
                  <button onClick={() => setShowExport(true)}
                    className="flex items-center gap-1.5 text-[10px] text-gray-400 hover:text-green-400 transition-colors px-2 py-1 rounded-lg bg-white/[0.03] border border-white/[0.04] hover:border-green-500/20 min-h-[44px]">
                    <Download className="w-3 h-3" /> Export
                  </button>
                </div>
              )}
            </div>
            <div className="glass rounded-xl p-5 min-h-[400px] sm:min-h-[600px]">
              {!showReport || (!report && !streamingReport) ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-16">
                  <div className="relative w-20 h-20 mx-auto mb-4">
                    <div className="absolute inset-0 rounded-full bg-green-500/10 animate-pulse" />
                    <div className="relative w-full h-full flex items-center justify-center">
                      <FileText className="w-8 h-8 text-green-400/50" />
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">Your research report will appear here</p>
                  <p className="text-[10px] text-gray-600 mt-1 max-w-[200px]">Start a research query and watch the agents collaborate in real-time</p>
                </div>
              ) : (
                <>
                  {/* View Tabs + TOC toggle */}
                  <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
                    <div className="flex gap-1 p-1 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                      <button onClick={() => setReportView('report')}
                        className={`px-3 py-1.5 rounded-md text-xs transition-all ${reportView === 'report' ? 'bg-green-500/20 text-green-400' : 'text-gray-400 hover:text-white'}`}>
                        <FileText className="w-3 h-3 inline mr-1" />Report
                      </button>
                      <button onClick={() => setReportView('timeline')}
                        className={`px-3 py-1.5 rounded-md text-xs transition-all ${reportView === 'timeline' ? 'bg-green-500/20 text-green-400' : 'text-gray-400 hover:text-white'}`}>
                        <Clock className="w-3 h-3 inline mr-1" />Timeline
                      </button>
                      <button onClick={() => setReportView('mindmap')}
                        className={`px-3 py-1.5 rounded-md text-xs transition-all ${reportView === 'mindmap' ? 'bg-green-500/20 text-green-400' : 'text-gray-400 hover:text-white'}`}>
                        <Network className="w-3 h-3 inline mr-1" />Mind Map
                      </button>
                    </div>
                  </div>

                  <AnimatePresence mode="wait">
                    {reportView === 'report' && (
                      <motion.div key="report" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                        {/* TOC */}
                        <ReportTOC report={report || streamingReport} />
                        {/* Report content */}
                        <div ref={reportRef} id="report-content" className="prose-invert max-w-none">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{isStreaming ? streamingReport : report}</ReactMarkdown>
                          {isStreaming && (
                            <span className="inline-block w-2 h-4 bg-green-400 animate-pulse ml-0.5" />
                          )}
                        </div>
                      </motion.div>
                    )}
                    {reportView === 'timeline' && (
                      <motion.div key="timeline" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <TimelineView report={report} query={query} />
                      </motion.div>
                    )}
                    {reportView === 'mindmap' && (
                      <motion.div key="mindmap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <MindMapView report={report} query={query} />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Verification Results */}
                  {verificationResult && !isRunning && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-4 pt-4 border-t border-white/[0.06]">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-sm">🛡️</span>
                        <span className="text-xs text-gray-400 font-medium">Source Verification</span>
                      </div>
                      <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] text-xs text-gray-400 leading-relaxed max-h-48 overflow-y-auto custom-scrollbar">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{verificationResult}</ReactMarkdown>
                      </div>
                    </motion.div>
                  )}

                  {/* Follow-up Section */}
                  {showFollowUp && !isRunning && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                      className="mt-6 pt-4 border-t border-white/[0.06]">
                      <div className="flex items-center gap-2 mb-3">
                        <MessageSquare className="w-4 h-4 text-green-400" />
                        <span className="text-xs text-gray-400">Ask a follow-up question</span>
                      </div>
                      <div className="flex gap-2">
                        <input
                          value={followUpQuery}
                          onChange={(e) => setFollowUpQuery(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') runFollowUp(); }}
                          placeholder="e.g., 'Tell me more about point #3' or 'What about the risks?'"
                          className="flex-1 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] focus:border-green-500/50 text-sm text-gray-200 placeholder:text-gray-600 outline-none"
                        />
                        <button
                          onClick={runFollowUp}
                          disabled={!followUpQuery.trim()}
                          className="px-4 py-2 rounded-xl bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30 transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed min-w-[44px] min-h-[44px] flex items-center justify-center"
                        >
                          <Play className="w-4 h-4" />
                        </button>
                      </div>
                    </motion.div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-16 pt-8 border-t border-white/[0.04] text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Logo size={24} />
            <span className="text-sm font-semibold text-green-400">Cerebrum</span>
          </div>
          <p className="text-[10px] text-gray-500">Multi-Agent Research System • Powered by AI</p>
          <p className="text-[10px] text-gray-600 mt-1">
            <kbd className="px-1 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] text-[9px]">⌘K</kbd> Command Palette
            <span className="mx-2">•</span>
            <kbd className="px-1 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] text-[9px]">⌘↵</kbd> Start Research
          </p>
        </footer>
      </main>

      {/* Export Modal */}
      <ExportModal isOpen={showExport} onClose={() => setShowExport(false)} report={report} query={query} />

      {/* Command Palette */}
      <CommandPalette isOpen={showCommandPalette} onClose={() => setShowCommandPalette(false)} commands={commands} />
    </div>
  );
}

function getSourceEmoji(source: string): string {
  switch (source) {
    case 'tavily': return '🔍';
    case 'brave': return '🦁';
    case 'serper': return '🔎';
    case 'duckduckgo': return '🦆';
    case 'jina': return '📄';
    default: return '🌐';
  }
}
