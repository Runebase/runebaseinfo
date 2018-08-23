import path from 'path'
import Liftoff from 'liftoff'
import program from 'commander'
import packageJson from '../../package.json'
import RunebaseNode from './node'

process.on('unhandledRejection', reason => console.error(reason))

let liftoff = new Liftoff({
  name: 'runebaseinfo',
  moduleName: 'runebaseinfo-node',
  configName: 'runebaseinfo-node',
  processTitle: 'runebaseinfo'
})
  .on('require', name => {
    console.log('Loading:', name)
  })
  .on('requireFail', (name, err) => {
    console.error('Unable to load:', name, err)
  })
  .on('respawn', (flags, child) => {
    console.log('Detected node flags:', flags)
    console.log('Respawned to PID', child.pid)
  })

liftoff.launch({cwd: process.cwd}, () => {
  program
    .version(packageJson.version)

  program
    .command('start')
    .description('Start the current node')
    .option('-c, --config <dir>', 'Specify the directory with Runebaseinfo Node configuration')
    .action(async cmd => {
      let config = (await import(path.resolve(
        process.cwd(),
        ...cmd.config ? [cmd.config] : [],
        'runebaseinfo-node.json'
      ))).default
      let node = new RunebaseNode({path: process.cwd(), config})
      await node.start()
    })

  program.parse(process.argv)
  if (process.argv.length === 2) {
    program.help()
  }
})
