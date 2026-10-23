/** Existing publication isolation plus bounded, lossless child stream observations. */
import './collection-publish-preflight-preload.mjs';
import { loadRecoveryControl, recoveryTrace } from './collection-recovery-control.mjs';
const config = loadRecoveryControl(); let captured = 0;
for (const name of ['stdout', 'stderr']) {
  const stream = process[name], original = stream.write;
  stream.write = function observeStream(chunk, ...args) {
    const bytes = typeof chunk === 'string' ? Buffer.from(chunk, typeof args[0] === 'string' ? args[0] : 'utf8') : Buffer.from(chunk);
    captured += bytes.length;
    if (captured > 1_000_000) { recoveryTrace(config, { event: 'stream-limit' }); throw new Error('Owned preview stream bound exceeded.'); }
    recoveryTrace(config, { event: 'stream-write', stream: name, bytes: bytes.toString('base64') });
    return original.call(this, chunk, ...args);
  };
}
recoveryTrace(config, { event: 'preview-capture-ready', stdinTTY: process.stdin.isTTY === true, stdoutTTY: process.stdout.isTTY === true });
