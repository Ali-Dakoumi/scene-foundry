import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config({ override: true });

const raw = process.env.DATABASE_URL ?? '';
const url = new URL(raw);
console.log('host', url.hostname);
console.log('port', url.port || '5432');
console.log('sslmode', url.searchParams.get('sslmode') || '(none)');
console.log('pooler', url.hostname.includes('-pooler'));

async function tryConnect(label, connectionUrl) {
  const prisma = new PrismaClient({
    datasources: { db: { url: connectionUrl } },
  });
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1 AS ok`;
    const projects = await prisma.project.count();
    const knowledge = await prisma.knowledgeItem.count();
    console.log(label, 'ok', `${Date.now() - started}ms`, { projects, knowledge });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
    console.log(label, 'fail', `${Date.now() - started}ms`, message.replace(url.password, '***'));
    return false;
  } finally {
    await prisma.$disconnect();
  }
}

const withTimeout = new URL(raw);
withTimeout.searchParams.set('sslmode', withTimeout.searchParams.get('sslmode') || 'require');
withTimeout.searchParams.set('connect_timeout', '30');

const direct = new URL(withTimeout);
direct.hostname = direct.hostname.replace('-pooler', '');
direct.searchParams.delete('pgbouncer');

await tryConnect('current', raw);
await tryConnect('timeout30', withTimeout.href);
await tryConnect('direct', direct.href);
