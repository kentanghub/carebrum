import { NextResponse } from 'next/server';
import { getAvailableProviders, getTokenUsage, hasProviders } from '@/lib/llm-client';

export async function GET() {
  const providers = getAvailableProviders();
  const usage = getTokenUsage();
  
  return NextResponse.json({
    status: 'ok',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    providers: {
      available: providers,
      count: providers.length,
      hasFree: providers.some(p => p.isFree),
    },
    usage: {
      totalTokens: usage.total,
      byProvider: usage.byProvider,
    },
    features: {
      multiAgent: true,
      iterativeRefinement: true,
      sourceVerification: true,
      academicSearch: true,
      pageCrawling: true,
      streaming: true,
      templates: true,
      knowledgeGraph: true,
    },
  });
}
