import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'

const DOS_TIME = 0
const DOS_DATE = 0x21
const UTF8_FLAG = 0x0800
const STORE_METHOD = 0
const VERSION_NEEDED = 20
const VERSION_MADE_BY_UNIX = (3 << 8) | VERSION_NEEDED
const MAX_ZIP_32 = 0xffffffff

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) === 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1
  }
  return value >>> 0
})

export function parseReleaseVersion(versionName) {
  const match =
    /^(0|[1-9][0-9]{0,4})\.(0|[1-9][0-9]{0,4})\.(0|[1-9][0-9]{0,4})(?:-rc\.([1-9][0-9]*))?$/.exec(
      versionName,
    )
  if (!match) {
    throw new Error(
      `Unsupported release version "${versionName}". Use X.Y.Z or X.Y.Z-rc.N.`,
    )
  }

  const [, major, minor, patch, releaseCandidate] = match
  if ([major, minor, patch].some(value => Number(value) > 65_535)) {
    throw new Error('Browser version components must be between 0 and 65535.')
  }
  const rc = releaseCandidate === undefined ? undefined : Number(releaseCandidate)
  if (rc !== undefined && (rc < 1 || rc > 99)) {
    throw new Error('Release candidate number must be between 1 and 99.')
  }

  return {
    versionName,
    coreVersion: `${major}.${minor}.${patch}`,
    manifestVersion: `${major}.${minor}.${patch}.${rc ?? 100}`,
    releaseCandidate: rc,
  }
}

export function crc32(content) {
  let crc = 0xffffffff
  for (const byte of content) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

export async function collectFiles(rootDirectory) {
  const root = resolve(rootDirectory)
  const files = []

  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true })
    entries.sort((left, right) => compareStrings(left.name, right.name))

    for (const entry of entries) {
      const absolutePath = join(directory, entry.name)
      if (entry.isSymbolicLink()) {
        throw new Error(`Release output must not contain symlinks: ${absolutePath}`)
      }
      if (entry.isDirectory()) {
        await walk(absolutePath)
      } else if (entry.isFile()) {
        files.push({
          absolutePath,
          relativePath: relative(root, absolutePath).split(sep).join('/'),
        })
      }
    }
  }

  await walk(root)
  return files.sort((left, right) =>
    compareStrings(left.relativePath, right.relativePath),
  )
}

export async function createDeterministicZip(sourceDirectory, outputFile) {
  const files = await collectFiles(sourceDirectory)
  if (files.length > 0xffff) {
    throw new Error('ZIP64 is not supported by the deterministic release packager.')
  }

  const localParts = []
  const centralParts = []
  let localOffset = 0

  for (const file of files) {
    const content = await readFile(file.absolutePath)
    const filename = Buffer.from(file.relativePath, 'utf8')
    if (content.length > MAX_ZIP_32 || filename.length > 0xffff) {
      throw new Error(`File is too large for a standard ZIP archive: ${file.relativePath}`)
    }

    const checksum = crc32(content)
    const localHeader = Buffer.alloc(30)
    localHeader.writeUInt32LE(0x04034b50, 0)
    localHeader.writeUInt16LE(VERSION_NEEDED, 4)
    localHeader.writeUInt16LE(UTF8_FLAG, 6)
    localHeader.writeUInt16LE(STORE_METHOD, 8)
    localHeader.writeUInt16LE(DOS_TIME, 10)
    localHeader.writeUInt16LE(DOS_DATE, 12)
    localHeader.writeUInt32LE(checksum, 14)
    localHeader.writeUInt32LE(content.length, 18)
    localHeader.writeUInt32LE(content.length, 22)
    localHeader.writeUInt16LE(filename.length, 26)
    localHeader.writeUInt16LE(0, 28)
    localParts.push(localHeader, filename, content)

    const centralHeader = Buffer.alloc(46)
    centralHeader.writeUInt32LE(0x02014b50, 0)
    centralHeader.writeUInt16LE(VERSION_MADE_BY_UNIX, 4)
    centralHeader.writeUInt16LE(VERSION_NEEDED, 6)
    centralHeader.writeUInt16LE(UTF8_FLAG, 8)
    centralHeader.writeUInt16LE(STORE_METHOD, 10)
    centralHeader.writeUInt16LE(DOS_TIME, 12)
    centralHeader.writeUInt16LE(DOS_DATE, 14)
    centralHeader.writeUInt32LE(checksum, 16)
    centralHeader.writeUInt32LE(content.length, 20)
    centralHeader.writeUInt32LE(content.length, 24)
    centralHeader.writeUInt16LE(filename.length, 28)
    centralHeader.writeUInt16LE(0, 30)
    centralHeader.writeUInt16LE(0, 32)
    centralHeader.writeUInt16LE(0, 34)
    centralHeader.writeUInt16LE(0, 36)
    centralHeader.writeUInt32LE((0o100644 << 16) >>> 0, 38)
    centralHeader.writeUInt32LE(localOffset, 42)
    centralParts.push(centralHeader, filename)

    localOffset += localHeader.length + filename.length + content.length
    if (localOffset > MAX_ZIP_32) {
      throw new Error('ZIP64 is not supported by the deterministic release packager.')
    }
  }

  const centralDirectory = Buffer.concat(centralParts)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(centralDirectory.length, 12)
  end.writeUInt32LE(localOffset, 16)
  end.writeUInt16LE(0, 20)

  const archive = Buffer.concat([...localParts, centralDirectory, end])
  await mkdir(dirname(outputFile), { recursive: true })
  const temporaryFile = `${outputFile}.tmp`
  await writeFile(temporaryFile, archive)
  await rm(outputFile, { force: true })
  await rename(temporaryFile, outputFile)

  return files.map(file => file.relativePath)
}

export async function readZipEntries(zipFile) {
  const archive = await readFile(zipFile)
  const minimumOffset = Math.max(0, archive.length - 65_557)
  let endOffset = -1

  for (let offset = archive.length - 22; offset >= minimumOffset; offset -= 1) {
    if (archive.readUInt32LE(offset) === 0x06054b50) {
      endOffset = offset
      break
    }
  }
  if (endOffset < 0) throw new Error(`ZIP end record not found: ${zipFile}`)

  const totalEntries = archive.readUInt16LE(endOffset + 10)
  const centralSize = archive.readUInt32LE(endOffset + 12)
  const centralOffset = archive.readUInt32LE(endOffset + 16)
  const entries = []
  let offset = centralOffset

  for (let index = 0; index < totalEntries; index += 1) {
    if (archive.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error(`Invalid ZIP central directory: ${zipFile}`)
    }

    const method = archive.readUInt16LE(offset + 10)
    const filenameLength = archive.readUInt16LE(offset + 28)
    const extraLength = archive.readUInt16LE(offset + 30)
    const commentLength = archive.readUInt16LE(offset + 32)
    const filenameStart = offset + 46
    const filename = archive
      .subarray(filenameStart, filenameStart + filenameLength)
      .toString('utf8')
    entries.push({ filename, method })
    offset = filenameStart + filenameLength + extraLength + commentLength
  }

  if (offset !== centralOffset + centralSize) {
    throw new Error(`ZIP central directory size mismatch: ${zipFile}`)
  }
  return entries
}

export async function sha256File(file) {
  const content = await readFile(file)
  return createHash('sha256').update(content).digest('hex')
}

export async function fileSize(file) {
  return (await stat(file)).size
}

function compareStrings(left, right) {
  if (left === right) return 0
  return left < right ? -1 : 1
}
