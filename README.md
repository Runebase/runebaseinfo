# runebase-explorer-daemon

Blockchain indexer for the Runebase network. Syncs with a Runebase Core node via P2P and RPC, indexes blocks, transactions, contracts, and QRC20/QRC721 tokens into MySQL.

runebase-explorer-daemon is split into 3 repos:
- [runebase-explorer-daemon](https://github.com/runebase/runebase-explorer-daemon) (this repo) - blockchain indexer
- [runebase-explorer-api](https://github.com/runebase/runebase-explorer-api) - REST API
- [runebase-explorer-ui](https://github.com/runebase/runebase-explorer-ui) - web frontend

[API documentation](https://github.com/runebase/runebase-explorer-api/blob/master/README.md)

## Prerequisites

- Node.js v12.0+
- MySQL v8.0+
- Redis v5.0+
- Runebase Core (built with `-logevents=1`)

## Deploy Runebase Core

1. `git clone --recursive https://github.com/runebase/runebase.git --branch=runebase-explorer-daemon`
2. Follow the [build instructions](https://github.com/runebase/runebase/blob/master/README.md#building-runebase-core)
3. Run `runebased` with `-logevents=1` enabled

## Deploy runebase-explorer-daemon

### 1. Clone and install

```bash
git clone https://github.com/runebase/runebase-explorer-daemon.git
cd runebase-explorer-daemon
npm install
```

### 2. Create MySQL database

```bash
mysql -u root -p -e "CREATE DATABASE runebase_explorer;"
mysql -u root -p -e "CREATE USER 'runebase_explorer'@'localhost' IDENTIFIED BY 'your_password';"
mysql -u root -p -e "GRANT ALL PRIVILEGES ON runebase_explorer.* TO 'runebase_explorer'@'localhost';"
```

### 3. Configure environment

Copy the example env file and edit it with your settings:

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Chain
CHAIN=mainnet

# Database
DB_NAME=runebase_explorer
DB_USER=runebase_explorer
DB_PASS=your_password
DB_HOST=localhost
DB_PORT=3306

# RPC (Runebase Core)
RPC_PROTOCOL=http
RPC_HOST=localhost
RPC_PORT=9948
RPC_USER=runebase_explorer
RPC_PASS=runebase_explorer

# P2P
P2P_PORT=9433

# Server (Socket.IO)
SERVER_PORT=3001
```

### 4. Run database migrations

```bash
npm run db:migrate
```

### 5. Start the indexer

Development (with hot reload):
```bash
npm run dev
```

Production (build + run):
```bash
npm run build
npm start
```

It is strongly recommended to run `runebase-explorer-daemon` under a process manager (like `pm2`):

```bash
npm install -g pm2
npm run build
pm2 start dist/index.mjs --name runebase-explorer-daemon --interpreter node --node-args="--experimental-specifier-resolution=node" -- start
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `CHAIN` | `mainnet` | Blockchain network (`mainnet` or `testnet`) |
| `DB_NAME` | `runebase_explorer` | MySQL database name |
| `DB_USER` | `root` | MySQL username |
| `DB_PASS` | (empty) | MySQL password |
| `DB_HOST` | `localhost` | MySQL host |
| `DB_PORT` | `3306` | MySQL port |
| `RPC_PROTOCOL` | `http` | Runebase Core RPC protocol |
| `RPC_HOST` | `localhost` | Runebase Core RPC host |
| `RPC_PORT` | `3889` | Runebase Core RPC port |
| `RPC_USER` | `user` | Runebase Core RPC username |
| `RPC_PASS` | `password` | Runebase Core RPC password |
| `P2P_PORT` | `9433` | Runebase Core P2P port |
| `SERVER_PORT` | `3001` | Socket.IO server port |

## Database Migrations

Migrations are managed with [sequelize-cli](https://github.com/sequelize/cli):

```bash
# Run pending migrations
npm run db:migrate

# Undo last migration
npm run db:migrate:undo

# Check migration status
npm run db:migrate:status
```

## Deploy runebase-explorer-api

1. `git clone https://github.com/runebase/runebase-explorer-api.git`
2. `cd runebase-explorer-api && npm install`
3. Create file `config/config.prod.js` with your configuration:
    ```javascript
    exports.security = {
        domainWhiteList: ['http://example.com']
    }

    exports.sequelize = {
        logging: false
    }
    ```
4. `npm start`

## Deploy runebase-explorer-ui

This repo is optional — you may skip it if you don't need a web UI.

1. `git clone https://github.com/runebase/runebase-explorer-ui.git`
2. `cd runebase-explorer-ui && npm install`
3. Edit `package.json`:
   - Set `script.build` to: `"build": "RUNEBASE_EXPLORER_API_BASE_CLIENT=/api/ RUNEBASE_EXPLORER_API_BASE_SERVER=http://localhost:3001/ RUNEBASE_EXPLORER_API_BASE_WS=//example.com/ nuxt build"`
   - Set `script.start` to: `"start": "PORT=3000 nuxt start"`
4. `npm run build`
5. `npm start`

## License

MIT
