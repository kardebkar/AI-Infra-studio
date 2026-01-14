import { createServer } from './server';

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? '0.0.0.0';

const server = await createServer();

await server.listen({ port, host });
server.log.info({ port, host }, 'API listening');
