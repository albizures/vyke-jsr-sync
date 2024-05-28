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
	.option('section', {
		alias: 's',
		description: 'The sections to sync',
		type: 'array',
		default: ['version', 'exports', 'name'],
	})
	.option('name', {
		alias: 'n',
		description: 'Use a different name for the project',
		type: 'string',
	})
	.option('dry-run', {
		alias: 'd',
		description: 'Run a dry run of the sync',
		type: 'boolean',
	})
	.option('git-enable', {
		description: 'Commit changes',
		type: 'boolean',
	})
	.showHelpOnFail(false)
	.alias('h', 'help')
	.version('version', pkgJson.version)
	.alias('v', 'version')

instance
	.parse()
	// .help()
	// .argv

async function start() {
	header()
	const argv = await instance
		.parse()

	const result = await run({
		...argv,
		sections: new Set(
			argv.section
				.map((s) => String(s))
				.filter((s) => {
					switch (s) {
						case 'version':
						case 'exports':
						case 'name':
							return true
						default:
							return false
					}
				}) as Array<'version' | 'exports' | 'name'>,
		),
	})

	if (IsOk(result)) {
		p.log.success(c.green('✔ Synced jsr config'))
	}
	else {
		p.log.error(c.inverse(c.red(' Failed to sync jsr config ')))
		p.log.error(c.red(`✘ ${intoErr(result, 'Failed to sync jsr config').value}`))
		process.exit(1)
	}
}

start()
