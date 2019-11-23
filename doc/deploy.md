# How to Deploy runebaseinfo

runebaseinfo is splitted into 3 repos:
* [https://github.com/runebaseproject/runebaseinfo](https://github.com/runebaseproject/runebaseinfo)
* [https://github.com/runebaseproject/runebaseinfo-api](https://github.com/runebaseproject/runebaseinfo-api)
* [https://github.com/runebaseproject/runebaseinfo-ui](https://github.com/runebaseproject/runebaseinfo-ui)

## Prerequisites

* node.js v12.0+
* mysql v8.0+
* redis v5.0+

## Deploy runebase core
1. `git clone --recursive https://github.com/runebaseproject/runebase.git --branch=runebaseinfo`
2. Follow the instructions of [https://github.com/runebaseproject/runebase/blob/master/README.md#building-runebase-core](https://github.com/runebaseproject/runebase/blob/master/README.md#building-runebase-core) to build runebase
3. Run `runebased` with `-logevents=1` enabled

## Deploy runebaseinfo
1. `git clone https://github.com/runebaseproject/runebaseinfo.git`
2. `cd runebaseinfo && npm install`
3. Create a mysql database and import [docs/structure.sql](structure.sql)
4. Edit file `runebaseinfo-node.json` and change the configurations if needed.
5. `npm run dev`

It is strongly recommended to run `runebaseinfo` under a process manager (like `pm2`), to restart the process when `runebaseinfo` crashes.

## Deploy runebaseinfo-api
1. `git clone https://github.com/runebaseproject/runebaseinfo-api.git`
2. `cd runebaseinfo-api && npm install`
3. Create file `config/config.prod.js`, write your configurations into `config/config.prod.js` such as:
    ```javascript
    exports.security = {
        domainWhiteList: ['http://example.com']  // CORS whitelist sites
    }
    // or
    exports.cors = {
        origin: '*'  // Access-Control-Allow-Origin: *
    }

    exports.sequelize = {
        logging: false  // disable sql logging
    }
    ```
    This will override corresponding field in `config/config.default.js` while running.
4. `npm start`

## Deploy runebaseinfo-ui
This repo is optional, you may not deploy it if you don't need UI.
1. `git clone https://github.com/runebaseproject/runebaseinfo-ui.git`
2. `cd runebaseinfo-ui && npm install`
3. Edit `package.json` for example:
   * Edit `script.build` to `"build": "RUNEBASEINFO_API_BASE_CLIENT=/api/ RUNEBASEINFO_API_BASE_SERVER=http://localhost:3001/ RUNEBASEINFO_API_BASE_WS=//example.com/ nuxt build"` in `package.json` to set the api URL base
   * Edit `script.start` to `"start": "PORT=3000 nuxt start"` to run `runebaseinfo-ui` on port 3000
4. `npm run build`
5. `npm start`
