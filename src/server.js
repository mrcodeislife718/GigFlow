import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createGigFlowHandler } from './http-app.js';

export async function startGigFlowServer({ port = Number(process.env.PORT ?? 3000), host = process.env.HOST ?? '0.0.0.0' } = {}) {
  const handler = await createGigFlowHandler();
  const server = createServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = await startGigFlowServer();
  const address = server.address();
  console.log(`GigFlow listening on ${typeof address === 'object' && address ? address.port : process.env.PORT ?? 3000}`);
}
