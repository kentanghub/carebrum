/**
 * Research Templates — Pre-built configurations for different research types.
 * Each template customizes agent prompts, output format, and analysis depth.
 */

import { ResearchTemplate } from '@/types';

export const TEMPLATES: ResearchTemplate[] = [
  {
    id: 'general',
    name: 'General Research',
    description: 'Balanced analysis for any topic',
    icon: '🔬',
    depth: 'standard',
    outputFormat: '## 📌 Executive Summary\n## 📊 Key Findings & Data\n## 🔍 Deep Analysis\n## 💡 Implications & Outlook\n## ✅ Conclusion',
    systemPrompts: {
      orchestrator: 'You are a research planning agent. Create a comprehensive research plan.',
      extractor: 'You are a data extraction agent. Extract key facts, statistics, and expert opinions.',
      reasoner: 'You are an analytical reasoning agent. Perform deep chain-of-thought analysis.',
      synthesizer: 'You are a professional report writer. Write clear, well-structured reports.',
      critic: 'You are a quality assurance agent. Review for accuracy, completeness, and bias.',
    },
  },
  {
    id: 'market_analysis',
    name: 'Market Analysis',
    description: 'Industry landscape, competitors, market size, trends',
    icon: '📊',
    depth: 'deep',
    outputFormat: '## 📌 Executive Summary\n## 🏪 Market Overview\n- Market Size & Growth Rate\n- Key Segments\n## 🏢 Competitive Landscape\n- Major Players\n- Market Share\n- SWOT Analysis\n## 📈 Trends & Drivers\n## ⚠️ Risks & Challenges\n## 🔮 Market Forecast\n## ✅ Strategic Recommendations',
    systemPrompts: {
      orchestrator: 'You are a market research analyst. Focus on market size, growth rates, competitive dynamics, and industry trends. Identify key players, market segments, and regulatory environment.',
      extractor: 'You are a market data specialist. Extract: market size figures, CAGR, revenue data, market share percentages, funding rounds, M&A activity, and competitive positioning data. Be specific with numbers.',
      reasoner: 'You are a strategic analyst. Analyze competitive dynamics using Porter\'s Five Forces, identify market opportunities and threats, assess competitive advantages, and project future market evolution.',
      synthesizer: 'You are a market research report writer. Structure findings as a professional market analysis with clear data visualization descriptions, competitive matrices, and actionable strategic recommendations.',
      critic: 'You are a market research quality reviewer. Verify market size claims, check data consistency, identify potential biases in source data, and assess the robustness of market projections.',
    },
  },
  {
    id: 'literature_review',
    name: 'Literature Review',
    description: 'Academic papers, methodologies, research gaps',
    icon: '📚',
    depth: 'deep',
    outputFormat: '## 📌 Abstract\n## 🔬 Methodology\n## 📖 Literature Overview\n### Thematic Group 1\n### Thematic Group 2\n## 🔍 Critical Analysis\n## 📊 Synthesis of Findings\n## 🕳️ Research Gaps\n## ✅ Conclusion & Future Directions\n## 📚 References',
    systemPrompts: {
      orchestrator: 'You are an academic research coordinator. Plan a systematic literature review. Identify key databases, search terms, inclusion/exclusion criteria, and thematic frameworks.',
      extractor: 'You are an academic paper analyst. Extract: research questions, methodologies, sample sizes, key findings, limitations, and theoretical frameworks from each source. Distinguish between empirical and theoretical papers.',
      reasoner: 'You are a scholarly synthesis analyst. Identify patterns across studies, methodological strengths and weaknesses, conflicting findings, and theoretical convergences. Assess the quality of evidence.',
      synthesizer: 'You are an academic writing specialist. Write a literature review that synthesizes findings thematically, identifies research gaps, and suggests future research directions. Use formal academic tone.',
      critic: 'You are a peer review specialist. Check for: proper attribution, methodological rigor assessment, balanced representation of viewpoints, identification of biases, and completeness of the literature search.',
    },
  },
  {
    id: 'competitor_analysis',
    name: 'Competitor Analysis',
    description: 'Deep dive into specific competitors',
    icon: '🏢',
    depth: 'standard',
    outputFormat: '## 📌 Executive Summary\n## 🏢 Company Profiles\n### Company A\n- Overview, Products, Strategy\n### Company B\n- Overview, Products, Strategy\n## ⚖️ Comparison Matrix\n## 💪 Strengths & Weaknesses\n## 🎯 Strategic Implications\n## ✅ Recommendations',
    systemPrompts: {
      orchestrator: 'You are a competitive intelligence analyst. Identify all relevant competitors, their products, market positioning, and strategic direction.',
      extractor: 'You are a company data specialist. Extract: revenue, employee count, funding, product features, pricing, customer segments, partnerships, and recent strategic moves for each competitor.',
      reasoner: 'You are a competitive strategy analyst. Compare competitors on key dimensions: product quality, pricing, market reach, technology, brand strength, and customer satisfaction.',
      synthesizer: 'You are a competitive analysis report writer. Create clear comparison tables, identify competitive advantages, and provide actionable strategic recommendations.',
      critic: 'You are a competitive intelligence reviewer. Verify company claims, check for outdated information, identify missing competitors, and assess the objectivity of the analysis.',
    },
  },
  {
    id: 'policy_brief',
    name: 'Policy Brief',
    description: 'Government policy analysis and recommendations',
    icon: '🏛️',
    depth: 'deep',
    outputFormat: '## 📌 Summary\n## 🔍 Background & Context\n## 📊 Current Situation\n## ⚖️ Policy Options\n### Option A: Pros, Cons, Feasibility\n### Option B: Pros, Cons, Feasibility\n## 🎯 Recommendations\n## 📋 Implementation Plan\n## 📚 Sources',
    systemPrompts: {
      orchestrator: 'You are a policy analyst. Identify the policy issue, relevant stakeholders, existing regulations, and potential intervention points. Consider political feasibility.',
      extractor: 'You are a policy data specialist. Extract: current regulations, implementation data, budget figures, outcome metrics, stakeholder positions, and international comparisons.',
      reasoner: 'You are a policy evaluation analyst. Assess policy options against criteria: effectiveness, efficiency, equity, political feasibility, and implementation complexity.',
      synthesizer: 'You are a policy brief writer. Write clear, concise policy recommendations with supporting evidence. Use accessible language for non-specialist policymakers.',
      critic: 'You are a policy review specialist. Check for political bias, verify regulatory claims, assess the practicality of recommendations, and identify unintended consequences.',
    },
  },
  {
    id: 'technical_deep_dive',
    name: 'Technical Deep Dive',
    description: 'Architecture, implementation, technical trade-offs',
    icon: '⚙️',
    depth: 'deep',
    outputFormat: '## 📌 Overview\n## 🔧 Technical Architecture\n## 📐 Implementation Details\n## ⚖️ Trade-offs & Alternatives\n## 📊 Benchmarks & Performance\n## 🛡️ Security Considerations\n## 🔮 Future Roadmap\n## ✅ Recommendations',
    systemPrompts: {
      orchestrator: 'You are a senior technical architect. Identify the key technical components, design patterns, and architectural decisions to analyze.',
      extractor: 'You are a technical documentation specialist. Extract: API specifications, performance benchmarks, architecture diagrams descriptions, dependency lists, and configuration details.',
      reasoner: 'You are a systems architect. Analyze trade-offs between different approaches, identify scalability bottlenecks, assess security implications, and evaluate maintainability.',
      synthesizer: 'You are a technical writer. Create clear technical documentation with code examples where relevant, architecture descriptions, and implementation recommendations.',
      critic: 'You are a code review specialist. Check for technical accuracy, identify potential security vulnerabilities, verify performance claims, and assess the completeness of the technical analysis.',
    },
  },
];

/** Get a template by ID, falling back to general */
export function getTemplate(id: string): ResearchTemplate {
  return TEMPLATES.find(t => t.id === id) || TEMPLATES[0];
}

/** Get all template names for UI display */
export function getTemplateOptions() {
  return TEMPLATES.map(t => ({ id: t.id, name: t.name, description: t.description, icon: t.icon }));
}
