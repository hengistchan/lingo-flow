import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  collectFiles,
  createDeterministicZip,
  fileSize,
  parseReleaseVersion,
  readZipEntries,
  sha256File,
} from './release-tools.mjs'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const extensionRoot = join(repositoryRoot, 'apps', 'extension')
const outputRoot = join(extensionRoot, 'output')
const browsers = ['chrome', 'edge']
const rootPackage = await readJson(join(repositoryRoot, 'package.json'))
const extensionPackage = await readJson(join(extensionRoot, 'package.json'))
const release = parseReleaseVersion(extensionPackage.version)

assert(
  rootPackage.version === extensionPackage.version,
  `Package versions differ: root=${rootPackage.version}, extension=${extensionPackage.version}`,
)

for (const documentationFile of ['README.md', 'CHANGELOG.md', 'RELEASE_NOTES.md']) {
  const content = await readFile(join(repositoryRoot, documentationFile), 'utf8')
  assert(
    content.includes(release.versionName),
    `${documentationFile} does not mention ${release.versionName}`,
  )
}

const expectedPermissions = ['activeTab', 'scripting', 'storage']
const expectedHostPermissions = [
  'https://api.cognitive.microsofttranslator.com/*',
  'https://api.openai.com/*',
  'https://translate.googleapis.com/*',
]
const expectedOptionalHosts = ['http://*/*', 'https://*/*']
const manifests = []
const checksumLines = []

for (const browser of browsers) {
  const outputDirectory = join(outputRoot, `${browser}-mv3`)
  const manifest = await readJson(join(outputDirectory, 'manifest.json'))
  manifests.push(manifest)

  assert(manifest.manifest_version === 3, `${browser}: manifest_version must be 3`)
  assert(
    manifest.version === release.manifestVersion,
    `${browser}: manifest version must be ${release.manifestVersion}, got ${manifest.version}`,
  )
  assert(
    manifest.version_name === release.versionName,
    `${browser}: manifest version_name must be ${release.versionName}`,
  )
  assert(manifest.name === 'LingoFlow', `${browser}: unexpected extension name`)
  assert(manifest.name.length <= 75, `${browser}: extension name exceeds 75 characters`)
  assert(
    typeof manifest.description === 'string' && manifest.description.length <= 132,
    `${browser}: manifest description must be at most 132 characters`,
  )
  assertSameSet(manifest.permissions, expectedPermissions, `${browser}: permissions`)
  assertSameSet(
    manifest.host_permissions,
    expectedHostPermissions,
    `${browser}: host_permissions`,
  )
  assertSameSet(
    manifest.optional_host_permissions,
    expectedOptionalHosts,
    `${browser}: optional_host_permissions`,
  )
  assert(
    !JSON.stringify(manifest).includes('<all_urls>'),
    `${browser}: manifest must not request <all_urls>`,
  )

  for (const icon of ['16', '32', '48', '128']) {
    assert(manifest.icons?.[icon], `${browser}: missing ${icon}px manifest icon`)
  }

  const outputFiles = await collectFiles(outputDirectory)
  const relativeFiles = outputFiles.map(file => file.relativePath)
  let escapedUnicodeSentinelFound = false
  for (const requiredFile of [
    'background.js',
    'lingoflow-content.js',
    'manifest.json',
    'onboarding.html',
    'options.html',
    'popup.html',
  ]) {
    assert(relativeFiles.includes(requiredFile), `${browser}: missing ${requiredFile}`)
  }

  for (const file of outputFiles) {
    assertReleasePath(file.relativePath, browser)
    if (file.relativePath.endsWith('.js')) {
      const javascript = await readFile(file.absolutePath, 'utf8')
      assert(
        !javascript.includes('\uffff'),
        `${browser}: Unicode noncharacter U+FFFF found in ${file.relativePath}`,
      )
      if (javascript.includes('\\uffff')) escapedUnicodeSentinelFound = true
    }
    if (isTextFile(file.relativePath)) {
      const text = await readFile(file.absolutePath, 'utf8')
      scanForSecrets(text, `${browser}/${file.relativePath}`)
    }
  }
  assert(
    escapedUnicodeSentinelFound,
    `${browser}: Dexie U+FFFF range sentinel was not preserved as an ASCII source escape`,
  )

  const zipFile = join(
    outputRoot,
    `lingoflow-${release.versionName}-${browser}-mv3.zip`,
  )
  assert((await fileSize(zipFile)) > 0, `${browser}: release ZIP is empty`)
  const zipEntries = await readZipEntries(zipFile)
  assert(
    zipEntries.every(entry => entry.method === 0),
    `${browser}: deterministic ZIP must use the STORE method`,
  )
  assertSameList(
    zipEntries.map(entry => entry.filename),
    relativeFiles,
    `${browser}: ZIP entries`,
  )

  const temporaryDirectory = await mkdtemp(join(tmpdir(), `lingoflow-${browser}-`))
  try {
    const rebuiltZip = join(temporaryDirectory, basename(zipFile))
    await createDeterministicZip(outputDirectory, rebuiltZip)
    assert(
      (await sha256File(rebuiltZip)) === (await sha256File(zipFile)),
      `${browser}: release ZIP is not byte-for-byte reproducible`,
    )
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true })
  }

  checksumLines.push(`${await sha256File(zipFile)}  ${basename(zipFile)}`)
}

assert(
  JSON.stringify(manifests[0]) === JSON.stringify(manifests[1]),
  'Chrome and Edge manifests differ',
)

const expectedZipNames = browsers.map(
  browser => `lingoflow-${release.versionName}-${browser}-mv3.zip`,
)
const actualZipNames = (await readdir(outputRoot))
  .filter(file => file.endsWith('.zip'))
  .sort()
assertSameList(actualZipNames, [...expectedZipNames].sort(), 'release ZIP files')

await writeFile(
  join(outputRoot, 'SHA256SUMS'),
  `${checksumLines.sort().join('\n')}\n`,
  'utf8',
)

console.log(
  [
    `Release verification passed for ${release.versionName}.`,
    `Manifest version: ${release.manifestVersion}`,
    ...checksumLines.sort(),
  ].join('\n'),
)

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'))
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function assertSameSet(actual, expected, label) {
  assert(Array.isArray(actual), `${label} must be an array`)
  assertSameList([...actual].sort(), [...expected].sort(), label)
}

function assertSameList(actual, expected, label) {
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${label} mismatch:\nactual=${JSON.stringify(actual)}\nexpected=${JSON.stringify(expected)}`,
  )
}

function assertReleasePath(relativePath, browser) {
  const forbidden = [
    /(^|\/)\.env(?:\.|$)/,
    /(^|\/)\.DS_Store$/,
    /(^|\/)node_modules\//,
    /(^|\/)(?:e2e|fixtures?|test-results)\//,
    /\.(?:crx|key|map|p12|pem|ts|tsx|vue|wasm)$/,
  ]
  for (const pattern of forbidden) {
    assert(!pattern.test(relativePath), `${browser}: forbidden release file ${relativePath}`)
  }
}

function isTextFile(relativePath) {
  return /\.(?:css|html|js|json|svg|txt)$/i.test(relativePath)
}

function scanForSecrets(content, label) {
  const patterns = [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bgh[oprsu]_[A-Za-z0-9_]{20,}\b/,
    /\bsk-[A-Za-z0-9_-]{20,}\b/,
  ]
  for (const pattern of patterns) {
    assert(!pattern.test(content), `Possible credential found in ${label}`)
  }
}
