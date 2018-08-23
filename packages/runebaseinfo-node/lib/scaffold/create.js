const path = require('path')
const fs = require('fs')
const {spawn} = require('child_process')
const {promisify} = require('util')
const mkdirp = require('mkdirp')
const {version} = require('../..')
const defaultConfig = require('./default-config')

const writeFile = promisify(fs.writeFile)
const exists = promisify(fs.exists)
const mkdirpPromise = promisify(mkdirp)

const BASE_PACKAGE = {
  description: 'A full Runebase node build with Runebaseinfo',
  repository: 'https://github.com/user/project',
  license: 'MIT',
  readme: 'README.md',
  dependencies: {
    'runebaseinfo-node': '^' + version
  }
}

async function createConfigDirectory(options, configDir, isGlobal) {
  await mkdirpPromise(configDir)
  let configInfo = defaultConfig(options)
  let config = configInfo.config

  let configJSON = JSON.stringify(config, null, 2)
  let packageJSON = JSON.stringify(BASE_PACKAGE, null, 2)
  await writeFile(configDir + '/runebaseinfo-node.json', configJSON)
  if (!isGlobal) {
    await writeFile(configDir + '/package.json', packageJSON)
  }
}

async function create({cwd, dirname, isGlobal, datadir, network}) {
  let absConfigDir = path.resolve(cwd, dirname)
  let absDataDir = path.resolve(absConfigDir, datadir)

  if (!await exists(absConfigDir)) {
    let createOptions = {network, datadir}
    await createConfigDirectory(createOptions, absConfigDir, isGlobal)
  } else {
    throw new Error(`Directory "${absConfigDir}" already exists.`)
  }

  if (!await exists(absDataDir)) {
    await mkdirpPromise(absDataDir)
  }

  if (!isGlobal) {
    let npm = spawn('npm', ['install'], {cwd: absConfigDir})
    npm.stdout.on('data', data => process.stdout.write(data))
    npm.stderr.on('data', data => process.stderr.write(data))

    await new Promise((resolve, reject) => {
      npm.on('close', code => {
        if (code === 0) {
          resolve()
        } else {
          reject(new Error('There was an error installing dependencies.'))
        }
      })
    })
  }
}

module.exports = create
