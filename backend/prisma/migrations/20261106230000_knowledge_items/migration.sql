CREATE TABLE IF NOT EXISTS "KnowledgeItem" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "codeSnippet" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KnowledgeItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "KnowledgeItem_category_createdAt_idx" ON "KnowledgeItem"("category", "createdAt");
