/** Standalone bounded PTY capability process; no accounts or network operations. */
import { probeTty } from '../tty-driver.mjs';

try {
  const result = await probeTty(process.argv[2] ?? process.cwd());
  console.log(JSON.stringify(result));
  // Exit only this owned probe after recording its result, not unrelated user processes.
  process.exit(result.available ? 0 : 3);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
