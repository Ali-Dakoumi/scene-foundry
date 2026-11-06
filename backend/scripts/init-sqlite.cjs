const { createHash, randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const databasePath = path.resolve(__dirname, '../prisma/dev.db');
const migrationPath = path.resolve(
  __dirname,
  '../prisma/migrations/20261106170000_init/migration.sql',
);
const migrationName = '20261106170000_init';
const migrationSql = readFileSync(migrationPath, 'utf8');
const database = new DatabaseSync(databasePath);

try {
  database.exec(migrationSql.replace('CREATE TABLE', 'CREATE TABLE IF NOT EXISTS'));
  database.exec(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "checksum" TEXT NOT NULL,
      "finished_at" DATETIME,
      "migration_name" TEXT NOT NULL,
      "logs" TEXT,
      "rolled_back_at" DATETIME,
      "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0
    )
  `);

  const existing = database
    .prepare('SELECT 1 FROM "_prisma_migrations" WHERE "migration_name" = ?')
    .get(migrationName);

  if (!existing) {
    database.prepare(`
      INSERT INTO "_prisma_migrations"
        ("id", "checksum", "finished_at", "migration_name", "applied_steps_count")
      VALUES (?, ?, CURRENT_TIMESTAMP, ?, 1)
    `).run(
      randomUUID(),
      createHash('sha256').update(migrationSql).digest('hex'),
      migrationName,
    );
  }
} finally {
  database.close();
}
