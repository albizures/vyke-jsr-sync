import NodeFS from 'node:fs'
import process from 'node:process'
import NodePath from 'node:path'
import type { Result } from '@vyke/results'
import { Empty, Err, IsOk, Ok, capture, unwrap } from '@vyke/results'
import { z } from 'zod'

export type Section = 'version' | 'exports' | 'name'

type Package = z.infer<typeof packageSchema>

const packageSchema = z.object({
	name: z.string(),
	version: z.string(),
	exports: z.record(z.string(),
		z.union([z.string(), z.object({
			import: z.string().optional(),
			require: z.string().optional(),
		})])).optional(),
})
type MaybeJsrConfig = z.infer<typeof jsrConfigSchema>

const jsrConfigSchema = z.object({
	name: z.string().optional(),
	version: z.string().optional(),
	exports: z.union([z.record(z.string(), z.string()), z.string()]).optional(),
}).passthrough()

function readPkg() {
	const pkgPath = NodePath.resolve(process.cwd(), 'package.json')

	try {
		const pkg = NodeFS.readFileSync(pkgPath, 'utf8')

		return Ok(packageSchema.parse(JSON.parse(pkg)))
	}
	catch (error) {
		console.error(error)
		return Err(error)
	}
}

function readJsrConfig() {
	const configPath = NodePath.resolve(process.cwd(), 'jsr.json')

	try {
		const config = NodeFS.readFileSync(configPath, 'utf8')

		return Ok(jsrConfigSchema.parse(JSON.parse(config)))
	}
	catch (error) {
		return Ok({} as MaybeJsrConfig)
	}
}

function getExports(pkg: Package) {
	if (!pkg.exports) {
		return Empty()
	}

	const exports: Record<string, string> = {}
	Object.entries(pkg.exports)
	for (const [key, value] of Object.entries(pkg.exports)) {
		if (typeof value === 'string') {
			exports[key] = findExportFile(value)
		}
		else {
			if (value.import) {
				exports[key] = findExportFile(value.import)
			}
			else if (value.require) {
				exports[key] = findExportFile(value.require)
			}
		}
	}

	return Ok(exports)
}

function findExportFile(file: string) {
	const { name, dir } = NodePath.parse(file)

	const dirname = dir.replace('dist', 'src')

	return `${dirname}/${name}.ts`
}

export function formatJrsConfig(content: JsrConfig) {
	return JSON.stringify(content, null, '\t')
}

export function writeJsrConfigFile(content: string) {
	return capture(() => NodeFS.writeFileSync(NodePath.resolve(process.cwd(), 'jsr.json'), content))
}

export type JsrConfig = {
	name: string
	version: string
	exports: Record<string, string>
}

export function getSyncedJsrConfig(sections: Set<Section>): Result<JsrConfig, string> {
	const pkgResult = readPkg()

	if (!IsOk(pkgResult)) {
		return Err('Unable to read package.json')
	}

	const jsrConfigResult = readJsrConfig()

	if (!IsOk(jsrConfigResult)) {
		return Err('Unable to read jsr.json')
	}

	const { value: pkg } = pkgResult

	const exportsResult = getExports(pkg)

	if (!IsOk(exportsResult)) {
		return Err('Invalid exports in package.json')
	}

	const update = {
		...jsrConfigResult.value,
	}

	if (sections.has('version')) {
		update.version = pkg.version
	}

	if (sections.has('name')) {
		update.name = update.name || pkg.name
	}

	if (sections.has('exports')) {
		update.exports = exportsResult.value
	}

	return Ok(update as JsrConfig)
}
