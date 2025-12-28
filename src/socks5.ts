import { Socket } from 'net';
import { config } from './config';
import WebSocket from 'ws';
import { createWebSocketStream } from 'ws';

const SOCKS_VERSION = 5;
const AUTH_METHOD_NO_AUTH = 0;
const AUTH_METHOD_USERNAME_PASSWORD = 2;
const AUTH_METHOD_NO_ACCEPTABLE = 0xFF;

const CMD_CONNECT = 1;

const ATYP_IPV4 = 1;
const ATYP_DOMAINNAME = 3;
const ATYP_IPV6 = 4;

export function handleSocks5(socket: Socket, data: Buffer) {
    // Initial handshake
    if (data[0] !== SOCKS_VERSION) {
        // Not SOCKS5
        return false;
    }

    const nMethods = data[1];
    const methods = data.slice(2, 2 + nMethods);

    let selectedMethod = AUTH_METHOD_NO_ACCEPTABLE;

    if (config.USERNAME && config.PASSWORD) {
        if (methods.includes(AUTH_METHOD_USERNAME_PASSWORD)) {
            selectedMethod = AUTH_METHOD_USERNAME_PASSWORD;
        }
    } else {
        if (methods.includes(AUTH_METHOD_NO_AUTH)) {
            selectedMethod = AUTH_METHOD_NO_AUTH;
        }
    }

    socket.write(Buffer.from([SOCKS_VERSION, selectedMethod]));

    if (selectedMethod === AUTH_METHOD_NO_ACCEPTABLE) {
        socket.end();
        return true;
    }

    if (selectedMethod === AUTH_METHOD_USERNAME_PASSWORD) {
        socket.once('data', (authData) => {
            if (Buffer.isBuffer(authData)) handleAuth(socket, authData);
        });
    } else {
        socket.once('data', (reqData) => {
            if (Buffer.isBuffer(reqData)) handleRequest(socket, reqData);
        });
    }

    return true;
}

function handleAuth(socket: Socket, data: Buffer) {
    if (data[0] !== 1) { // Auth version must be 1
        socket.end();
        return;
    }

    const ulen = data[1];
    const username = data.slice(2, 2 + ulen).toString();
    const plen = data[2 + ulen];
    const password = data.slice(2 + ulen + 1, 2 + ulen + 1 + plen).toString();

    if (username === config.USERNAME && password === config.PASSWORD) {
        socket.write(Buffer.from([1, 0])); // Success
        socket.once('data', (reqData) => {
            if (Buffer.isBuffer(reqData)) handleRequest(socket, reqData);
        });
    } else {
        socket.write(Buffer.from([1, 1])); // Failure
        socket.end();
    }
}

function handleRequest(socket: Socket, data: Buffer) {
    const cmd = data[1];
    if (cmd !== CMD_CONNECT) {
        // Only CONNECT supported
        const reply = Buffer.from([SOCKS_VERSION, 7, 0, 1, 0, 0, 0, 0, 0, 0]); // Command not supported
        socket.write(reply);
        socket.end();
        return;
    }

    let addr = '';
    let port = 0;
    let addrOffset = 0;

    const atyp = data[3];
    if (atyp === ATYP_IPV4) {
        addr = data.slice(4, 8).join('.');
        addrOffset = 8;
    } else if (atyp === ATYP_DOMAINNAME) {
        const len = data[4];
        addr = data.slice(5, 5 + len).toString();
        addrOffset = 5 + len;
    } else if (atyp === ATYP_IPV6) {
        // Simplified IPv6 handling
        const reply = Buffer.from([SOCKS_VERSION, 8, 0, 1, 0, 0, 0, 0, 0, 0]); // Address type not supported (for now/simplicity)
        socket.write(reply);
        socket.end();
        return;
    }

    port = data.readUInt16BE(addrOffset);

    const net = require('net');

    if (config.WORKER_URL) {
        console.log(`[SOCKS5] Tunneling to ${addr}:${port} via Worker`);
        const wsUrl = `${config.WORKER_URL}?target=${addr}:${port}`;
        const ws = new WebSocket(wsUrl);
        const wsStream = createWebSocketStream(ws);

        ws.on('open', () => {
            const reply = Buffer.from([SOCKS_VERSION, 0, 0, 1, 0, 0, 0, 0, 0, 0]);
            socket.write(reply);
            wsStream.pipe(socket);
            socket.pipe(wsStream);
        });

        ws.on('error', (err: any) => {
            console.error(`[SOCKS5] Worker error connecting to ${addr}:${port}:`, err.message);
            if (!socket.destroyed && socket.writable) {
                const reply = Buffer.from([SOCKS_VERSION, 5, 0, 1, 0, 0, 0, 0, 0, 0]);
                try { socket.write(reply); } catch (e) { }
            }
            socket.end();
        });
    } else {
        console.log(`[SOCKS5] Connecting to ${addr}:${port}`);

        const serverConn = net.createConnection(port, addr, () => {
            const reply = Buffer.from([SOCKS_VERSION, 0, 0, 1, 0, 0, 0, 0, 0, 0]);
            socket.write(reply);
            socket.pipe(serverConn);
            serverConn.pipe(socket);
        });

        serverConn.on('error', (err: any) => {
            console.error(`[SOCKS5] Error connecting to ${addr}:${port}:`, err.message);
            // Reply with failure if we haven't already replied?
            // Hard to send SOCKS reply if we are already piping, but if connection failed immediately:
            if (!socket.destroyed && socket.writable) {
                const reply = Buffer.from([SOCKS_VERSION, 5, 0, 1, 0, 0, 0, 0, 0, 0]); // Connection refused
                try { socket.write(reply); } catch (e) { }
            }
            socket.end();
        });
    }
}
