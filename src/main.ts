import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defaultContext, run } from "./cli.js";

const scriptPath = realpathSync(fileURLToPath(import.meta.url));
const outcome = run(process.argv.slice(2), defaultContext(scriptPath));
if (outcome.stdout) process.stdout.write(outcome.stdout.endsWith("\n") ? outcome.stdout : `${outcome.stdout}\n`);
if (outcome.stderr) process.stderr.write(`${outcome.stderr}\n`);
process.exitCode = outcome.code;
