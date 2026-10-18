/** Preload for this local rejection slice only. It blocks attempts, never logs request arguments. */
import { appendFileSync, lstatSync, realpathSync } from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import dgram from 'node:dgram';
import http2 from 'node:http2';
import { syncBuiltinESMExports } from 'node:module';

const file = process.env.FREELOG_TEST_NETWORK_LOG;
if (typeof file !== 'string' || !path.isAbsolute(file) || path.resolve(file) !== file
  || !lstatSync(file).isFile() || lstatSync(file).isSymbolicLink() || realpathSync(file) !== file) {
  throw new Error('The local network guard requires its existing regular absolute log file.');
}
let attempts = 0;
const record = (value) => appendFileSync(file, `${JSON.stringify({ schemaVersion: 1, ...value })}\n`, 'utf8');
const deny = (kind) => function denyNetworkAttempt() {
  attempts += 1;
  record({ event: 'blocked', kind });
  const error = new Error('Network access is forbidden in a local parameter-rejection case.');
  error.code = 'FREELOG_TEST_NETWORK_FORBIDDEN';
  throw error;
};
http.request = deny('http.request');
http.get = deny('http.get');
https.request = deny('https.request');
https.get = deny('https.get');
net.connect = deny('net.connect');
net.createConnection = deny('net.createConnection');
net.Socket.prototype.connect = deny('net.Socket.connect');
tls.connect = deny('tls.connect');
dgram.createSocket = deny('dgram.createSocket');
dgram.Socket.prototype.send = deny('dgram.Socket.send');
dgram.Socket.prototype.connect = deny('dgram.Socket.connect');
http2.connect = deny('http2.connect');
globalThis.fetch = deny('fetch');
syncBuiltinESMExports();
record({ event: 'ready', guard: 'local-parameter-no-network-v1' });
process.once('exit', () => record({ event: 'finished', attempts }));
