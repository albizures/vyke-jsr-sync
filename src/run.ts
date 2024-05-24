import c from 'picocolors'
import * as p from '@clack/prompts'
import { Empty, Err, IsErr, IsOk, Ok, type Result, intoErr } from '@vyke/results'
import { getCurrentBranch, isGitClean as getIsGitClean, gitCommit } from './git'
import { formatJrsConfig, getSyncedJsrConfig, writeJsrConfigFile } from './pkg-to-jsr'

export type CliRunOptions = {
	/**
	 * Use a different name for the project
	 */
	name?: string
	/**
	 * Force sync to be applied
	 */
	force?: boolean
	/**
	 * Run a dry run of the sync
	 */
	dryRun?: boolean
	/**
	 * Show verbose output
	 */
	verbose?: boolean
	/**
	 * Do not commit changes
	 */
	noCommit?: boolean

}

export type PromtResult = {
	uncommittedConfirmed: boolean
	name: string
}

export async function run(options: CliRunOptions = {}): Promise<Result<string, unknown>> {
	const {
		name: customName,
		force = false,
		dryRun = false,
		// verbose = false,
	} = options

	const updateResult = getSyncedJsrConfig()

	const { gitDisabled, isGitClean } = initGit(options)

	if (!IsOk(updateResult)) {
		p.log.error(c.red(`✘ ${IsErr(updateResult) ? updateResult.value : 'Failed to get sync update'}`))
		return intoErr(updateResult, 'Failed to get sync update')
	}
	const { value: update } = updateResult

	let result: PromtResult = {
		uncommittedConfirmed: force,
		name: update.name,
	}

	if (!force) {
		result = await p.group({
			uncommittedConfirmed: () => {
				if (gitDisabled || isGitClean) { return Promise.resolve(true) }

				return p.confirm({
					initialValue: false,
					message: 'There are uncommitted changes in the current repository, are you sure to continue?',
				})
			},
			name: () => {
				if (customName) { return Promise.resolve(customName) }
				if (update.name.startsWith('@')) { return Promise.resolve(update.name) }

				return p.text({
					placeholder: `@example/${update.name}`,
					message: 'Enter the name of the package',
				})
			},
		})
	}
	else {
		p.log.info(c.yellow('⚠ Skipping uncommitted changes check'))
	}

	if (!result.uncommittedConfirmed) {
		p.log.error(c.red('✘ Sync aborted'))
		return Err('Uncommitted changes')
	}

	update.name = result.name

	if (dryRun) {
		p.log.info(c.green('Result of dry run:'))
		p.log.info(formatJrsConfig(update))
		p.log.info(c.yellow('⚠ Dry run enabled, no changes will be made'))
		return Ok('Dry run completed')
	}

	const writeResult = writeJsrConfigFile(formatJrsConfig(update))
	if (!IsOk(writeResult)) {
		p.log.error(c.red('✘ Unable to write to jsr.json'))

		return intoErr(writeResult, 'Unknown error')
	}

	if (!gitDisabled) {
		const branchResult = gitDisabled ? Empty() : getCurrentBranch()

		if (!force && IsErr(branchResult)) {
			p.log.error(c.red('✘ Git commit aborted due to invalid branch detected'))
			return branchResult
		}

		const commitResult = gitCommit(`chore: sync jsr config`)
		if (!IsOk(commitResult)) {
			p.log.error(c.red('✘ Unable to commit changes'))

			return intoErr(commitResult, 'Unknown error')
		}
	}

	return Ok('jsr.json file in sync :)')
}

function initGit(options: CliRunOptions) {
	const {
		dryRun = false,
		// verbose = false,
		noCommit = false,
	} = options

	let gitDisabled = noCommit || dryRun

	const isGitCleanResult = getIsGitClean()

	let isGitClean = false

	if (!IsOk(isGitCleanResult)) {
		p.log.warn(c.yellow('⚠ Unable to check for uncommitted changes, disabling git features'))

		gitDisabled = true
		isGitClean = true
	}
	else {
		isGitClean = true
	}

	return {
		gitDisabled,
		isGitClean,
	}
}
