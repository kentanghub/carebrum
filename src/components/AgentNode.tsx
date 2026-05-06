'use client';

import { motion } from 'framer-motion';
import { AgentState } from '@/types';
import {
  Brain,
  Eye,
  GitBranch,
  FileText,
  CheckCircle,
  Loader2,
  Sparkles,
  AlertCircle,
} from 'lucide-react';

const iconMap: Record<string, React.ReactNode> = {
  Brain: <Brain className="w-5 h-5" />,
  Eye: <Eye className="w-5 h-5" />,
  GitBranch: <GitBranch className="w-5 h-5" />,
  FileText: <FileText className="w-5 h-5" />,
  CheckCircle: <CheckCircle className="w-5 h-5" />,
};

const statusConfig = {
  idle: {
    border: 'border-white/[0.04]',
    bg: 'bg-white/[0.02]',
    text: 'text-gray-500',
    icon: null,
    glow: '',
  },
  running: {
    border: 'border-green-500/30',
    bg: 'bg-green-500/[0.08]',
    text: 'text-green-300',
    icon: <Loader2 className="w-4 h-4 animate-spin text-green-400" />,
    glow: 'shadow-[0_0_20px_rgba(34,197,94,0.15)]',
  },
  completed: {
    border: 'border-emerald-500/30',
    bg: 'bg-emerald-500/[0.08]',
    text: 'text-emerald-300',
    icon: <Sparkles className="w-4 h-4 text-emerald-400" />,
    glow: 'shadow-[0_0_20px_rgba(16,185,129,0.1)]',
  },
  error: {
    border: 'border-rose-500/30',
    bg: 'bg-rose-500/[0.08]',
    text: 'text-rose-300',
    icon: <AlertCircle className="w-4 h-4 text-rose-400" />,
    glow: 'shadow-[0_0_20px_rgba(239,68,68,0.1)]',
  },
};

const agentColors: Record<string, string> = {
  orchestrator: 'from-green-500 to-emerald-500',
  multimodal_extractor: 'from-teal-500 to-green-500',
  reasoning_engine: 'from-lime-500 to-green-500',
  synthesizer: 'from-emerald-500 to-green-500',
  critic: 'from-green-400 to-emerald-400',
};

const agentGlowColors: Record<string, string> = {
  orchestrator: 'shadow-green-500/20',
  multimodal_extractor: 'shadow-teal-500/20',
  reasoning_engine: 'shadow-lime-500/20',
  synthesizer: 'shadow-emerald-500/20',
  critic: 'shadow-green-400/20',
};

interface AgentNodeProps {
  agent: AgentState;
  isActive: boolean;
  index: number;
}

export default function AgentNode({ agent, isActive, index }: AgentNodeProps) {
  const status = statusConfig[agent.status];
  const colorClass = agentColors[agent.id] || 'from-green-500 to-emerald-500';
  const glowColor = agentGlowColors[agent.id] || 'shadow-green-500/20';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: index * 0.1, duration: 0.4, ease: 'easeOut' }}
      className={`relative rounded-xl border ${status.border} ${status.bg} ${status.glow} ${
        isActive ? `ring-1 ring-green-500/30 ${glowColor} shadow-[0_0_30px_rgba(34,197,94,0.15)]` : ''
      } overflow-hidden transition-all duration-500`}
    >
      {/* Active shimmer effect */}
      {isActive && (
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"
          animate={{ x: ['-100%', '100%'] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
        />
      )}

      <div className="relative p-4">
        <div className="flex items-center gap-3">
          {/* Icon with gradient */}
          <div
            className={`relative flex-shrink-0 w-10 h-10 rounded-lg bg-gradient-to-br ${colorClass} flex items-center justify-center text-white shadow-lg`}
          >
            {iconMap[agent.icon] || <Brain className="w-5 h-5" />}
            {isActive && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full border-2 border-[#030806] animate-pulse" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h3 className={`font-semibold text-sm ${status.text}`}>
                {agent.name}
              </h3>
              <div className="flex items-center gap-1.5">
                {status.icon}
                <span
                  className={`text-[10px] uppercase tracking-wider font-medium ${status.text} opacity-70`}
                >
                  {agent.status}
                </span>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
              {agent.description}
            </p>
          </div>
        </div>

        {/* Model badge */}
        {agent.model && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.04] text-gray-500 border border-white/[0.04] font-mono">
              {agent.model}
            </span>
            {agent.startTime && agent.endTime && (
              <span className="text-[10px] text-gray-600 font-mono">
                {(agent.endTime - agent.startTime) / 1000}s
              </span>
            )}
          </div>
        )}

        {/* Output preview */}
        {agent.output && agent.status === 'completed' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-3 pt-3 border-t border-white/[0.04]"
          >
            <p className="text-xs text-gray-400 line-clamp-3 leading-relaxed">
              {agent.output.substring(0, 200)}
              {agent.output.length > 200 ? '...' : ''}
            </p>
          </motion.div>
        )}
      </div>

      {/* Bottom gradient line */}
      {isActive && (
        <motion.div
          className={`h-0.5 bg-gradient-to-r ${colorClass}`}
          layoutId={`agent-line-${agent.id}`}
        />
      )}
    </motion.div>
  );
}
