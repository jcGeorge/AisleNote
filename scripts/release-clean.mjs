#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')
const releaseDir = path.join(repoRoot, 'release')

fs.rmSync(releaseDir, { recursive: true, force: true })
console.log(`Removed ${path.relative(repoRoot, releaseDir)}/`)
