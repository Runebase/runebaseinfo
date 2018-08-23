const path = require('path')
const fs = require('fs')
const assert = require('assert')
const {promisify, isString} = require('util')
const {spawn} = require('child_process')

const readFile = promisify(fs.readFile)
const writeFile = promisify(fs.writeFile)
const exists = promisify(fs.exists)

async function removeConfig(configFilePath, service, done) {
  let config = JSON.parse(await readFile(configFilePath))
  assert(Array.isArray(config.services), 'Configuration file is expected to have a services array.')
  config.services.splice(config.services.indexOf(service), 1)
  await writeFile(configFilePath, JSON.stringify(config, null, 2))
}

function uninstallService(configDir, service) {
  let child = spawn('npm', ['uninstall', service, '--save'], {cwd: configDir})
  child.stdout.on('data', data => process.stdout.write(data))
  child.stderr.on('data', data => process.stderr.write(data))

  return new Promise((resolve, reject) => {
    child.on('close', code => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error('There was an error uninstalling service(s): ' + service))
      }
    })
  })
}

async function remove(options) {
  let configPath = options.path
  let services = options.services
  let runebaseinfoConfigPath = path.resolve(configPath, 'runebaseinfo-node.json')
  let packagePath = path.resolve(configPath, 'package.json')

  let existences = await Promise.all([exists(runebaseinfoConfigPath), exists(packagePath)])
  if (!existences[0] || !existences[1]) {
    throw new Error('Directory does not have a runebaseinfo-node.json and/or package.json file.')
  }

  for (let service of services) {
    await uninstallService(configPath, service)
    await removeConfig(runebaseinfoConfigPath, service)
  }
}

module.exports = remove
