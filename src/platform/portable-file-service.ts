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
