import 'dotenv/config';
import { program } from 'commander';
import RunebaseNode from './cli/node.mjs';
process.on('unhandledRejection', reason => console.error(reason));
program.version('0.0.1');
program.command('start').description('Start the current node').action(async () => {
  let node = new RunebaseNode();
  await node.start();
});
program.parse(process.argv);
if (process.argv.length === 2) {
  program.help();
}