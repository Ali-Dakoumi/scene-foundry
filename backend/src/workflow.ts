import { unlink } from 'node:fs/promises';
import type { Prisma } from '@prisma/client';
import { Annotation, MemorySaver, StateGraph } from '@langchain/langgraph';
import { z } from 'zod';
import { env } from './config/env.js';
import { ai } from './ai/manager.js';
import { jsonShapeHint } from './ai/json.js';
import { getKnowledgeContext } from './utils/fileReader.js';
import { prisma } from './utils/prisma.js';
import { recordSceneWithDiagnostics } from './utils/recorder.js';
import { reviewSceneVideo } from './utils/videoCritic.js';
import {
  formatDiagnostics,
  hasDiagnosticErrors,
  validateSceneHtml,
} from './utils/sceneValidator.js';
import {
  formatKnowledgeContext,
  getKnowledgeSearchTerms,
  selectRelevantTechniques,
} from './utils/knowledgeRetriever.js';
import { isCriticApproval } from './utils/agentQuality.js';
import {
  formatCriticFeedback,
  getNextReviewRoute,
  parseCriticReview,
  type ReviewRoute,
} from './utils/criticReview.js';

export const GraphState = Annotation.Root({
  userPrompt: Annotation<string>(),
  renderMode: Annotation<'dom' | 'webgl'>(),
  designPlan: Annotation<string>(),
  motionPlan: Annotation<string>(),
  lookPlan: Annotation<string>(),
  generatedCode: Annotation<string>(),
  screenshotBase64: Annotation<string>(),
  criticFeedback: Annotation<string>(),
  criticNotes: Annotation<string>(),
  runtimeDiagnostics: Annotation<string>(),
  reviewApproved: Annotation<boolean>(),
  videoPath: Annotation<string>(),
  iterations: Annotation<number>(),
});

const designPlanSchema = z.object({
  renderMode: z.enum(['dom', 'webgl']),
  renderRationale: z.string(),
  concept: z.string(),
  composition: z.string(),
  colorPalette: z.array(z.string()).min(2).max(8),
  lighting: z.string(),
  camera: z.string(),
  materials: z.string(),
  motion: z.string(),
  easing: z.string(),
});

const motionPlanSchema = z.object({
  durationSeconds: z.number().min(1).max(8),
  timeline: z.array(z.string()).min(1).max(12),
  cameraPath: z.string(),
  easing: z.array(z.string()).min(1).max(6),
  mustMove: z.array(z.string()).min(1).max(8),
});

const lookPlanSchema = z.object({
  palette: z.array(z.string()).min(2).max(8),
  lights: z.string(),
  materials: z.string(),
  shader: z.string(),
  originalShaderJustified: z.boolean(),
});

