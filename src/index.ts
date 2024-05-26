import process from 'node:process'
import c from 'picocolors'
import { hideBin } from 'yargs/helpers'
import yargs from 'yargs'
import * as p from '@clack/prompts'
import { IsOk, intoErr } from '@vyke/results'
import { pkgJson } from './constants'
import { run } from './run'

function header() {
	// eslint-disable-next-line no-console
	console.log('\n')
	p.intro(`${c.green(`@vyke/jsr-sync `)}${c.dim(`v${pkgJson.version}`)}`)
}

const instance = yargs(hideBin(process.argv))
	.scriptName('@vyke/jsr-sync')
	.usage('')
	.command(
		'start',
		'Run the initialization or migration process',
		(args) => args
			.option('name', {
				alias: 'n',
				description: 'Use a different name for the project',
				type: 'string',
			})
			.option('force', {
				alias: 'f',
				description: 'Force sync to be applied',
				type: 'boolean',
			})
			.option('dry-run', {
				alias: 'd',
				description: 'Run a dry run of the sync',
				type: 'boolean',
			})
			.option('verbose', {
				alias: 'V',
				description: 'Show verbose output',
				type: 'boolean',
			})
			.option('no-commit', {
				description: 'Do not commit changes',
				type: 'boolean',
			})
			.help(),
		async (args) => {
			header()

			const result = await run({
				...args,
				noCommit: 'commit' in args ? !args.commit : undefined,
				dryRun: args['dry-run'],
			})

			if (IsOk(result)) {
				p.log.success(c.green('✔ Synced jsr config'))
			}
			else {
				p.log.error(c.inverse(c.red(' Failed to sync jsr config ')))
				p.log.error(c.red(`✘ ${intoErr(result, 'Failed to sync jsr config').value}`))
				process.exit(1)
			}
		},
	)
	.showHelpOnFail(false)
	.alias('h', 'help')
	.version('version', pkgJson.version)
	.alias('v', 'version')

// eslint-disable-next-line no-unused-expressions
instance
	.help()
	.argv
