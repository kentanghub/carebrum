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
import {
  Sparkles, Zap, BookOpen, Telescope, Loader2, Download, Terminal, Play, Square,
  ExternalLink, CheckCircle2, BrainCircuit, Code2, FileText, Mic, MicOff,
  History, X, MessageSquare, GitCompare, Clock, Share2, ChevronDown, Network,
} from 'lucide-react';

const DEPTH_OPTIONS = [
  { value: 'quick', label: 'Quick Scan', desc: 'Overview in ~30s', icon: <Zap className="w-4 h-4" />, color: 'from-blue-500 to-cyan-500' },
  { value: 'standard', label: 'Standard', desc: 'Balanced depth ~2min', icon: <BookOpen className="w-4 h-4" />, color: 'from-emerald-500 to-green-500' },
  { value: 'deep', label: 'Deep Research', desc: 'Thorough analysis ~5min', icon: <Telescope className="w-4 h-4" />, color: 'from-green-500 to-lime-500' },
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
];

export default function ResearchDashboard() {
  // ─── Core State ──────────────────────────────────────────────────────────
  const [query, setQuery] = useState('');
  const [depth, setDepth] = useState<'quick' | 'standard' | 'deep'>('standard');
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

  // ─── Load sessions from localStorage ─────────────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem('carebrum_sessions');
      if (saved) setSessions(JSON.parse(saved));
    } catch {}
  }, []);

  const saveSession = useCallback((q: string, r: string, s: SearchSource[]) => {
    const session: ResearchSession = {
      id: Date.now().toString(),
      query: q,
      report: r,
      sources: s,
      timestamp: Date.now(),
      depth,
      history: [...history, { role: 'user', content: q }, { role: 'assistant', content: r }],
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
      const transcript = Array.from(event.results)
        .map((r: any) => r[0].transcript)
        .join('');
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

  // ─── Main Research Runner ────────────────────────────────────────────────
  const runResearch = async () => {
    if (!query.trim() || isRunning) return;

    setIsRunning(true);
    setReport('');
    setLogs([]);
    setSources([]);
    setAgents(DEFAULT_AGENTS.map(a => ({ ...a, status: 'idle' as const })));
    setActiveAgent(null);
    setShowReport(false);
    setShowFollowUp(false);
    setMode('research');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const request: ResearchRequest = { query, depth };

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
    setLogs([]);
    setSources([]);
    setAgents(DEFAULT_AGENTS.map(a => ({ ...a, status: 'idle' as const })));
    setShowReport(false);
    setShowFollowUp(false);
    setMode('followup');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const request: ResearchRequest = {
        query: followUpQuery,
        depth,
        mode: 'followup',
        history: newHistory,
      };

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
      setActiveAgent(null);
    }
  };

  // ─── Compare Mode ────────────────────────────────────────────────────────
  const runCompare = async () => {
    if (!compareA.trim() || !compareB.trim() || isRunning) return;
    const compareQuery = `Compare and contrast: "${compareA}" vs "${compareB}". Provide a detailed side-by-side analysis covering: 1) Key differences, 2) Pros and cons of each, 3) Use cases where each excels, 4) Final recommendation.`;
    setQuery(compareQuery);
    setMode('compare');
    // Trigger research with the compare query
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
        setShowReport(true);
        addLog('✓ Report generated');
        // Save to history
        setHistory(prev => [...prev, { role: 'user', content: query }, { role: 'assistant', content: event.data || '' }]);
        // Save session
        saveSession(query, event.data || '', sources);
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
  };

  const downloadReport = () => {
    const blob = new Blob([report], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = query.replace(/[^a-zA-Z0-9\u4e00-\u9fff\s-]/g, '').trim().slice(0, 50) || 'research';
    a.download = `carebrum-${safeName.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const loadSession = (session: ResearchSession) => {
    setQuery(session.query);
    setReport(session.report);
    setSources(session.sources);
    setShowReport(true);
    setShowHistory(false);
    setHistory(session.history || []);
    setShowFollowUp(true);
  };

  const shareReport = () => {
    const text = `# ${query}\n\n${report}`;
    navigator.clipboard.writeText(text).then(() => addLog('✓ Report copied to clipboard'));
  };

  const completedCount = agents.filter((a) => a.status === 'completed').length;
  const totalCount = 5;
  const progress = agents.length > 0 ? (completedCount / totalCount) * 100 : 0;

  return (
    <div className="relative min-h-screen bg-[#030806] text-gray-200 overflow-x-hidden">
      <NeuralBackground />

      {/* Header */}
      <header className="relative z-10 border-b border-white/[0.04] backdrop-blur-xl bg-[#030806]/60">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo size={36} animated />
            <div>
              <h1 className="font-bold text-lg text-green-400 tracking-tight drop-shadow-sm">Carebrum</h1>
              <p className="text-[10px] text-gray-400 -mt-0.5 tracking-wide uppercase">Multi-Agent Research System</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
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
            <a href="https://github.com/kentanghub/carebrum" target="_blank" rel="noopener noreferrer"
              className="p-2 rounded-lg hover:bg-white/[0.04] text-gray-400 hover:text-white transition-colors">
              <Code2 className="w-4 h-4" />
            </a>
          </div>
        </div>
      </header>

      {/* History Sidebar */}
      <AnimatePresence>
        {showHistory && (
          <motion.div
            initial={{ x: -300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -300, opacity: 0 }}
            className="fixed left-0 top-16 bottom-0 w-80 z-50 bg-[#0a0f0d] border-r border-white/[0.06] p-4 overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-300">Research History</h3>
              <button onClick={() => setShowHistory(false)} className="text-gray-500 hover:text-white">
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
                    </p>
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="relative z-10 max-w-[1400px] mx-auto px-4 sm:px-6 py-8">
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
                {/* Research Input */}
                <div className="mb-5">
                  <label className="block text-sm font-medium text-gray-400 mb-2">Ask Anything</label>
                  <div className="relative">
                    <textarea
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runResearch(); } }}
                      placeholder="Any question, any topic — from global politics to local policy. Try: 'What's the future of AI?'"
                      className="w-full h-20 sm:h-28 p-4 pr-20 rounded-xl bg-white/[0.03] border border-white/[0.06] focus:border-green-500/50 focus:ring-1 focus:ring-green-500/20 resize-none text-sm text-gray-200 placeholder:text-gray-600 transition-all outline-none"
                      disabled={isRunning}
                    />
                    <div className="absolute bottom-3 right-3 flex items-center gap-2">
                      <button
                        onClick={toggleVoice}
                        className={`p-1.5 rounded-lg transition-all ${
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

                {/* Quick suggestions */}
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
              /* Compare Mode */
              <div className="mb-5 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Topic A</label>
                    <input
                      value={compareA}
                      onChange={(e) => setCompareA(e.target.value)}
                      placeholder="e.g., React"
                      className="w-full p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] focus:border-blue-500/50 text-sm text-gray-200 placeholder:text-gray-600 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Topic B</label>
                    <input
                      value={compareB}
                      onChange={(e) => setCompareB(e.target.value)}
                      placeholder="e.g., Vue.js"
                      className="w-full p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] focus:border-blue-500/50 text-sm text-gray-200 placeholder:text-gray-600 outline-none"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {COMPARE_SAMPLES.map(([a, b]) => (
                    <button key={a} onClick={() => { setCompareA(a.split(' vs ')[0]); setCompareB(a.split(' vs ')[1]); }}
                      className="text-xs px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.04] text-gray-400 hover:text-gray-200 transition-all">
                      {a}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Depth Selector */}
            <div className="mb-5">
              <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-2">Research Depth</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {DEPTH_OPTIONS.map((option) => (
                  <button key={option.value}
                    onClick={() => !isRunning && setDepth(option.value as any)}
                    disabled={isRunning}
                    className={`relative flex flex-col items-center gap-2 p-3 rounded-xl border transition-all duration-300 ${
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
                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-medium text-sm transition-all ${
                  isRunning
                    ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20'
                    : 'bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg shadow-green-500/20 hover:shadow-green-500/30'
                }`}>
                {isRunning ? <><Square className="w-4 h-4" /> Stop</> : <><Play className="w-4 h-4" /> Start Research</>}
              </motion.button>
            </div>
          </div>
        </motion.div>

        {/* Progress Bar */}
        {isRunning && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mb-6">
            <div className="flex items-center justify-between text-[10px] text-gray-500 mb-1.5">
              <span>Research Progress</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
              <motion.div className="h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-500" animate={{ width: `${progress}%` }} transition={{ duration: 0.5 }} />
            </div>
          </motion.div>
        )}

        {/* Three Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Agents + Sources */}
          <div className="lg:col-span-4 space-y-4 order-2 lg:order-1">
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
                {agents.length === 0 ? (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass rounded-xl p-8 text-center">
                    <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-white/[0.03] flex items-center justify-center">
                      <Sparkles className="w-5 h-5 text-gray-600" />
                    </div>
                    <p className="text-xs text-gray-500">Agents will appear here</p>
                    <p className="text-[10px] text-gray-600 mt-1">Start a research query above</p>
                  </motion.div>
                ) : (
                  agents.map((agent, i) => (
                    <AgentNode key={agent.id} agent={agent} isActive={activeAgent === agent.id} index={i} />
                  ))
                )}
              </AnimatePresence>
            </div>

            {/* Sources Panel */}
            {sources.length > 0 && (
              <div className="mt-4">
                <div className="flex items-center gap-2 mb-2">
                  <ExternalLink className="w-3.5 h-3.5 text-gray-500" />
                  <h3 className="text-[10px] text-gray-500 uppercase tracking-wider">Web Sources ({sources.length})</h3>
                </div>
                <div className="glass rounded-xl p-3 max-h-48 overflow-y-auto space-y-2">
                  {sources.map((s, i) => (
                    <a key={i} href={s.url} target="_blank" rel="noopener noreferrer"
                      className="block p-2 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-all border border-white/[0.03]">
                      <p className="text-[11px] text-green-400 truncate">{s.title}</p>
                      <p className="text-[10px] text-gray-500 truncate">{s.url}</p>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Logs */}
            <div className="mt-4">
              <div className="flex items-center gap-2 mb-2">
                <Terminal className="w-3.5 h-3.5 text-gray-500" />
                <h3 className="text-[10px] text-gray-500 uppercase tracking-wider">System Logs</h3>
              </div>
              <div className="glass rounded-xl p-3 h-52 overflow-y-auto font-mono text-[11px] leading-relaxed space-y-1">
                {logs.length === 0 ? (
                  <span className="text-gray-400">Waiting...</span>
                ) : (
                  logs.map((log, i) => (
                    <div key={i} className="text-gray-200 break-all">
                      <span className="text-gray-100">{log}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Center: Pipeline */}
          <div className="lg:col-span-3 order-3 lg:order-2">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-semibold text-gray-300">Pipeline</h2>
            </div>
            <div className="glass rounded-xl p-4 min-h-[80px] lg:min-h-[400px] flex flex-col items-center justify-center">
              {agents.length === 0 ? (
                <div className="text-center">
                  <div className="relative w-20 h-20 mx-auto mb-4">
                    <div className="absolute inset-0 rounded-full bg-green-500/10 animate-pulse" />
                    <div className="absolute inset-2 rounded-full bg-green-500/5" />
                    <div className="relative w-full h-full flex items-center justify-center">
                      <BrainCircuit className="w-8 h-8 text-green-400/50" />
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">Research pipeline visualization</p>
                  <p className="text-[10px] text-gray-600 mt-1">Will show agent connections</p>
                </div>
              ) : (
                <div className="w-full flex flex-row lg:flex-col items-center justify-center gap-0">
                  {agents.map((agent, i) => (
                    <div key={agent.id} className="flex items-center">
                      <div className="flex flex-col items-center">
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ delay: i * 0.15 }}
                          className={`relative w-10 h-10 lg:w-12 lg:h-12 rounded-full flex items-center justify-center ${
                            agent.status === 'running' ? 'bg-green-500/20 text-green-400 ring-2 ring-green-500/30'
                              : agent.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400'
                              : 'bg-white/[0.03] text-gray-600'
                          }`}>
                          {agent.status === 'running' && <Loader2 className="w-4 h-4 lg:w-5 lg:h-5 animate-spin" />}
                          {agent.status === 'completed' && <CheckCircle2 className="w-4 h-4 lg:w-5 lg:h-5" />}
                          {agent.status === 'idle' && <span className="text-[10px] lg:text-xs font-mono">{i + 1}</span>}
                        </motion.div>
                        <span className="text-[9px] lg:text-[10px] text-gray-500 mt-1 text-center max-w-[60px] lg:max-w-[80px] leading-tight">
                          {agent.name.split(' ')[0]}
                        </span>
                      </div>
                      {i < agents.length - 1 && (
                        <motion.div initial={{ width: 0, height: 0 }} animate={{ width: 24, height: 2 }}
                          className={`mx-1 lg:hidden ${agent.status === 'completed' ? 'bg-emerald-500/40' : 'bg-white/[0.04]'}`} />
                      )}
                      {i < agents.length - 1 && (
                        <motion.div initial={{ height: 0 }} animate={{ height: 24 }} transition={{ delay: i * 0.15 + 0.1 }}
                          className={`w-0.5 my-1 hidden lg:block ${agent.status === 'completed' ? 'bg-emerald-500/40' : 'bg-white/[0.04]'}`} />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: Report */}
          <div className="lg:col-span-5 order-1 lg:order-3">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-green-400" />
                <h2 className="text-sm font-semibold text-gray-300">Research Report</h2>
              </div>
              {report && (
                <div className="flex items-center gap-2">
                  <button onClick={shareReport}
                    className="flex items-center gap-1.5 text-[10px] text-gray-400 hover:text-green-400 transition-colors px-2 py-1 rounded-lg bg-white/[0.03] border border-white/[0.04] hover:border-green-500/20">
                    <Share2 className="w-3 h-3" /> Copy
                  </button>
                  <button onClick={downloadReport}
                    className="flex items-center gap-1.5 text-[10px] text-gray-400 hover:text-green-400 transition-colors px-2 py-1 rounded-lg bg-white/[0.03] border border-white/[0.04] hover:border-green-500/20">
                    <Download className="w-3 h-3" /> Download MD
                  </button>
                </div>
              )}
            </div>
            <div className="glass rounded-xl p-5 min-h-[400px]">
              {!showReport || !report ? (
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
                  {/* View Tabs */}
                  <div className="flex gap-1 mb-4 p-1 rounded-lg bg-white/[0.02] border border-white/[0.04] w-fit">
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

                  {reportView === 'report' && (
                    <div id="report-content" className="prose-invert max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{report}</ReactMarkdown>
                    </div>
                  )}
                  {reportView === 'timeline' && <TimelineView report={report} query={query} />}
                  {reportView === 'mindmap' && <MindMapView report={report} query={query} />}

                  {/* Follow-up Section */}
                  {showFollowUp && !isRunning && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-6 pt-4 border-t border-white/[0.06]"
                    >
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
                          className="px-4 py-2 rounded-xl bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30 transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed"
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
        <footer className="mt-12 pt-8 border-t border-white/[0.04] text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Logo size={24} />
            <span className="text-sm font-semibold text-green-400">Carebrum</span>
          </div>
          <p className="text-[10px] text-gray-500">Multi-Agent Research System • Powered by AI</p>
          <div className="flex items-center justify-center gap-4 mt-3">
            <a href="https://github.com/kentanghub/carebrum" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-green-400 transition-colors">
              <Code2 className="w-3 h-3" /> GitHub
            </a>
            <a href="https://carebrum.vercel.app" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-green-400 transition-colors">
              <ExternalLink className="w-3 h-3" /> Live Demo
            </a>
          </div>
        </footer>
      </main>
    </div>
  );
}
