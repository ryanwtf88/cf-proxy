import dotenv from 'dotenv';
dotenv.config();

export const config = {
    PORT: process.env.PORT ? parseInt(process.env.PORT) : 1080,
    HOST: process.env.HOST || '0.0.0.0',
    USERNAME: process.env.PROXY_USERNAME,
    PASSWORD: process.env.PROXY_PASSWORD
};
