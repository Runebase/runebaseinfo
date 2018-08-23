const path = require('path')
const program = require('commander')
const runebaseinfo = require('../..')
const {parseParamsWithJSON} = require('../utils')

function main(servicesPath, additionalServices) {
  let version = runebaseinfo.version
  let {create, add, start, remove, callMethod, findConfig, defaultConfig} = runebaseinfo.scaffold

  program
    .version(version)

  program
    .command('create <directory>')
    .description('Create a new node')
    .option('-d, --data-dir <dir>', 'Specify the runebase database directory')
    .option('-t, --test-net', 'Enable the testnet as the network')
    .action(async (dirname, cmd) => {
      if (cmd.datadir) {
        cmd.datadir = path.resolve(process.cwd(), cmd.datadir)
      }
      let options = {
        cwd: process.cwd(),
        dirname,
        datadir: cmd.datadir || './data',
        isGlobal: false
      }
      if (cmd.testnet) {
        options.network = 'testnet'
      }
      await create(options)
      console.log('Successfully created node in directory:', dirname)
    })

  program
    .command('start')
    .description('Start the current node')
    .option('-c, --config <dir>', 'Specify the directory with Runebaseinfo Node configuration')
    .action(cmd => {
      if (cmd.config) {
        cmd.config = path.resolve(process.cwd(), cmd.config)
      } else {
        cmd.config = process.cwd()
      }
      let configInfo = findConfig(cmd.config)
      if (!configInfo) {
        configInfo = defaultConfig({additionalServices})
      }
      if (servicesPath) {
        configInfo.servicesPath = servicesPath
      }
      start(configInfo)
    })

  program
    .command('install <services...>')
    .description('Install a service for the current node')
    .action(async services => {
      let configInfo = findConfig(process.cwd())
      if (!configInfo) {
        throw new Error('Could not find configuration, see `runebaseinfo-node install --help`')
      }
      let options = {
        path: configInfo.path,
        services
      }
      await add(options)
    }).on('--help', () => {
      console.log('  Examples:')
      console.log()
      console.log('    $ runebaseinfo-node add runebaseinfo-api')
      console.log()
    })

  program
    .command('uninstall <services...>')
    .description('Uninstall a service for the current node')
    .action(async services => {
      let configInfo = findConfig(process.cwd())
      if (!configInfo) {
        throw new Error('Could not find configuration, see `runebaseinfo-node uninstall --help`')
      }
      let options = {
        path: configInfo.path,
        services
      }
      await remove(options)
      console.log('Successfully removed service(s):', services.join(', '))
    }).on('--help', () => {
      console.log('  Examples:')
      console.log()
      console.log('    $ runebaseinfo-node remove runebaseinfo-api')
      console.log()
    })

  program
    .command('call <method> [params...]')
    .description('Call an API method')
    .action(async (method, paramsArg) => {
      let params = parseParamsWithJSON(paramsArg)
      let configInfo = findConfig(process.cwd())
      if (!configInfo) {
        configInfo = defaultConfig()
      }
      let options = {
        protocol: 'http',
        host: 'localhost',
        port: configInfo.config.port
      }
      let data = await callMethod(options, method, params)
      console.log(JSON.stringify(data, null, 2))
    })

  program.parse(process.argv)

  if (process.argv.length === 2) {
    program.help()
  }
}

module.exports = main
