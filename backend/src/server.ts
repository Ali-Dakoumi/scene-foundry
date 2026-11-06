import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { env } from './config/env.js';
import { agentApp, GraphState } from './workflow.js';
import { Librarian } from './utils/librarian.js';
import { MAX_REVIEW_ITERATIONS } from './utils/agentQuality.js';
import { prisma } from './utils/prisma.js';
import { publicErrorMessage } from './utils/publicError.js';
import { knowledgeVideoUpload, upload, uploadsDirectory } from './utils/upload.js';
import { deconstructVideoSource } from './utils/videoDeconstructor.js';
import { isYouTubeHost, normalizeYouTubeUrl } from './utils/youtubeUrl.js';

const app = express();
const librarian = new Librarian();
const ingestionRateLimit = new Map<string, { count: number; resetAt: number }>();
const generationRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(4_000),
  threadId: z.uuid().optional(),
  parentProjectId: z.uuid().optional(),
});
const knowledgeIngestionSchema = z.object({
  url: z.string().trim().url().max(2_048).optional(),
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
app.use(cors({
  origin: [...new Set([
    env.FRONTEND_ORIGIN,
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
  ])],
}));
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

app.post(
  '/api/knowledge/ingest',
  limitKnowledgeIngestion,
  (request: Request, response: Response, next: NextFunction): void => {
    const contentType = request.headers['content-type'] ?? '';
    if (contentType.includes('multipart/form-data')) {
      knowledgeVideoUpload.single('video')(request, response, next);
      return;
    }
    next();
  },
  async (request, response): Promise<void> => {
    const parsedRequest = knowledgeIngestionSchema.safeParse({
      url: typeof request.body?.url === 'string' && request.body.url.trim()
        ? request.body.url.trim()
        : undefined,
      category: typeof request.body?.category === 'string' && request.body.category.trim()
        ? request.body.category.trim()
        : undefined,
    });
    if (!parsedRequest.success) {
      response.status(400).json({
        error: 'Invalid knowledge ingestion request.',
        details: z.flattenError(parsedRequest.error).fieldErrors,
      });
      return;
    }

    const uploadedVideo = request.file;
    if (!uploadedVideo && !parsedRequest.data.url) {
      response.status(400).json({
        error: 'Provide a public HTTPS source URL or upload an .mp4/.webm video.',
      });
      return;
    }

    try {
      const { rawContent, sourceUrl } = uploadedVideo
        ? await ingestUploadedVideo(uploadedVideo.path, uploadedVideo.filename)
        : await ingestFromUrl(parsedRequest.data.url!);

      const distilledItems = await librarian.distill(rawContent, sourceUrl);
      if (distilledItems.length === 0) {
        response.status(422).json({ error: 'No reusable WebGL or GSAP techniques were found.' });
        return;
      }

      const knowledgeItems = distilledItems.map((item) => ({
        ...item,
        category: parsedRequest.data.category ?? item.category,
        sourceUrl,
      }));
      await librarian.saveKnowledge(knowledgeItems);

      response.status(201).json({
        success: true,
        count: knowledgeItems.length,
        items: knowledgeItems.map(({ title, category }) => ({ title, category })),
      });
    } catch (error) {
      console.error('Knowledge ingestion failed:', error);
      if (error instanceof Error && /HTTP 429|rate limit/i.test(error.message)) {
        response.status(429).json({ error: 'The source is rate-limited. Try again later.' });
        return;
      }
      if (error instanceof Error && /timed out/i.test(error.message)) {
        response.status(504).json({ error: 'The source took too long to respond.' });
        return;
      }
      if (error instanceof Error && /invalid|only public|youtube|github|credentials|unsupported/i.test(error.message)) {
        response.status(400).json({ error: error.message });
        return;
      }
      response.status(502).json({ error: 'Knowledge ingestion failed. Check the source URL and try again.' });
    } finally {
      if (uploadedVideo?.path) {
        try {
          await unlink(uploadedVideo.path);
        } catch {
          // Upload remains gitignored.
        }
      }
    }
  },
);

app.post('/api/generate', async (request: Request, response: Response): Promise<void> => {
  const parsedRequest = generationRequestSchema.safeParse(request.body);
  if (!parsedRequest.success) {
    response.status(400).json({
      error: 'Invalid generation request.',
      details: z.flattenError(parsedRequest.error).fieldErrors,
    });
    return;
  }

  const { prompt, parentProjectId } = parsedRequest.data;
  const threadId = parsedRequest.data.threadId ?? randomUUID();
  const parentProject = parentProjectId
    ? await prisma.project.findUnique({
      where: { id: parentProjectId },
      select: { finalCode: true },
    })
    : null;
  if (parentProjectId && (!parentProject || !parentProject.finalCode)) {
    response.status(404).json({ error: 'The project to iterate from was not found.' });
    return;
  }
  let project;
  try {
    project = await prisma.project.create({
      data: { prompt, finalCode: '', parentProjectId: parentProjectId ?? null },
    });
  } catch (error) {
    console.error('Failed to create project:', error);
    response.status(500).json({ error: publicErrorMessage(error) });
    return;
  }

  response.status(200);
  response.setHeader('Content-Type', 'text/event-stream');
  response.setHeader('Cache-Control', 'no-cache, no-transform');
  response.setHeader('Connection', 'keep-alive');
  response.setHeader('X-Accel-Buffering', 'no');
  response.flushHeaders();

  const controller = new AbortController();
  const heartbeat = setInterval(() => {
    if (!response.writableEnded) response.write(': keep-alive\n\n');
  }, 15_000);
  let responseCompleted = false;
  let finalCode = '';
  let finalIterations = 0;
  let finalFeedback = '';
  let finalDiagnostics = '';
  let finalApproved = false;

  response.on('close', () => {
    if (!responseCompleted) controller.abort();
  });
  response.on('error', () => controller.abort());

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
        motionPlan: '',
        lookPlan: '',
        generatedCode: parentProject?.finalCode ?? '',
        screenshotBase64: '',
        criticFeedback: '',
        criticNotes: '',
        runtimeDiagnostics: '',
        reviewApproved: false,
        videoPath: '',
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
          feedback: node === 'motionCritic' || node === 'technicalGate' ? value.criticFeedback : undefined,
          notes: specialistNote(node, value),
          diagnostics: node === 'technicalGate' || node === 'motionCritic'
            ? value.runtimeDiagnostics
            : undefined,
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
        message: publicErrorMessage(error),
      });
    }
  } finally {
    clearInterval(heartbeat);
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
    response.status(500).json({ error: publicErrorMessage(error) });
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

async function ingestUploadedVideo(
  videoPath: string,
  filename: string,
): Promise<{ rawContent: string; sourceUrl: string }> {
  const markdown = await deconstructVideoSource(videoPath, false);
  if (!markdown) throw new Error('The uploaded video produced no motion notes.');
  return {
    rawContent: markdown,
    sourceUrl: `uploaded-video://${filename}`,
  };
}

async function ingestFromUrl(rawUrl: string): Promise<{ rawContent: string; sourceUrl: string }> {
  const submittedUrl = new URL(rawUrl);
  if (
    submittedUrl.protocol !== 'https:'
    || submittedUrl.username
    || submittedUrl.password
    || (submittedUrl.port && submittedUrl.port !== '443')
  ) {
    throw new Error('Provide a public HTTPS source URL without credentials.');
  }

  if (isYouTubeHost(submittedUrl.hostname)) {
    const youtubeUrl = normalizeYouTubeUrl(submittedUrl.href);
    const markdown = await deconstructVideoSource(youtubeUrl, true);
    if (!markdown) throw new Error('The YouTube video produced no motion notes.');
    return { rawContent: markdown, sourceUrl: youtubeUrl };
  }

  const sourceUrl = new URL(submittedUrl);
  sourceUrl.search = '';
  sourceUrl.hash = '';

  if (submittedUrl.hostname.toLowerCase() === 'github.com') {
    const segments = submittedUrl.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    if (segments.length < 2 || (segments.length > 2 && segments[2] !== 'tree')) {
      throw new Error('Use a GitHub repository URL, optionally followed by /tree/{branch}/{subpath}.');
    }

    const owner = segments[0];
    const repo = segments[1]?.replace(/\.git$/i, '');
    if (!owner || !repo) {
      throw new Error('The GitHub repository URL is invalid.');
    }
    const branch = segments[2] === 'tree' ? segments[3] : undefined;
    const subPath = segments[2] === 'tree' ? segments.slice(4).join('/') : undefined;
    if (segments[2] === 'tree' && !branch) {
      throw new Error('A branch name is required after /tree/.');
    }

    const repositoryUrl = new URL(`https://github.com/${owner}/${repo}`);
    if (branch) repositoryUrl.pathname += `/tree/${encodeURIComponent(branch)}`;
    if (subPath) repositoryUrl.pathname += `/${subPath.split('/').map(encodeURIComponent).join('/')}`;
    return {
      rawContent: (await librarian.fetchGitHubRepo(owner, repo, subPath, branch)).join('\n\n'),
      sourceUrl: repositoryUrl.href,
    };
  }

  return {
    rawContent: await librarian.fetchWebDoc(submittedUrl.href),
    sourceUrl: sourceUrl.href,
  };
}

function specialistNote(node: string, update: GraphUpdate): string | undefined {
  if (node === 'artDirector' && update.designPlan) return 'Art direction locked.';
  if (node === 'specialists') return 'Motion and look contracts ready.';
  if (node === 'motionDirector' && update.motionPlan) return 'Motion plan updated.';
  if (node === 'lookDev' && update.lookPlan) return 'Look plan updated.';
  if (node === 'motionCritic' || node === 'technicalGate') return update.criticFeedback;
  return undefined;
}

function getNodePhase(node: string, update: GraphUpdate): string {
  if (node === 'artDirector') return 'Design plan ready';
  if (node === 'specialists') return 'Motion and look plans ready';
  if (node === 'motionDirector') return 'Motion plan ready';
  if (node === 'lookDev') return 'Look ready';
  if (node === 'sceneBuilder') return 'Scene implementation ready';
  if (node === 'technicalGate') {
    return update.runtimeDiagnostics?.includes('[ERROR')
      ? 'Technical checks failed'
      : 'Technical checks passed';
  }
  if (node === 'motionCritic') {
    return update.reviewApproved || update.criticFeedback?.trim().toUpperCase() === 'APPROVED'
      ? 'Motion critic approved the scene'
      : 'Motion critic requested revisions';
  }
  return 'Workflow updated';
}
