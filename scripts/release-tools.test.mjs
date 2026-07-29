import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  crc32,
  createDeterministicZip,
  parseReleaseVersion,
  readZipEntries,
} from './release-tools.mjs'

describe('release tools', () => {
  it('maps RC display versions to increasing four-part browser versions', () => {
    expect(parseReleaseVersion('0.1.0-rc.1')).toEqual({
      versionName: '0.1.0-rc.1',
      coreVersion: '0.1.0',
      manifestVersion: '0.1.0.1',
      releaseCandidate: 1,
    })
    expect(parseReleaseVersion('0.1.0')).toMatchObject({
      manifestVersion: '0.1.0.100',
      releaseCandidate: undefined,
    })
    expect(() => parseReleaseVersion('0.1.0-rc.100')).toThrow(/between 1 and 99/)
    expect(() => parseReleaseVersion('0.1.0-beta.1')).toThrow(/Unsupported/)
    expect(() => parseReleaseVersion('0.01.0')).toThrow(/Unsupported/)
    expect(() => parseReleaseVersion('0.65536.0')).toThrow(/between 0 and 65535/)
  })

  it('uses the standard CRC-32 value', () => {
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926)
  })

  it('creates byte-identical archives with sorted entries and fixed metadata', async () => {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), 'lingoflow-release-tools-'))
    const source = join(temporaryDirectory, 'source')
    const firstZip = join(temporaryDirectory, 'first.zip')
    const secondZip = join(temporaryDirectory, 'second.zip')

    try {
      await mkdir(join(source, 'icons'), { recursive: true })
      await writeFile(join(source, 'z.js'), 'console.log("z")\n')
      await writeFile(join(source, 'manifest.json'), '{"manifest_version":3}\n')
      await writeFile(join(source, 'icons', 'icon.png'), Buffer.from([0, 1, 2, 3]))

      await createDeterministicZip(source, firstZip)
      await utimes(join(source, 'z.js'), new Date(), new Date())
      await createDeterministicZip(source, secondZip)

      expect(await readFile(secondZip)).toEqual(await readFile(firstZip))
      expect(await readZipEntries(firstZip)).toEqual([
        { filename: 'icons/icon.png', method: 0 },
        { filename: 'manifest.json', method: 0 },
        { filename: 'z.js', method: 0 },
      ])
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true })
    }
  })
})
