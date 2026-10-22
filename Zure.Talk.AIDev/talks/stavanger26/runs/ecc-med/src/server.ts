import { startServer } from './app.js';
import { configFromEnv } from './config.js';

const DEFAULT_PORT = 3000;

startServer({ port: Number(process.env.PORT) || DEFAULT_PORT, config: configFromEnv() })
  .then(({ port }) => process.stdout.write(`listening on ${port}\n`))
  .catch((err: unknown) => {
    process.stderr.write(`failed to start: ${String(err)}\n`);
    process.exit(1);
  });
