import { randomUUID } from 'node:crypto';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { env } from './config/env.js';
import { agentApp, GraphState } from './workflow.js';
import { Librarian } from './utils/librarian.js';
import { MAX_REVIEW_ITERATIONS } from './utils/agentQuality.js';
import { prisma } from './utils/prisma.js';
import { upload, uploadsDirectory } from './utils/upload.js';

const app = express();
const librarian = new Librarian();
const ingestionRateLimit = new Map<string, { count: number; resetAt: number }>();
const generationRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(4_000),
  threadId: z.uuid().optional(),
});
const knowledgeIngestionSchema = z.object({
  url: z.string().trim().url().max(2_048),
  category: z.string().trim().min(1).max(64).regex(/^[a-z0-9][a-z0-9-]*$/i).optional(),
});
const projectListQuerySchema = z.object({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});
const projectParamsSchema = z.object({ id: z.uuid() });

type GraphUpdate = Partial<typeof GraphState.State>;

function limitKnowledgeIngestion(request: Request, response: Response, next: NextFunction): void {
  const now = Date.now();
  const clientIp = request.ip || 'unknown';
  let window = ingestionRateLimit.get(clientIp);

  if (window && window.resetAt <= now) {
    ingestionRateLimit.delete(clientIp);
    window = undefined;
  }

  if (!window) {
    if (ingestionRateLimit.size >= 10_000) {
      for (const [ip, entry] of ingestionRateLimit) {
        if (entry.resetAt <= now) ingestionRateLimit.delete(ip);
      }
      if (ingestionRateLimit.size >= 10_000) {
        response.status(503).json({ error: 'Knowledge ingestion is temporarily unavailable.' });
        return;
      }
    }
    window = { count: 0, resetAt: now + 10 * 60 * 1_000 };
    ingestionRateLimit.set(clientIp, window);
  }

  if (window.count >= 3) {
    response.setHeader('Retry-After', Math.ceil((window.resetAt - now) / 1_000));
    response.status(429).json({ error: 'Knowledge ingestion limit reached. Try again later.' });
    return;
  }

  window.count += 1;
  next();
}

app.disable('x-powered-by');
app.use(cors({ origin: env.FRONTEND_ORIGIN }));
app.use(express.json({ limit: '1mb' }));
app.use('/assets', express.static(uploadsDirectory, { fallthrough: false, maxAge: '1d' }));

app.get('/health', async (_request, response): Promise<void> => {
  try {
    await prisma.project.count();
    response.json({ status: 'ok', database: 'connected' });
  } catch {
    response.status(503).json({ status: 'error', database: 'unavailable' });
  }
});

