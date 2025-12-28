export default {
    async fetch(request: Request, env: any, ctx: any): Promise<Response> {
        const upgradeHeader = request.headers.get("Upgrade");
        if (!upgradeHeader || upgradeHeader !== "websocket") {
            return new Response("Expected Upgrade: websocket", { status: 426 });
        }

        const url = new URL(request.url);
        const target = url.searchParams.get("target"); // e.g., ?target=example.com:80

        if (!target) {
            return new Response("Missing target param", { status: 400 });
        }

        const [host, portStr] = target.split(":");
        const port = portStr ? parseInt(portStr) : 80;

        const webSocketPair = new WebSocketPair();
        const [client, server] = Object.values(webSocketPair);

        server.accept();

        // Establish TCP connection to target
        try {
            const socket = connect({ hostname: host, port: port });
            const writer = socket.writable.getWriter();
            const reader = socket.readable.getReader();

            server.addEventListener("message", async (event) => {
                try {
                    if (event.data instanceof ArrayBuffer) {
                        await writer.write(new Uint8Array(event.data));
                    } else if (typeof event.data === 'string') {
                        const encoder = new TextEncoder();
                        await writer.write(encoder.encode(event.data));
                    }
                } catch (e) {
                    console.error("Write error:", e);
                    server.close();
                }
            });

            server.addEventListener("close", () => {
                try { socket.close(); } catch (e) { }
            });

            // Pump data from socket to websocket
            (async () => {
                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        server.send(value);
                    }
                } catch (e) {
                    console.error("Read error:", e);
                } finally {
                    server.close();
                }
            })();

        } catch (e) {
            console.error("Connect error:", e);
            server.close();
            return new Response("Connect failed", { status: 502 });
        }

        return new Response(null, {
            status: 101,
            webSocket: client,
        });
    },
};

// Simple connect polyfill helper if not available in types (it is in Workers)
import { connect } from 'cloudflare:sockets';
