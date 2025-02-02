import NodeFS from 'node:fs'
import process from 'node:process'
import NodePath from 'node:path'
import { execSync } from 'node:child_process'
import { Err, capture, isOk } from '@vyke/results/result'

export function getIsGitInitialized() {
	return capture(() => NodeFS.existsSync(NodePath.join(process.cwd(), '.git')))
}

export function getIsGitClean() {
	return capture(() => execSync('git status').toString().includes('working tree clean'))
}

export function getCurrentBranch() {
	// checking first with git branch
	// this would be empty if a commit is selected
	let result = capture(() => execSync('git branch --show-current').toString().trim())

	if (isOk(result)) {
		// so if it's not empty let's return this branch
		if (result.value.length !== 0) {
			return result
		}
	}

	// now this would return HEAD in case a commit is selected
	result = capture(() => execSync('git rev-parse --abbrev-ref HEAD').toString().trim())

	if (isOk(result)) {
		if (result.value !== 'HEAD') {
			return result
		}
	}

	return Err('Invalid branch')
}

export function gitCommit(message: string) {
	return capture(() => {
		execSync(`git add .`).toString().trim()
		execSync(`git commit -m '${message}'`).toString().trim()
	})
}
