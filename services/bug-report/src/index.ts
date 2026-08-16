import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const app = buildApp({ config });

try {
  await app.listen({ host: "0.0.0.0", port: config.port });
  process.stdout.write(`Bug report server listening on port ${config.port}\n`);
} catch (error) {
  process.stderr.write("Bug report server failed to start.\n");
  process.exitCode = 1;
}