app.get('/api/projects', async (request, response): Promise<void> => {
  const parsedQuery = projectListQuerySchema.safeParse(request.query);
  if (!parsedQuery.success) {
    response.status(400).json({ error: 'Invalid project list query.' });
    return;
  }

  const { cursor, limit } = parsedQuery.data;
  const projects = await prisma.project.findMany({
    where: { finalCode: { not: '' } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: { id: true, prompt: true, createdAt: true },
  });
  const hasMore = projects.length > limit;
  const items = hasMore ? projects.slice(0, limit) : projects;

  response.json({
    items,
    nextCursor: hasMore ? items.at(-1)?.id ?? null : null,
  });
});

app.get('/api/projects/:id', async (request, response): Promise<void> => {
  const parsedParams = projectParamsSchema.safeParse(request.params);
  if (!parsedParams.success) {
    response.status(400).json({ error: 'Invalid project id.' });
    return;
  }

  const project = await prisma.project.findUnique({
    where: { id: parsedParams.data.id },
    select: { id: true, prompt: true, finalCode: true, createdAt: true },
  });
  if (!project || !project.finalCode) {
    response.status(404).json({ error: 'Project not found.' });
    return;
  }

  response.json(project);
});

app.post('/api/upload', upload.single('asset'), (request, response): void => {
  if (!request.file) {
    response.status(400).json({ error: 'An asset file is required.' });
    return;
  }

  response.status(201).json({
    url: `${request.protocol}://${request.get('host')}/assets/${request.file.filename}`,
  });
});

app.post('/api/knowledge/ingest', limitKnowledgeIngestion, async (request, response): Promise<void> => {
  const parsedRequest = knowledgeIngestionSchema.safeParse(request.body);
  if (!parsedRequest.success) {
    response.status(400).json({
      error: 'Invalid knowledge ingestion request.',
      details: z.flattenError(parsedRequest.error).fieldErrors,
    });
    return;
  }

  const submittedUrl = new URL(parsedRequest.data.url);
  if (
    submittedUrl.protocol !== 'https:'
    || submittedUrl.username
    || submittedUrl.password
    || (submittedUrl.port && submittedUrl.port !== '443')
  ) {
    response.status(400).json({ error: 'Provide a public HTTPS source URL without credentials.' });
    return;
  }

  const sourceUrl = new URL(submittedUrl);
  sourceUrl.search = '';
  sourceUrl.hash = '';
  let rawContent: string;

  try {
    if (submittedUrl.hostname.toLowerCase() === 'github.com') {
      const segments = submittedUrl.pathname.split('/').filter(Boolean).map(decodeURIComponent);
      if (segments.length < 2 || (segments.length > 2 && segments[2] !== 'tree')) {
        response.status(400).json({
          error: 'Use a GitHub repository URL, optionally followed by /tree/{branch}/{subpath}.',
        });
        return;
      }

      const owner = segments[0];
      const repo = segments[1]?.replace(/\.git$/i, '');
      if (!owner || !repo) {
        response.status(400).json({ error: 'The GitHub repository URL is invalid.' });
        return;
      }
      const branch = segments[2] === 'tree' ? segments[3] : undefined;
      const subPath = segments[2] === 'tree' ? segments.slice(4).join('/') : undefined;
      if (segments[2] === 'tree' && !branch) {
        response.status(400).json({ error: 'A branch name is required after /tree/.' });
        return;
      }

      const repositoryUrl = new URL(`https://github.com/${owner}/${repo}`);
      if (branch) repositoryUrl.pathname += `/tree/${encodeURIComponent(branch)}`;
      if (subPath) repositoryUrl.pathname += `/${subPath.split('/').map(encodeURIComponent).join('/')}`;
      sourceUrl.href = repositoryUrl.href;
      rawContent = (await librarian.fetchGitHubRepo(owner, repo, subPath, branch)).join('\n\n');
    } else {
      rawContent = await librarian.fetchWebDoc(submittedUrl.href);
    }

    const distilledItems = await librarian.distill(rawContent, sourceUrl.href);
    if (distilledItems.length === 0) {
      response.status(422).json({ error: 'No reusable WebGL or GSAP techniques were found.' });
      return;
    }

    const knowledgeItems = distilledItems.map((item) => ({
      ...item,
      category: parsedRequest.data.category ?? item.category,
      sourceUrl: sourceUrl.href,
    }));
    await librarian.saveKnowledge(knowledgeItems);

    response.status(201).json({
      success: true,
      count: knowledgeItems.length,
      items: knowledgeItems.map(({ title, category }) => ({ title, category })),
    });
  } catch (error) {
    console.error('Knowledge ingestion failed:', error);
    response.status(502).json({ error: 'Knowledge ingestion failed. Check the source URL and try again.' });
  }
});

app.post('/api/generate', async (request: Request, response: Response): Promise<void> => {
  const parsedRequest = generationRequestSchema.safeParse(request.body);
  if (!parsedRequest.success) {
    response.status(400).json({
      error: 'Invalid generation request.',
      details: z.flattenError(parsedRequest.error).fieldErrors,
    });
    return;
  }

  const { prompt } = parsedRequest.data;
  const threadId = parsedRequest.data.threadId ?? randomUUID();
  const project = await prisma.project.create({
    data: { prompt, finalCode: '' },
  });

  response.status(200);
  response.setHeader('Content-Type', 'text/event-stream');
  response.setHeader('Cache-Control', 'no-cache, no-transform');
  response.setHeader('Connection', 'keep-alive');
  response.setHeader('X-Accel-Buffering', 'no');
  response.flushHeaders();

  const controller = new AbortController();
  let responseCompleted = false;
  let finalCode = '';
  let finalIterations = 0;
  let finalFeedback = '';
  let finalDiagnostics = '';
  let finalApproved = false;

  response.on('close', () => {
    if (!responseCompleted) controller.abort();
  });

  const sendEvent = (event: string, data: unknown): void => {
    if (!response.writableEnded) {
      response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }
  };

  sendEvent('project', { projectId: project.id, threadId });

  try {
    const stream = await agentApp.stream(
      {
        userPrompt: prompt,
        designPlan: '',
        generatedCode: '',
        screenshotBase64: '',
        criticFeedback: '',
        runtimeDiagnostics: '',
        reviewApproved: false,
        iterations: 0,
      },
      {
        configurable: { thread_id: threadId },
        signal: controller.signal,
        streamMode: 'updates',
      },
    );

    for await (const chunk of stream) {
      for (const [node, value] of Object.entries(chunk as Record<string, GraphUpdate>)) {
        if (value.generatedCode) finalCode = value.generatedCode;
        if (typeof value.iterations === 'number') finalIterations = value.iterations;
        if (value.criticFeedback) finalFeedback = value.criticFeedback;
        if (value.runtimeDiagnostics) finalDiagnostics = value.runtimeDiagnostics;
        if (typeof value.reviewApproved === 'boolean') finalApproved = value.reviewApproved;

        sendEvent('status', {
          node,
          phase: getNodePhase(node, value),
          iterations: finalIterations,
          approved: value.reviewApproved,
          feedback: node === 'critic' ? value.criticFeedback : undefined,
          diagnostics: node === 'critic' ? value.runtimeDiagnostics : undefined,
        });
      }
    }

    if (!finalCode) throw new Error('The workflow completed without generated code.');

    await prisma.project.update({
      where: { id: project.id },
      data: { finalCode },
    });

    sendEvent('complete', {
      projectId: project.id,
      threadId,
      code: finalCode,
      iterations: finalIterations,
      criticFeedback: finalFeedback,
      diagnostics: finalDiagnostics,
      approved: finalApproved,
      reviewLimitReached: !finalApproved && finalIterations >= MAX_REVIEW_ITERATIONS,
    });
  } catch (error) {
    if (!controller.signal.aborted) {
      console.error('Agent workflow failed:', error);
      sendEvent('error', {
        projectId: project.id,
        message: error instanceof Error ? error.message : 'Generation failed.',
      });
    }
  } finally {
    responseCompleted = true;
    response.end();
  }
});

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction): void => {
  if (error instanceof multer.MulterError) {
    response.status(400).json({ error: error.message });
    return;
  }
  if (error instanceof Error) {
    console.error(error);
    response.status(400).json({ error: error.message });
    return;
  }
  response.status(500).json({ error: 'Unexpected server error.' });
});

const server = app.listen(env.PORT, () => {
  console.log(`Multi-Agent Backend running on http://localhost:${env.PORT}`);
});

const shutdown = async (): Promise<void> => {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
};

process.once('SIGINT', () => { void shutdown(); });
process.once('SIGTERM', () => { void shutdown(); });

function getNodePhase(node: string, update: GraphUpdate): string {
  if (node === 'artDirector') return 'Design plan ready';
  if (node === 'sceneBuilder') return 'Scene implementation ready';
  if (node === 'critic') {
    return update.criticFeedback?.trim().toUpperCase() === 'APPROVED'
      ? 'Critic approved the scene'
      : 'Critic requested revisions';
  }
  return 'Workflow updated';
}
