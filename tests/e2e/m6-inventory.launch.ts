import { test } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
const run = promisify(execFile);

// Orchestration only: the reviewer's unmodified script owns every UI observation.
test('independent collection UI probe', async ({ baseURL, browserName }, info) => {
  const script = fileURLToPath(new URL('../reviews/sakurai-m6-probe2.mjs', import.meta.url));
  const result = await run(process.execPath, [script], { env: { ...process.env, BASE_URL: baseURL,
    ENGINES: browserName, OUT_DIR: info.outputPath('own-probe') }, maxBuffer: 16 * 1024 * 1024 });
  console.log(result.stdout);
  if (result.stderr) console.error(result.stderr);
});
