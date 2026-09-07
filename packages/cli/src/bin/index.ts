import { bootstrapPlatform } from '../platform/bootstrap';
import { runCli } from './program';

bootstrapPlatform();
process.exitCode = await runCli(process.argv, { from: 'node' });
