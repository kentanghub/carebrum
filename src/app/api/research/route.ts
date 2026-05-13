import { NextRequest, NextResponse } from 'next/server';
import { runResearchPipeline, initializeAgents } from '@/lib/agents';
import { ResearchRequest } from '@/types';

export async function POST(req: NextRequest) {
  try {
    const request: ResearchRequest = await req.json();
    
    if (!request.query || request.query.trim() === '') {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    const agents = initializeAgents();
    
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of runResearchPipeline(request, agents)) {
            const data = `data: ${JSON.stringify(event)}\n\n`;
            controller.enqueue(encoder.encode(data));
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          console.error('[Research API] Stream error:', error);
          const errorMessage = error instanceof Error ? error.message : 'Stream error';
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', message: errorMessage })}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('[Research API] Fatal error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
