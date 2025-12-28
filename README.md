# cf-proxy

A lightweight, cross-platform SOCKS5 and HTTP proxy server built with TypeScript.

## Features

- Supports SOCKS5 and HTTP CONNECT protocols.
- Runs on Linux and Windows.
- Authentication support.
- Docker support.

## Installation

### Local

1. Install dependencies:
   npm install

2. Build the project:
   npm run build

### Docker

docker compose up -d

## Configuration

Create a .env file:

PORT=1080
HOST=0.0.0.0
PROXY_USERNAME=user
PROXY_PASSWORD=pass

## Usage

### Start Locally

npm start

### Start with PM2

npm run start:pm2

### Start on Linux

./scripts/start.sh

### Start on Windows

scripts\start.bat
