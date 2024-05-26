import NodePath from 'node:path'
import process from 'node:process'
import { afterAll, describe, expect, it } from 'vitest'
import { execa } from 'execa'
import fs from 'fs-extra'

const CLI_PATH = NodePath.join(__dirname, '../bin/cli.js')
const genPath = NodePath.join(__dirname, '..', '.temp', randomStr())

function randomStr() {
	return Math.random().toString(36).slice(2)
}

async function run(params: Array<string> = []) {
	return execa('node', [CLI_PATH, ...params], {
		cwd: genPath,
		env: {
			...process.env,
		},
	})
};

type MockDirConfig = {
	name: string
	gitInit: boolean
	gitClean: boolean
}

async function createMockDir(config: MockDirConfig) {
	const { name, gitInit, gitClean } = config
	await fs.rm(genPath, { recursive: true, force: true })
	await fs.ensureDir(genPath)

	const pkgContent = {
		name,
		version: '1.0.0',
		exports: {
			'.': './src/index.js',
		},
	}

	const steps: Array<Promise<unknown>> = [
		fs.writeFile(NodePath.join(genPath, 'package.json'), JSON.stringify(pkgContent, null, 2)),
	]

	if (gitInit) {
		steps.push((async (): Promise<void> => {
			await execa('git', ['init'], { cwd: genPath })
			if (gitClean) {
				await execa('git', ['add', '.'], { cwd: genPath })
				await execa('git', ['commit', '-m', 'initial commit'], { cwd: genPath })
			}
		})())
	}

	await Promise.all(steps)
};

afterAll(async () => await fs.rm(genPath, { recursive: true, force: true }))

describe('when git is not available', () => {
	it('should disable git features and leave changes uncommitted', async () => {
		const name = '@test/test'
		await createMockDir({ name, gitInit: false, gitClean: false })
		const { stdout, stderr } = await run(['start'])

		expect(stderr.trim()).toBe('')
		expect(stdout).toContain('disabling git features')
		expect(stdout).toContain('Synced jsr config')
	})
})

describe('when git is not clean but no commit flag was provided', () => {
	it('should disable git features and leave changes uncommitted', async () => {
		const name = '@test/test'
		await createMockDir({ name, gitInit: true, gitClean: false })
		const { stdout, stderr } = await run(['start', '--no-commit'])

		expect(stderr.trim()).toBe('')
		expect(stdout).not.toContain('disabling git features')
		expect(stdout).toContain('Synced jsr config')

		const { stdout: gitStatusStdout } = await execa('git', ['status'], { cwd: genPath })
		expect(gitStatusStdout).toContain('jsr.json')
		expect(gitStatusStdout).toContain('package.json')
	})
})

describe('when a name is provided', () => {
	it('should use use the provided name insted of the package one', async () => {
		const name = '@test/test'
		await createMockDir({ name, gitInit: true, gitClean: true })
		const { stdout, stderr } = await run(['start', '--name', '@test/custom'])

		const jsrContent: Record<string, any> = await fs.readJSON(NodePath.join(genPath, 'jsr.json'))

		expect(jsrContent).toEqual({
			name: '@test/custom',
			version: '1.0.0',
			exports: {
				'.': './src/index.ts',
			},
		})
		expect(stderr.trim()).toBe('')
		expect(stdout).toContain('Synced jsr config')
	})
})

it('should sync the config', async () => {
	const name = '@test/test-2'
	await createMockDir({ name, gitInit: true, gitClean: true })
	const { stdout, stderr } = await run(['start'])

	const jsrContent: Record<string, any> = await fs.readJSON(NodePath.join(genPath, 'jsr.json'))

	expect(jsrContent).toEqual({
		name,
		version: '1.0.0',
		exports: {
			'.': './src/index.ts',
		},
	})
	expect(stderr.trim()).toBe('')
	expect(stdout).toContain('Synced jsr config')

	const { stdout: gitStatusStdout } = await execa('git', ['status'], { cwd: genPath })
	expect(gitStatusStdout).toContain('nothing to commit, working tree clean')
})
