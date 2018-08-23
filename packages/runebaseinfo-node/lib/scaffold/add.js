const path = require('path')
const fs = require('fs')
const assert = require('assert')
const {promisify, isString} = require('util')
const {spawn} = require('child_process')

const readFile = promisify(fs.readFile)
const writeFile = promisify(fs.writeFile)
const exists = promisify(fs.exists)

async function addConfig(configFilePath, service) {
  let config = JSON.parse(await readFile(configFilePath))
  assert(Array.isArray(config.services), 'Configuration file is expected to have a services array.')
  if (!config.services.includes(service)) {
    config.services.push(service)
    config.services.sort()
  }
  await writeFile(configFilePath, JSON.stringify(config, null, 2))
}

function addService(configDir, service) {
  let npm = spawn('npm', ['install', service, '--save'], {cwd: configDir})
  npm.stdout.on('data', data => process.stdout.write(data))
  npm.stderr.on('data', data => process.stderr.write(data))

  return new Promise((resolve, reject) => {
    npm.on('close', code => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error('There was an error installing service: ' + service))
      }
    })
  })
}

async function add(options) {
  let configPath = options.path
  let services = options.services
  let runebaseinfoConfigPath = path.resolve(configPath, 'runebaseinfo-node.json')
  let packagePath = path.resolve(configPath, 'package.json')

  let existences = await Promise.all([exists(runebaseinfoConfigPath), exists(packagePath)])
  if (!existences[0] || !existences[1]) {
    throw new Error('Directory does not have a runebaseinfo-node.json and/or package.json file.')
  }

  let oldPackage = JSON.parse(await readFile(packagePath))

  for (let service of services) {
    await addService(configPath, service)
    let updatedPackage = JSON.parse(await readFile(packagePath))
    let newSet = Object.keys(updatedPackage.dependencies)
    let oldSet = new Set(Object.keys(oldPackage.dependencies))
    let newDependencies = newSet.filter(x => !oldSet.has(x))
    assert(newDependencies.length === 1)
    oldPackage = updatedPackage
    let serviceName = newDependencies[0]
    await addConfig(runebaseinfoConfigPath, serviceName)
  }
}

module.exports = add
