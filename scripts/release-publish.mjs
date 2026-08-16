#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')
const releaseDir = path.join(repoRoot, 'release')
const packageJsonPath = path.join(repoRoot, 'package.json')
const publishableExtensions = [
  '.AppImage',
  '.deb',
  '.dmg',
  '.exe',
  '.pkg',
  '.rpm',
  '.snap',
  '.zip',
]

function printUsage() {
  console.error('Usage: npm run release:publish -- <version|vversion> [--dry-run] [--ready]')
  console.error('Examples:')
  console.error('  npm run release:publish -- 0.1.4 --dry-run')
  console.error('  npm run release:publish -- 0.1.4')
  console.error('  npm run release:publish -- 0.1.4 --ready')
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

function readPackageVersion() {
  const rawPackageJson = fs.readFileSync(packageJsonPath, 'utf8')
  const packageJson = JSON.parse(rawPackageJson)
  if (typeof packageJson.version !== 'string' || packageJson.version.length === 0) {
    fail('package.json does not contain a valid version.')
  }
  return packageJson.version
}

function normalizeTag(value) {
  if (typeof value !== 'string' || value.length === 0) return null
  return value.startsWith('v') ? value : `v${value}`
}

function listReleaseAssets() {
  if (!fs.existsSync(releaseDir)) {
    fail('release/ does not exist. Run npm run release:build first.')
  }

  return fs
    .readdirSync(releaseDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(releaseDir, entry.name))
    .filter((filePath) => {
      if (filePath.endsWith('.tar.gz')) return true
      return publishableExtensions.some((extension) => filePath.endsWith(extension))
    })
    .sort((first, second) => first.localeCompare(second))
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
  })
  if (result.status !== 0) {
    const stderr = result.stderr?.trim()
    fail(stderr || `${command} ${args.join(' ')} failed.`)
  }
  return result.stdout?.trim() ?? ''
}

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const readyRelease = args.includes('--ready')
const versionArg = args.find((arg) => !arg.startsWith('--'))
const tagName = normalizeTag(versionArg)

if (!tagName) {
  printUsage()
  process.exit(1)
}

const packageVersion = readPackageVersion()
const tagVersion = tagName.slice(1)
if (tagVersion !== packageVersion) {
  fail(`Tag ${tagName} does not match package.json version ${packageVersion}.`)
}

const assets = listReleaseAssets()
if (assets.length === 0) {
  fail('No publishable release artifacts found in release/. Run npm run release:build first.')
}

const staleAssets = assets.filter((asset) => path.basename(asset).includes('Tabs'))
if (staleAssets.length > 0) {
  fail(`Stale Tabs release artifacts found. Run npm run release:clean and rebuild before publishing.\n${staleAssets.map((asset) => `- ${path.relative(repoRoot, asset)}`).join('\n')}`)
}

const unexpectedAssets = assets.filter((asset) => !path.basename(asset).startsWith('AisleNote-'))
if (unexpectedAssets.length > 0) {
  fail(`Unexpected release artifact names found. Publishable artifacts must start with AisleNote-.\n${unexpectedAssets.map((asset) => `- ${path.relative(repoRoot, asset)}`).join('\n')}`)
}

const headSha = run('git', ['rev-parse', 'HEAD'], { capture: true })
const releaseArgs = [
  'release',
  'create',
  tagName,
  ...assets,
  '--target',
  headSha,
  '--title',
  `AisleNote ${tagName}`,
  '--notes',
  'Manual AisleNote release. In-app updates are not configured for this release.',
]

if (readyRelease) {
  releaseArgs.push('--latest')
} else {
  releaseArgs.push('--draft', '--prerelease')
}

console.log(`Release tag: ${tagName}`)
console.log(`Package version: ${packageVersion}`)
console.log('Assets:')
for (const asset of assets) {
  console.log(`- ${path.relative(repoRoot, asset)}`)
}

if (dryRun) {
  console.log(`Dry run command: gh ${releaseArgs.map((arg) => JSON.stringify(arg)).join(' ')}`)
  process.exit(0)
}

run('gh', releaseArgs)
