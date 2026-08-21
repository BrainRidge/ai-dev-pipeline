import { describe, it, expect } from 'vitest'
import { candidatesFor, nodeToolProbe } from '../../src/tasks/ToolProbe'
import { versionIn } from '../../src/engine/ToolCatalog'

describe('which executable names are tried', () => {
  it('tries the command alone on a POSIX machine', () => {
    expect(candidatesFor('mvn', 'darwin')).toEqual(['mvn'])
  })

  // Maven ships mvn.cmd and Gradle ships gradle.bat, and Node will not find
  // either without a shell. See spec Section 17.
  it('tries the batch-shim extensions on Windows', () => {
    expect(candidatesFor('mvn', 'win32')).toEqual(['mvn', 'mvn.cmd', 'mvn.bat', 'mvn.exe'])
  })
})

/**
 * The real probe against the real machine. Node is what runs this test, so
 * `node --version` is a tool that is certainly installed — which is the point:
 * every other test in the suite fakes the probe, and this one proves the thing
 * being faked works.
 */
describe('probing this machine', () => {
  it('finds a tool that is certainly installed, and reads its version', async () => {
    const result = await nodeToolProbe.run('node', ['--version'])
    expect(result.found).toBe(true)
    expect(versionIn(result.output)).toMatch(/^\d+\.\d+/)
  })

  it('reports a command that does not exist as missing', async () => {
    expect(await nodeToolProbe.run('definitely-not-a-real-tool-xyz', ['--version'])).toEqual({
      found: false,
      output: '',
    })
  })

  // Some tools print their version and exit non-zero. The question is whether
  // the tool is on the machine, not whether it liked its arguments.
  it('counts a tool that ran and complained as found', async () => {
    const result = await nodeToolProbe.run('node', ['--definitely-not-a-flag'])
    expect(result.found).toBe(true)
  })

  it('captures stderr, which is where a JDK writes its version', async () => {
    const result = await nodeToolProbe.run('node', [
      '-e',
      'process.stderr.write("tool version 9.9.9")',
    ])
    expect(versionIn(result.output)).toBe('9.9.9')
  })
})
