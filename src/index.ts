import net from 'net';
import { config } from './config';
import { handleSocks5 } from './socks5';
import { handleHttpProxy } from './http-proxy';

const server = net.createServer((socket) => {
    socket.once('data', (data) => {
        if (!Buffer.isBuffer(data)) return;
        // Detect protocol
        // SOCKS5 starts with 0x05
        if (data[0] === 0x05) {
            handleSocks5(socket, data);
        } else {
            // Assume HTTP
            handleHttpProxy(socket, data);
        }
    });

    socket.on('error', (err) => {
        console.error('Socket error:', err.message);
    });
});

server.listen(config.PORT, config.HOST, () => {
    console.log(`cf-proxy listening on ${config.HOST}:${config.PORT}`);
    if (config.USERNAME && config.PASSWORD) {
        console.log('Authentication enabled');
    } else {
        console.log('Authentication disabled (Open Proxy)');
    }
});
