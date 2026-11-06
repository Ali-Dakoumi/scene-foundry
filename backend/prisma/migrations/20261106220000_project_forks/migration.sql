ALTER TABLE "Project" ADD COLUMN "parentProjectId" TEXT;

CREATE INDEX "Project_parentProjectId_idx" ON "Project"("parentProjectId");
