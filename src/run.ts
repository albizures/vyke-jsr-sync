import c from 'picocolors'
import * as p from '@clack/prompts'
import type { Result } from '@vyke/results/result'
import { Err, Ok, isErr, isOk, to } from '@vyke/results/result'
import { getCurrentBranch, getIsGitClean, getIsGitInitialized, gitCommit } from './git'
import type { JsrConfig, Section } from './pkg-to-jsr'
import { formatJrsConfig, getSyncedJsrConfig, writeJsrConfigFile } from './pkg-to-jsr'
import { rootSola } from './sola'

const sola = rootSola.withTag('run')

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
	 * Enable git features
	 */
	gitEnable?: boolean

	/**
	 * The sections to sync
	 */
	sections: Set<Section>
}

export type PromtResult = {
	uncommittedConfirmed: boolean
	name: string
}
const allSections = new Set<Section>(['version', 'exports', 'name'])

export async function run(options: CliRunOptions = { sections: allSections }): Promise<Result<string, unknown>> {
	const {
		sections,
		name: customName,
		dryRun = false,
	} = options

	const updateResult = getSyncedJsrConfig(sections)

	if (!isOk(updateResult)) {
		p.log.error(c.red(`✘ ${updateResult.error || 'Failed to get sync update'}`))
		return Err(updateResult.error)
	}

	const { value: update } = updateResult

	const syncNameResult = await syncName(update.name, customName)

	if (!isOk(syncNameResult)) {
		return Err(syncNameResult)
	}

	update.name = syncNameResult.value

	if (dryRun) {
		p.log.info(c.green('Result of dry run:'))
		p.log.info(formatJrsConfig(update))
		p.log.info(c.yellow('⚠ Dry run enabled, no changes will be made'))
		return Ok('Dry run completed')
	}

	const resultSyncFiles = syncFiles(update)

	if (!isOk(resultSyncFiles)) {
		return Err(resultSyncFiles, 'Failed to sync files')
	}

	const syncGitResult = await syncGit(options)

	if (!isOk(syncGitResult)) {
		return Err(syncGitResult, 'Failed to commit changes')
	}

	return Ok('jsr.json file in sync :)')
}

function initGit(options: CliRunOptions) {
	const {
		dryRun = false,
		gitEnable = !dryRun,
	} = options

	if (!gitEnable) {
		return {
			gitEnable,
			isGitClean: true,
		}
	}

	let isGitClean = false

	const isGitInitialized = getIsGitInitialized()

	if (!isOk(isGitInitialized) || !isGitInitialized.value) {
		p.log.warn(c.yellow('⚠ Unable to check for uncommitted changes, disabling git features'))

		return {
			gitEnable: false,
			isGitClean: false,
		}
	}

	const isGitCleanResult = getIsGitClean()

	isGitClean = isOk(isGitCleanResult)

	return {
		gitEnable,
		isGitClean,
	}
}

async function syncName(name: string, customName?: string): Promise<Result<string, string>> {
	if (isValidName(customName)) {
		return Ok(customName)
	}

	if (isValidName(name)) {
		return Ok(name)
	}

	const response = await to(p.text({
		placeholder: `@example/${name}`,
		message: 'Enter the name of the package',
	}))

	if (isOk(response)) {
		return Ok(String(response.value))
	}

	sola.log(response)

	return Err('Unable to get a valid name')
}

function isValidName(name?: string): name is string {
	return Boolean(name && name.startsWith('@'))
}

function syncFiles(update: JsrConfig) {
	const writeResult = writeJsrConfigFile(formatJrsConfig(update))
	if (!isOk(writeResult)) {
		p.log.error(c.red('✘ Unable to write to jsr.json'))

		return Err(writeResult, 'Unknown error')
	}

	return Ok('files synced')
}

async function syncGit(options: CliRunOptions) {
	const { gitEnable, isGitClean } = initGit(options)

	if (!gitEnable) {
		return Ok('Git features disabled')
	}

	const force = isGitClean
		?	options.force ?? false
		: await shouldForceGitSync(options)

	if (!isGitClean && !force) {
		return Ok('Uncommitted changes')
	}

	const branchResult = getCurrentBranch()

	if (!force && isErr(branchResult)) {
		p.log.error(c.red('✘ Git commit aborted due to invalid branch detected'))
		return branchResult
	}

	const isGitCleanResult = getIsGitClean()

	if (isOk(isGitCleanResult) && isGitCleanResult.value) {
		return Ok('No changes to commit')
	}

	const commitResult = gitCommit(`chore: sync jsr config`)
	if (!isOk(commitResult)) {
		p.log.error(c.red('✘ Unable to commit changes'))

		return Err(commitResult.error, 'Unknown error')
	}

	return Ok('Git synced')
}

async function shouldForceGitSync(options: CliRunOptions) {
	const { force } = options

	if (force === undefined) {
		const response = await to(p.confirm({
			initialValue: false,
			message: 'There are uncommitted changes in the current repository, are you sure to continue?',
		}))

		if (!isOk(response)) {
			return false
		}

		if (typeof response.value === 'boolean') {
			return response.value
		}

		return false
	}

	return force
}
