/** Shared controlled transport only; callers supply separate source-fixed route predicates. */
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import dgram from 'node:dgram';
import http2 from 'node:http2';
import dns from 'node:dns';
import childProcess from 'node:child_process';
import workerThreads from 'node:worker_threads';
import Module from 'node:module';
import { Entry } from './collection-recovery-keyring.mjs';
import { recoveryHost, recoveryTrace } from './collection-recovery-control.mjs';

export function installCollectionLocalTransport(config, routeAllowed) {
  const record = (event) => recoveryTrace(config, event);
  const deny = (kind) => function forbidden() {
    record({ event: 'blocked', kind });
    throw new Error('Unapproved network or credential operation in local recovery acceptance.');
  };
  const originalRequest = http.request, originalLoad = Module._load;
  Module._load = function keyringWithoutNative(request, ...args) {
    if (request === '@napi-rs/keyring') return { Entry };
    if (typeof request === 'string' && request.includes('keyring')) return deny('native-keyring')();
    return originalLoad.call(this, request, ...args);
  };
  let connecting = false;
  function connectionAllowed(args) {
    const value = Array.isArray(args[0]) ? args[0][0] : args[0];
    return connecting && value && typeof value === 'object' && value.host === '127.0.0.1' && Number(value.port) === config.port;
  }
  for (const key of ['connect', 'createConnection']) {
    const original = net[key];
    net[key] = function guardedConnect(...args) { return connectionAllowed(args) ? original.apply(this, args) : deny(`net.${key}`)(); };
  }
  const originalSocketConnect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function guardedSocket(...args) {
    return connectionAllowed(args) ? originalSocketConnect.apply(this, args) : deny('net.Socket.connect')();
  };
  http.request = deny('http.request'); http.get = deny('http.get');
  https.request = function bridge(options, callback) {
    if (!options || typeof options !== 'object' || options instanceof URL || options.hostname !== recoveryHost
      || options.port && Number(options.port) !== 443 || options.protocol && options.protocol !== 'https:'
      || !routeAllowed(options.method ?? 'GET', options.path)) return deny('https.request')();
    record({ event: 'request', method: options.method ?? 'GET', path: options.path });
    connecting = true;
    try {
      return originalRequest({ ...options, hostname: '127.0.0.1', host: '127.0.0.1', port: config.port,
        protocol: 'http:', agent: false }, callback);
    } finally { connecting = false; }
  };
  https.get = (options, callback) => { const request = https.request(options, callback); request.end(); return request; };
  tls.connect = deny('tls.connect');
  dgram.createSocket = deny('dgram.createSocket'); dgram.Socket.prototype.send = deny('dgram.send'); dgram.Socket.prototype.connect = deny('dgram.connect');
  http2.connect = deny('http2.connect'); globalThis.fetch = deny('fetch');
  for (const target of [dns, dns.promises, dns.Resolver.prototype, dns.promises.Resolver.prototype]) {
    for (const key of Object.getOwnPropertyNames(target)) {
      if (/^(lookup|resolve|reverse)/u.test(key) && typeof target[key] === 'function') target[key] = deny(`dns.${key}`);
    }
  }
  for (const key of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) childProcess[key] = deny(`childProcess.${key}`);
  workerThreads.Worker = deny('workerThreads.Worker');
}