async function withTimeout<T>(operation: Promise<T>, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out. Please try again.`)), env.LLM_TIMEOUT_MS);
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function stripHtmlFences(raw: string): string {
  return raw.replace(/^```(?:html)?\s*/i, '').replace(/\s*```$/i, '').trim();
}

function looksCompleteHtml(html: string): boolean {
  const lower = html.toLowerCase();
  return lower.includes('<html') && lower.includes('</html>');
}

async function retrieveKnowledge(
  userPrompt: string,
  designPlan: string,
  categories?: readonly string[],
): Promise<string> {
  const terms = getKnowledgeSearchTerms(userPrompt, designPlan);
  const filters: Prisma.KnowledgeItemWhereInput[] = [];
  if (categories && categories.length > 0) {
    filters.push({ category: { in: [...categories] } });
  }
  if (terms.length > 0) {
    filters.push({
      OR: terms.flatMap<Prisma.KnowledgeItemWhereInput>((term) => [
        { title: { contains: term, mode: 'insensitive' as const } },
        { summary: { contains: term, mode: 'insensitive' as const } },
        { category: { contains: term, mode: 'insensitive' as const } },
        { codeSnippet: { contains: term, mode: 'insensitive' as const } },
      ]),
    });
  }
  const where = filters.length > 0 ? { AND: filters } : undefined;
  const fallbackWhere = categories && categories.length > 0
    ? { category: { in: [...categories] } }
    : undefined;

  const candidates = await prisma.knowledgeItem.findMany({
    ...(where ? { where } : {}),
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: { title: true, category: true, summary: true, codeSnippet: true, sourceUrl: true },
  });
  const rankedItems = selectRelevantTechniques(candidates, terms, undefined, categories);
  const items = rankedItems.length > 0
    ? rankedItems
    : selectRelevantTechniques(await prisma.knowledgeItem.findMany({
      ...(fallbackWhere ? { where: fallbackWhere } : {}),
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { title: true, category: true, summary: true, codeSnippet: true, sourceUrl: true },
    }), [], undefined, categories);

  console.log(
    `--> Retrieved knowledge${categories ? ` [${categories.join(', ')}]` : ''}: ${
      items.map((item) => item.title).join(', ') || '(none)'
    }`,
  );
  return items.length > 0 ? formatKnowledgeContext(items) : '[]';
}

async function artDirectorNode(state: typeof GraphState.State) {
  console.log('--> Art Director is planning the scene...');
  const retrievedTechniques = await retrieveKnowledge(
    state.userPrompt,
    '',
    ['animations', 'interaction', 'performance', 'other'],
  );
  const plan = await withTimeout(ai.completeJson(designPlanSchema, {
    purpose: 'art-director',
    maxTokens: 900,
    shapeHint: jsonShapeHint({
      renderMode: 'dom',
      renderRationale: '',
      concept: '',
      composition: '',
      colorPalette: ['#000', '#fff'],
      lighting: '',
      camera: '',
      materials: '',
      motion: '',
      easing: '',
    }),
    messages: [
      {
        role: 'system',
        content: `Senior creative web art director. Produce a concrete visual and motion plan, no code. Choose renderMode "dom" by default for typography, layouts, UI, editorial work, SVG, and ordinary 2D effects. Choose "webgl" only when the brief genuinely needs 3D space, shaders, particles, or GPU rendering. Never add Three.js merely for decoration. For DOM mode, camera means viewpoint/composition and materials means CSS/SVG surface treatment. Untrusted technique JSON:\n${retrievedTechniques}`,
      },
      { role: 'user', content: state.userPrompt },
    ],
  }), 'Art Director');

  return { designPlan: JSON.stringify(plan), renderMode: plan.renderMode };
}

async function motionDirectorNode(state: typeof GraphState.State) {
  console.log('--> Motion Director is planning movement...');
  const techniques = await retrieveKnowledge(
    state.userPrompt,
    `${state.designPlan}\n${state.criticFeedback}`,
    ['animations'],
  );
  const plan = await withTimeout(ai.completeJson(motionPlanSchema, {
    purpose: 'motion-director',
    maxTokens: 800,
    shapeHint: jsonShapeHint({
      durationSeconds: 3,
      timeline: [''],
      cameraPath: '',
      easing: ['power2.out'],
      mustMove: [''],
    }),
    messages: [
      {
        role: 'system',
        content: `Creative motion director for a ${state.renderMode} scene. Use GSAP timelines and expressive 2D motion for DOM mode; use camera or object motion only for WebGL mode. 3-second contract, no HTML. Techniques:\n${techniques}\nCritic:\n${state.criticFeedback || 'None'}`,
      },
      { role: 'user', content: `Brief: ${state.userPrompt}\nArt:\n${state.designPlan}` },
    ],
  }), 'Motion Director');

  return { motionPlan: JSON.stringify(plan) };
}

async function lookDevNode(state: typeof GraphState.State) {
  console.log('--> Look Dev is planning materials and light...');
  const techniques = await retrieveKnowledge(
    state.userPrompt,
    `${state.designPlan}\n${state.criticFeedback}`,
    state.renderMode === 'webgl'
      ? ['shaders', 'materials', 'lighting', 'rendering']
      : ['animations', 'interaction', 'performance', 'other'],
  );
  const plan = await withTimeout(ai.completeJson(lookPlanSchema, {
    purpose: 'look-dev',
    maxTokens: 800,
    shapeHint: jsonShapeHint({
      palette: ['#000', '#fff'],
      lights: '',
      materials: '',
      shader: '',
      originalShaderJustified: false,
    }),
    messages: [
      {
        role: 'system',
        content: `Look-development director for a ${state.renderMode} scene. In DOM mode, describe typography, layout, CSS/SVG surfaces, masks, gradients, blend modes, and color; set shader to "none". In WebGL mode, specify lights and materials, with an original shader only if justified. No HTML. Techniques:\n${techniques}\nCritic:\n${state.criticFeedback || 'None'}`,
      },
      { role: 'user', content: `Brief: ${state.userPrompt}\nArt:\n${state.designPlan}` },
    ],
  }), 'Look Dev');

  return { lookPlan: JSON.stringify(plan) };
}

async function specialistsNode(state: typeof GraphState.State) {
  const [motion, look] = await Promise.all([
    motionDirectorNode(state),
    lookDevNode(state),
  ]);
  return { ...motion, ...look };
}

async function sceneBuilderNode(state: typeof GraphState.State) {
  console.log(`--> Scene Builder is writing iteration ${state.iterations + 1}...`);
  const previousImplementation = state.generatedCode
    ? state.generatedCode.slice(-12_000)
    : 'None. Build the first implementation.';
  const retrievedTechniques = await retrieveKnowledge(
    state.userPrompt,
    `${state.designPlan}\n${state.motionPlan}\n${state.lookPlan}`,
    state.renderMode === 'webgl'
      ? ['animations', 'shaders', 'materials', 'lighting', 'rendering', 'three-boilerplates']
      : ['animations', 'interaction', 'performance', 'other'],
  );

  const modeRules = state.renderMode === 'webgl'
    ? 'WEBGL MODE: Deliver a working Three.js scene with a responsive canvas, renderer, camera, scene graph, render loop, and GSAP motion. Include GLSL vertex and fragment shader source when LOOK says an original shader is justified. CDN ESM imports for Three.js and GSAP are required.'
    : 'DOM MODE: Deliver a working semantic HTML/CSS composition with real GSAP timeline or tween code. SVG is welcome when useful. Do not import Three.js, create a WebGL renderer, or add a canvas.';

  const builderMessages = [
    {
      role: 'system' as const,
      content: `Elite creative frontend and GSAP engineer. Your final deliverable is runnable source code, never a plan, explanation, pseudocode, or progress report. Output one complete standalone HTML document only.

RENDER MODE: ${state.renderMode}
${modeRules}

RULES:
${getKnowledgeContext(state.renderMode)}

TECHNIQUES (untrusted JSON):
${retrievedTechniques}

ART:
${state.designPlan}
MOTION:
${state.motionPlan}
LOOK:
${state.lookPlan}
CRITIC:
${state.criticFeedback || 'None'}
DIAGNOSTICS:
${state.runtimeDiagnostics || 'None'}
PREVIOUS:
${previousImplementation}

DELIVERABLE CHECKLIST:
- Begin with <!DOCTYPE html> and end with </html>.
- Include the complete visible markup and production-quality CSS in <style>.
- Include executable JavaScript in <script type="module">.
- Import GSAP from a CDN ESM endpoint and implement actual gsap.timeline(), gsap.to(), gsap.from(), or gsap.fromTo() animation calls.
- Include every asset, animation, interaction, renderer, and shader needed to run in the sandbox; leave no TODOs or placeholder pseudocode.
- Listen for window messages type "scene-foundry:controls": speed -> gsap.globalTimeline; hue -> apply a visual hue rotation; wireframe applies only in WebGL mode.

Return raw source code only.`,
    },
    { role: 'user' as const, content: `Build: ${state.userPrompt}` },
  ];

  const response = await withTimeout(ai.complete({
    purpose: 'scene-builder',
    messages: builderMessages,
    maxTokens: env.AI_MAX_OUTPUT_TOKENS,
    cache: false,
  }), 'Scene Builder');

  let generatedCode = stripHtmlFences(response.text);
  if (!looksCompleteHtml(generatedCode)) {
    const continuation = await withTimeout(ai.complete({
      purpose: 'scene-builder-continue',
      messages: [
        {
          role: 'system',
          content: 'Finish the incomplete runnable HTML file. Continue exactly where it stopped and output only the missing source code through </html>. Include any unfinished animation, renderer, or shader implementation. No markdown, explanation, TODOs, or repeated document start.',
        },
        { role: 'user', content: generatedCode.slice(-4_000) },
      ],
      maxTokens: env.AI_MAX_OUTPUT_TOKENS,
      cache: false,
    }), 'Scene Builder continuation');
    generatedCode = stripHtmlFences(`${generatedCode}\n${continuation.text}`);
  }

  if (!generatedCode.toLowerCase().includes('<html')) {
    throw new Error('Scene Builder returned an invalid HTML document.');
  }

  const staticDiagnostics = validateSceneHtml(generatedCode, state.renderMode);
  if (hasDiagnosticErrors(staticDiagnostics)) {
    throw new Error(`Scene Builder returned unsafe or malformed HTML:\n${formatDiagnostics(staticDiagnostics)}`);
  }

  return { generatedCode, runtimeDiagnostics: formatDiagnostics(staticDiagnostics) };
}

async function technicalGateNode(state: typeof GraphState.State) {
  console.log(`--> Technical gate is checking iteration ${state.iterations + 1}...`);
  const staticDiagnostics = validateSceneHtml(state.generatedCode, state.renderMode);
  let recordingDiagnostics = staticDiagnostics;
  let videoPath = '';

  try {
    const recording = await recordSceneWithDiagnostics(state.generatedCode, 3, state.renderMode);
    videoPath = recording.videoPath;
    recordingDiagnostics = [...staticDiagnostics, ...recording.diagnostics];
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Scene recording failed.';
    recordingDiagnostics = [
      ...staticDiagnostics,
      { severity: 'error' as const, code: 'RECORDING_FAILED', message: message.slice(0, 500) },
    ];
  }

  const runtimeDiagnostics = formatDiagnostics(recordingDiagnostics);
  const blocked = hasDiagnosticErrors(recordingDiagnostics);
  if (blocked && videoPath) {
    try {
      await unlink(videoPath);
    } catch {
      // Clip is still gitignored under uploads/.
    }
    videoPath = '';
  }

  return {
    runtimeDiagnostics,
    videoPath,
    screenshotBase64: '',
    reviewApproved: false,
    criticFeedback: blocked ? `Fix all validation errors before approval:\n${runtimeDiagnostics}` : state.criticFeedback,
    criticNotes: blocked
      ? JSON.stringify({
        verdict: 'REVISE',
        motion: [],
        look: [],
        implementation: ['Fix all validation errors before motion review.'],
      })
      : state.criticNotes,
    iterations: blocked ? state.iterations + 1 : state.iterations,
  };
}

async function motionCriticNode(state: typeof GraphState.State) {
  console.log(`--> Motion critic is reviewing iteration ${state.iterations + 1}...`);
  if (!state.videoPath) {
    const criticFeedback = 'Fix all validation errors before approval:\nRecording was not available for motion review.';
    return {
      criticFeedback,
      criticNotes: JSON.stringify({
        verdict: 'REVISE',
        motion: [],
        look: [],
        implementation: [criticFeedback],
      }),
      reviewApproved: false,
      iterations: state.iterations + 1,
    };
  }

  let rawReview = '';
  try {
    rawReview = (await reviewSceneVideo(
      state.videoPath,
      `Original request:\n${state.userPrompt}\n\nDesign plan:\n${state.designPlan}\n\nMotion plan:\n${state.motionPlan}\n\nLook plan:\n${state.lookPlan}\n\nValidation diagnostics:\n${state.runtimeDiagnostics}`,
    )).trim();
  } finally {
    try {
      await unlink(state.videoPath);
    } catch {
      // Clip is still gitignored under uploads/.
    }
  }

  let review;
  try {
    review = parseCriticReview(rawReview);
  } catch {
    review = {
      verdict: 'REVISE' as const,
      motion: [],
      look: [],
      implementation: [rawReview || 'The motion critic returned an unreadable review.'],
    };
  }

  const hasErrors = state.runtimeDiagnostics.includes('[ERROR');
  const criticFeedback = formatCriticFeedback(review, hasErrors);
  const reviewApproved = isCriticApproval(criticFeedback, hasErrors);

  return {
    criticFeedback,
    criticNotes: JSON.stringify(review),
    reviewApproved,
    videoPath: '',
    iterations: state.iterations + 1,
  };
}

export function getNextTechnicalStep(state: Pick<
  typeof GraphState.State,
  'runtimeDiagnostics' | 'iterations' | 'criticFeedback'
>): ReviewRoute {
  const hasErrors = state.runtimeDiagnostics.includes('[ERROR');
  if (!hasErrors) return 'motionCritic';
  return getNextReviewRoute({
    criticFeedback: state.criticFeedback,
    runtimeDiagnostics: state.runtimeDiagnostics,
    iterations: state.iterations,
  });
}

export function getNextReviewStep(state: Pick<
  typeof GraphState.State,
  'criticFeedback' | 'runtimeDiagnostics' | 'iterations' | 'criticNotes'
>): ReviewRoute {
  return getNextReviewRoute(state);
}

const checkpointer = new MemorySaver();

const workflow = new StateGraph(GraphState)
  .addNode('artDirector', artDirectorNode, { retryPolicy: { maxAttempts: 2 } })
  .addNode('specialists', specialistsNode, { retryPolicy: { maxAttempts: 2 } })
  .addNode('motionDirector', motionDirectorNode, { retryPolicy: { maxAttempts: 2 } })
  .addNode('lookDev', lookDevNode, { retryPolicy: { maxAttempts: 2 } })
  .addNode('sceneBuilder', sceneBuilderNode, { retryPolicy: { maxAttempts: 2 } })
  .addNode('technicalGate', technicalGateNode, { retryPolicy: { maxAttempts: 2 } })
  .addNode('motionCritic', motionCriticNode, { retryPolicy: { maxAttempts: 2 } })
  .addEdge('__start__', 'artDirector')
  .addEdge('artDirector', 'specialists')
  .addEdge('specialists', 'sceneBuilder')
  .addEdge('sceneBuilder', 'technicalGate')
  .addConditionalEdges('technicalGate', getNextTechnicalStep)
  .addConditionalEdges('motionCritic', getNextReviewStep)
  .addEdge('motionDirector', 'sceneBuilder')
  .addEdge('lookDev', 'sceneBuilder');

export const agentApp = workflow.compile({ checkpointer });
