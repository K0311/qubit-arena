import { startServer } from './server';
import { testHooksFromEnv } from './test-hooks';

const port = Number(process.env.PORT ?? 8080);
// TEST_SEED / TEST_DECK are read only when NODE_ENV=test (test-plan §3.5).
const testHooks = testHooksFromEnv(process.env);
const server = await startServer({ port, ...(testHooks ? { testHooks } : {}) });
console.log(`[server] Qubit Arena listening on ws://localhost:${server.port}`);
if (testHooks) console.log('[server] TEST MODE: fixed seed/deck', JSON.stringify(testHooks));
