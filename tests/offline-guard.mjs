// Catch accidental live-network calls in the Node test harness. Not a security
// sandbox: the tests are trusted repository code, and their browser APIs are mocks.
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import dgram from 'node:dgram';
import { syncBuiltinESMExports } from 'node:module';

function blocked() { throw new Error('Live network is disabled in offline tests'); }
globalThis.fetch = blocked;
http.request = http.get = blocked;
https.request = https.get = blocked;
net.Socket.prototype.connect = blocked;
dgram.createSocket = blocked;
syncBuiltinESMExports();
