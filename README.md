# Scene Foundry

Multi-agent creative WebGL/GSAP generator. One monorepo with a Vite vanilla TypeScript frontend, a Node.js/Express/LangGraph backend, and a markdown/TS knowledge base used by the agents.

## Layout

- `frontend/` — Vite, vanilla TypeScript, HTML/CSS
- `backend/` — Express, LangGraph.js, Prisma, Puppeteer
- `knowledge/` — prompt context (rules and snippets)

## Setup

Copy `backend/.env.example` to `backend/.env` and fill in real values. Do not commit `.env`.

```bash
cd backend
npm install
npm run db:generate
npm run db:migrate
npm run dev
```

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Frontend defaults to `http://localhost:5173`. Backend defaults to `http://localhost:3000`.
