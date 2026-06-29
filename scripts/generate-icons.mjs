#!/usr/bin/env node
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')
const sourceSvg = path.join(repoRoot, 'public', 'favicon.svg')
const tmpRoot = mkdtempSync(path.join(tmpdir(), 'aislenote-icons-'))
const iconScale = 0.85
const paddedSourceSvg = path.join(tmpRoot, 'favicon-padded.svg')

function createPaddedSourceSvg() {
  const source = readFileSync(sourceSvg, 'utf8')
  const innerSvg = source.match(/<svg\b[^>]*>([\s\S]*)<\/svg>\s*$/)?.[1]
  if (!innerSvg) {
    throw new Error(`Could not read SVG contents from ${sourceSvg}`)
  }

  const padding = ((1 - iconScale) * 512) / 2
  writeFileSync(
    paddedSourceSvg,
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<svg width="100%" height="100%" viewBox="0 0 512 512" version="1.1" xmlns="http://www.w3.org/2000/svg">',
      `<g transform="translate(${padding} ${padding}) scale(${iconScale})">`,
      innerSvg,
      '</g>',
      '</svg>',
    ].join(''),
  )
}

function ensureParent(filePath) {
  mkdirSync(path.dirname(filePath), { recursive: true })
}

function renderPng(size, outputPath) {
  ensureParent(outputPath)
  execFileSync('sips', ['-z', String(size), String(size), '-s', 'format', 'png', paddedSourceSvg, '--out', outputPath], {
    stdio: 'ignore',
  })
}

function byteForIcoSize(size) {
  return size >= 256 ? 0 : size
}

function writeUInt16LE(buffer, value, offset) {
  buffer.writeUInt16LE(value, offset)
}

function writeUInt32LE(buffer, value, offset) {
  buffer.writeUInt32LE(value, offset)
}

function writeIco(outputPath, entries) {
  ensureParent(outputPath)
  const images = entries.map(({ size, path: imagePath }) => ({
    size,
    data: readFileSync(imagePath),
  }))
  const headerSize = 6 + images.length * 16
  let imageOffset = headerSize
  const header = Buffer.alloc(headerSize)

  writeUInt16LE(header, 0, 0)
  writeUInt16LE(header, 1, 2)
  writeUInt16LE(header, images.length, 4)

  images.forEach((image, index) => {
    const entryOffset = 6 + index * 16
    header[entryOffset] = byteForIcoSize(image.size)
    header[entryOffset + 1] = byteForIcoSize(image.size)
    header[entryOffset + 2] = 0
    header[entryOffset + 3] = 0
    writeUInt16LE(header, 1, entryOffset + 4)
    writeUInt16LE(header, 32, entryOffset + 6)
    writeUInt32LE(header, image.data.length, entryOffset + 8)
    writeUInt32LE(header, imageOffset, entryOffset + 12)
    imageOffset += image.data.length
  })

  writeFileSync(outputPath, Buffer.concat([header, ...images.map((image) => image.data)]))
}

function generateIconset(outputPath) {
  const iconsetPath = path.join(tmpRoot, 'icon.iconset')
  mkdirSync(iconsetPath, { recursive: true })
  const iconsetEntries = [
    ['icon_16x16.png', 16],
    ['icon_16x16@2x.png', 32],
    ['icon_32x32.png', 32],
    ['icon_32x32@2x.png', 64],
    ['icon_128x128.png', 128],
    ['icon_128x128@2x.png', 256],
    ['icon_256x256.png', 256],
    ['icon_256x256@2x.png', 512],
    ['icon_512x512.png', 512],
    ['icon_512x512@2x.png', 1024],
  ]

  for (const [filename, size] of iconsetEntries) {
    renderPng(size, path.join(iconsetPath, filename))
  }
  execFileSync('iconutil', ['-c', 'icns', iconsetPath, '-o', outputPath], { stdio: 'ignore' })
}

try {
  createPaddedSourceSvg()

  const publicPngs = [
    ['public/favicon-16x16.png', 16],
    ['public/favicon-32x32.png', 32],
    ['public/favicon-48x48.png', 48],
    ['public/favicon-96x96.png', 96],
    ['public/apple-touch-icon.png', 180],
    ['public/ms-icon-144x144.png', 144],
    ['public/android-chrome-192x192.png', 192],
    ['public/android-chrome-512x512.png', 512],
  ]

  const buildPngs = [
    ['build/icon.png', 1024],
    ['build/icons/16x16.png', 16],
    ['build/icons/32x32.png', 32],
    ['build/icons/48x48.png', 48],
    ['build/icons/96x96.png', 96],
    ['build/icons/128x128.png', 128],
    ['build/icons/256x256.png', 256],
    ['build/icons/512x512.png', 512],
    ['build/icons/1024x1024.png', 1024],
  ]

  for (const [relativePath, size] of [...publicPngs, ...buildPngs]) {
    renderPng(size, path.join(repoRoot, relativePath))
  }

  generateIconset(path.join(repoRoot, 'build', 'icon.icns'))

  const icoRoot = path.join(tmpRoot, 'ico')
  const buildIcoEntries = [16, 24, 32, 48, 64, 128, 256].map((size) => {
    const imagePath = path.join(icoRoot, `icon-${size}.png`)
    renderPng(size, imagePath)
    return { size, path: imagePath }
  })
  writeIco(path.join(repoRoot, 'build', 'icon.ico'), buildIcoEntries)

  const faviconIcoEntries = [16, 32, 48].map((size) => ({
    size,
    path: path.join(repoRoot, 'public', `favicon-${size}x${size}.png`),
  }))
  writeIco(path.join(repoRoot, 'public', 'favicon.ico'), faviconIcoEntries)
} finally {
  rmSync(tmpRoot, { recursive: true, force: true })
}
