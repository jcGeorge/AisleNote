import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

export type PortableFileSaveResult =
  | {
      handled: false
    }
  | {
      handled: true
      error?: string
      path?: string
      uri?: string
    }

type PortableBinaryFileOptions = {
  defaultPath: string
  data: ArrayBuffer
  title: string
}

type PortableTextFileOptions = {
  defaultPath: string
  contents: string
  title: string
}

function isNativeShareRuntime(): boolean {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

function sanitizeFileName(fileName: string): string {
  const withoutControlCharacters = Array.from(fileName)
    .filter((char) => char.charCodeAt(0) >= 32)
    .join('')
  const cleaned = withoutControlCharacters
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned || 'tabs-export'
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

async function shareCachedFile(path: string, title: string): Promise<PortableFileSaveResult> {
  const uriResult = await Filesystem.getUri({
    path,
    directory: Directory.Cache,
  })
  await Share.share({
    title,
    dialogTitle: title,
    files: [uriResult.uri],
  })
  return {
    handled: true,
    path,
    uri: uriResult.uri,
  }
}

export async function savePortableBinaryFile({
  defaultPath,
  data,
  title,
}: PortableBinaryFileOptions): Promise<PortableFileSaveResult> {
  if (!isNativeShareRuntime()) return { handled: false }

  try {
    const path = `exports/${sanitizeFileName(defaultPath)}`
    await Filesystem.writeFile({
      path,
      directory: Directory.Cache,
      data: uint8ArrayToBase64(new Uint8Array(data)),
      recursive: true,
    })
    return await shareCachedFile(path, title)
  } catch (error) {
    return {
      handled: true,
      error: error instanceof Error ? error.message : 'Export share failed.',
    }
  }
}

export async function savePortableTextFile({
  defaultPath,
  contents,
  title,
}: PortableTextFileOptions): Promise<PortableFileSaveResult> {
  if (!isNativeShareRuntime()) return { handled: false }

  try {
    const path = `exports/${sanitizeFileName(defaultPath)}`
    await Filesystem.writeFile({
      path,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
      data: contents,
      recursive: true,
    })
    return await shareCachedFile(path, title)
  } catch (error) {
    return {
      handled: true,
      error: error instanceof Error ? error.message : 'Export share failed.',
    }
  }
}
