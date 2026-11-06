# Scene Foundry Backend

## Initial setup

The equivalent clean-project setup commands are:

```bash
cd backend
npm install
npx prisma init --datasource-provider sqlite
npx prisma generate
npx prisma migrate dev --name init
npm run dev
```

This repository is already initialized. Configure `GOOGLE_API_KEY` in `.env`, then run:

```bash
npm install
npm run db:generate
npm run db:migrate
npm run dev
```

On Windows machines where Smart App Control blocks Prisma's schema-engine executable, initialize the checked-in SQLite migration with:

```bash
npm run db:init:windows
```

## Environment

```env
GOOGLE_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.0-flash
GEMINI_FALLBACK_MODEL=gemini-2.0-flash-lite
DATABASE_URL=file:./dev.db
FRONTEND_ORIGIN=http://localhost:5173
PORT=3000
```

## API

### `GET /health`

Checks both the HTTP application and Prisma database connection.

### `POST /api/upload`

Accepts one multipart field named `asset`. Supported extensions are PNG, JPEG, WebP, GIF, SVG, GLB, GLTF, OBJ, and FBX. The maximum size is 15 MB.

### `POST /api/generate`

Request:

```json
{
  "prompt": "Build a glass planet orbiting a warm sun",
  "threadId": "optional-uuid"
}
```

The response is `text/event-stream` and may contain:

```text
event: project
data: {"projectId":"...","threadId":"..."}

event: status
data: {"node":"artDirector","phase":"Design plan ready","iterations":0}

event: status
data: {"node":"sceneBuilder","phase":"Scene implementation ready","iterations":0}

event: status
data: {"node":"critic","phase":"Critic approved the scene","iterations":1,"diagnostics":"None"}

event: complete
data: {"projectId":"...","threadId":"...","code":"...","iterations":1,"criticFeedback":"APPROVED","diagnostics":"None"}
```

Errors emitted after streaming begins use the `error` SSE event.

## Workflow

```text
Art Director -> Scene Builder -> Critic
                    ^             |
                    |-- revision --|
```

The Critic ends the workflow on exact `APPROVED` or after three reviews. `MemorySaver` checkpoints each run by `thread_id`. Every new frontend generation uses a new UUID to avoid merging unrelated project state.

Before critic review, generated HTML is checked for required document structure and unsafe navigation or embedding primitives. Puppeteer then captures console errors, uncaught exceptions, failed network requests, HTTP failures, canvas visibility, and WebGL availability. Runtime errors prevent approval and are sent back to Scene Builder as revision context.

Run validation and browser diagnostic regression tests with:

```bash
npm test
```
