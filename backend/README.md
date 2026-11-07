# Scene Foundry Backend

Multi-agent WebGL scene generator. Text generation uses a free-provider chain. Neon PostgreSQL via Prisma is unchanged.

## AI providers

Priority:

1. OpenRouter free model (`openrouter/free` by default)
2. Optional second OpenRouter free model (`OPENROUTER_FALLBACK_MODEL`, must include `:free`)
3. Ollama local model (`qwen2.5-coder:7b`)
4. Cloudflare Workers AI, if account id and token are set
5. OpenAI (ChatGPT API) when `OPENAI_API_KEY` is set
6. Gemini when `GOOGLE_API_KEY` is set or `AI_INCLUDE_GEMINI=true`

Paid OpenRouter models are rejected. OpenAI is billed by OpenAI and is optional. Gemini remains optional.

## Initial setup

```bash
cd backend
npm install
npx prisma generate
npm run dev
```

The Neon `DATABASE_URL` in `.env` is already the project database. Do not reset it.

### OpenRouter (primary)

Create a free key at [https://openrouter.ai/keys](https://openrouter.ai/keys) and set `OPENROUTER_API_KEY` in `backend/.env`.

### Ollama (local fallback, Windows)

```powershell
winget install Ollama.Ollama
ollama pull qwen2.5-coder:7b
ollama serve
```

Default API: `http://localhost:11434/v1`.

### Cloudflare (optional)

From the Cloudflare dashboard: Workers & Pages → Workers AI. Set `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`.

### OpenAI / ChatGPT (optional paid fallback)

Set `OPENAI_API_KEY` in `backend/.env`. Default model is `gpt-4o-mini`. This is billed by OpenAI and is used after free OpenRouter quota fails. Set `AI_PROVIDER=openai` to try OpenAI first.

### Gemini (optional)

Set `GOOGLE_API_KEY` and `AI_INCLUDE_GEMINI=true` only if you still want Gemini in the chain. YouTube ingest still uses Gemini when a Google key is present.

## Environment

See `.env.example`. Required for boot: `DATABASE_URL`. At least one text provider should be usable (OpenRouter, OpenAI, local Ollama, Cloudflare, or Gemini).

## Commands

```bash
npm run dev          # backend with nodemon
npm start            # node dist/server.js after npm run build
npm test             # TypeScript compile + unit/live tests
npm run knowledge:seed
npm run review:blob   # record and vision-critique the local SPA field study
```

Run the SPA field study recorder with both the Vite frontend and backend environment configured. Start Vite first; the command records `/blob.html` from `FRONTEND_ORIGIN` (or an optional origin argument), writes an MP4 under `public/uploads`, and prints runtime diagnostics plus the vision critique:

```bash
cd frontend
npm run dev
```

In another terminal:

```bash
cd backend
npm run review:blob
```

If Vite selected another port, pass its origin explicitly:

```bash
npm run review:blob -- http://localhost:5181
```

## API

Existing routes are unchanged: `GET /health`, `GET /api/projects`, `GET /api/projects/:id`, `POST /api/generate` (SSE), `POST /api/knowledge/ingest`, `GET /api/knowledge`, `POST /api/upload`.

Successful generations still write `Project.finalCode` through Prisma to Neon.
