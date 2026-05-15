#!/usr/bin/env node
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')
const defaultDevServerUrl = 'http://127.0.0.1:5173'

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const appArgs = ['.']
const inputArgs = process.argv.slice(2)

if (inputArgs.includes('--help')) {
  console.log('Usage: node scripts/start-electron.mjs [--dev] [--dev-server-url=http://127.0.0.1:5173]')
  process.exit(0)
}

for (const arg of inputArgs) {
  if (arg === '--dev') {
    env.VITE_DEV_SERVER_URL = env.VITE_DEV_SERVER_URL || defaultDevServerUrl
    continue
  }

  if (arg.startsWith('--dev-server-url=')) {
    env.VITE_DEV_SERVER_URL = arg.slice('--dev-server-url='.length)
    continue
  }

  appArgs.push(arg)
}

const child = spawn(electronPath, appArgs, {
  cwd: repoRoot,
  env,
  stdio: 'inherit',
})

child.on('error', (error) => {
  console.error(error)
  process.exit(1)
})

child.on('close', (code, signal) => {
  if (signal) {
    process.exit(1)
    return
  }
  process.exit(code ?? 0)
})
