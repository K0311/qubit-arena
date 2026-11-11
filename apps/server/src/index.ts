import { startServer } from './server';

const port = Number(process.env.PORT ?? 8080);
const server = await startServer({ port });
console.log(`[server] Qubit Arena listening on ws://localhost:${server.port}`);
