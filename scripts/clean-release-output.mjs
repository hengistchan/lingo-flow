import { rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const releaseOutput = resolve(repositoryRoot, 'apps', 'extension', 'output')
const expectedOutput = join(repositoryRoot, 'apps', 'extension', 'output')

if (releaseOutput !== expectedOutput) {
  throw new Error(`Refusing to remove unexpected path: ${releaseOutput}`)
}

await rm(releaseOutput, { recursive: true, force: true })
console.log(`Removed generated release output: ${releaseOutput}`)
