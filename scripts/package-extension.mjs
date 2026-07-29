import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import {
  createDeterministicZip,
  parseReleaseVersion,
  sha256File,
} from './release-tools.mjs'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const browser = process.argv[2]
if (!['chrome', 'edge'].includes(browser)) {
  throw new Error('Usage: node scripts/package-extension.mjs <chrome|edge>')
}

const extensionRoot = join(repositoryRoot, 'apps', 'extension')
const packageJson = JSON.parse(
  await readFile(join(extensionRoot, 'package.json'), 'utf8'),
)
const release = parseReleaseVersion(packageJson.version)
const outputDirectory = join(extensionRoot, 'output', `${browser}-mv3`)
const outputFile = join(
  extensionRoot,
  'output',
  `lingoflow-${release.versionName}-${browser}-mv3.zip`,
)

const entries = await createDeterministicZip(outputDirectory, outputFile)
const checksum = await sha256File(outputFile)
console.log(
  `Packaged ${entries.length} files for ${browser}: ${outputFile}\nSHA-256 ${checksum}`,
)
