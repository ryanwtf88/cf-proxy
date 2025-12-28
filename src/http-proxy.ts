import { Socket } from 'net';
import { config } from './config';
import net from 'net';
import WebSocket from 'ws';
import { createWebSocketStream } from 'ws';

export function handleHttpProxy(socket: Socket, data: Buffer) {
    const dataStr = data.toString();
    const workerUrl = config.WORKER_URL ? config.WORKER_URL.replace(/\/$/, '') : null;
    // We only support CONNECT for now for HTTPS tunneling
    // For plain HTTP proxying, we would need to parse the method and URL.
    // Given the "VPN" requirement, CONNECT is what makes it behave most like a transparent tunnel for browsers.

    const lines = dataStr.split('\r\n');
    const requestLine = lines[0];
    const [method, url] = requestLine.split(' ');

    if (method === 'CONNECT') {
        const [host, portStr] = url.split(':');
        const port = portStr ? parseInt(portStr) : 443;

        console.log(`[HTTP] CONNECT to ${host}:${port}`);

        // Check auth
        // Proxy-Authorization: Basic <base64>
        if (config.USERNAME && config.PASSWORD) {
            const authHeader = lines.find(line => line.toLowerCase().startsWith('proxy-authorization:'));
            if (!authHeader) {
                socket.write('HTTP/1.1 407 Proxy Authentication Required\r\n');
                socket.write('Proxy-Authenticate: Basic realm="Global Proxy"\r\n\r\n');
                socket.end();
                return;
            }
            const credentials = authHeader.split(' ')[2];
            const decoded = Buffer.from(credentials, 'base64').toString();
            const [user, pass] = decoded.split(':');
            if (user !== config.USERNAME || pass !== config.PASSWORD) {
                socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
                socket.end();
                return;
            }
        }

        if (workerUrl) {
            console.log(`[HTTP] Tunneling to ${host}:${port} via Worker`);
            const wsUrl = `${workerUrl}/?target=${host}:${port}`;
            const ws = new WebSocket(wsUrl);
            const wsStream = createWebSocketStream(ws);

            ws.on('open', () => {
                socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
                wsStream.pipe(socket);
                socket.pipe(wsStream);
            });

            ws.on('error', (err) => {
                console.error(`[HTTP] Worker error connecting to ${host}:${port}`, err.message);
                try { socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n'); } catch (e) { }
                socket.end();
            });
        } else {
            const serverConn = net.createConnection(port, host, () => {
                socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
                serverConn.pipe(socket);
                socket.pipe(serverConn);
            });

            serverConn.on('error', (err) => {
                console.error(`[HTTP] Error connecting to ${host}:${port}`, err.message);
                try { socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n'); } catch (e) { }
                socket.end();
            });
        }

    } else {
        // Simple HTTP forward proxy
        // This is a naive implementation for demonstration.
        try {
            const urlObj = new URL(url);
            // Verify auth here too if needed (same logic as CONNECT)
            // ...

            const port = urlObj.port ? parseInt(urlObj.port) : 80;
            const host = urlObj.hostname;

            console.log(`[HTTP] Proxying ${method} ${url}`);

            if (workerUrl) {
                console.log(`[HTTP] Tunneling to ${host}:${port} via Worker`);
                const wsUrl = `${workerUrl}/?target=${host}:${port}`;
                const ws = new WebSocket(wsUrl);
                const wsStream = createWebSocketStream(ws);

                ws.on('open', () => {
                    // We don't need to write 'Connection Established' for standard HTTP proxy
                    wsStream.write(data);
                    wsStream.pipe(socket);
                    socket.pipe(wsStream);
                });

                ws.on('error', (err) => {
                    console.error(`[HTTP] Worker error connecting to ${host}:${port}`, err.message);
                    socket.end();
                });
            } else {
                const serverConn = net.createConnection(port, host, () => {
                    serverConn.write(data);
                    serverConn.pipe(socket);
                    socket.pipe(serverConn);
                });

                serverConn.on('error', (err) => {
                    console.error(`[HTTP] Error proxying to ${host}:${port}`, err.message);
                    socket.end();
                });
            }

        } catch (e) {
            console.error('[HTTP] Invalid URL or request:', requestLine);
            socket.end();
        }
    }
}
