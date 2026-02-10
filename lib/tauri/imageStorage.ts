/**
 * Tauri Image Storage Utilities
 * Handles saving images to local filesystem and managing image references
 */

/**
 * Check if we're running in a Tauri environment
 */
export function isTauriEnvironment(): boolean {
  // Check for Tauri API availability
  return typeof window !== 'undefined' && '__TAURI__' in window
}

/**
 * Save an image file to the local notes directory
 * @param dataUrl - The data URL of the image (base64)
 * @param filename - Optional filename, will be auto-generated if not provided
 * @returns The local file path to the saved image
 */
export async function saveImageToLocal(dataUrl: string, filename?: string): Promise<string> {
  if (!isTauriEnvironment()) {
    // In web mode, just return the data URL
    return dataUrl
  }

  try {
    // Dynamically import Tauri APIs
    const { appDataDir, join } = await import('@tauri-apps/api/path')
    const { writeFile, exists, mkdir } = await import('@tauri-apps/plugin-fs')
    
    // Get app data directory
    const appDir = await appDataDir()
    const imagesDir = await join(appDir, 'images')
    
    // Create images directory if it doesn't exist
    const dirExists = await exists(imagesDir)
    if (!dirExists) {
      await mkdir(imagesDir, { recursive: true })
    }
    
    // Generate filename if not provided
    if (!filename) {
      const timestamp = Date.now()
      const random = Math.random().toString(36).substring(7)
      
      // Detect image type from data URL
      const mimeMatch = dataUrl.match(/^data:image\/([a-z]+);/)
      const extension = mimeMatch ? mimeMatch[1] : 'png'
      
      filename = `image_${timestamp}_${random}.${extension}`
    }
    
    const filePath = await join(imagesDir, filename)
    
    // Convert data URL to binary
    const base64Data = dataUrl.split(',')[1]
    const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0))
    
    // Write file
    await writeFile(filePath, binaryData)
    
    // Return file:// URL for the saved image
    return `file://${filePath}`
  } catch (error) {
    console.error('Failed to save image locally:', error)
    // Fallback to data URL if saving fails
    return dataUrl
  }
}

/**
 * Open a native file dialog to select an image
 * @returns The selected file path or null if cancelled
 */
export async function selectImageFile(): Promise<{ path: string; name: string } | null> {
  if (!isTauriEnvironment()) {
    return null
  }

  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [
        {
          name: 'Images',
          extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp']
        }
      ]
    })
    
    if (!selected || typeof selected !== 'string') {
      return null
    }
    
    // Extract filename from path
    const parts = selected.split(/[\\/]/)
    const name = parts[parts.length - 1]
    
    return {
      path: selected,
      name: name
    }
  } catch (error) {
    console.error('Failed to open file dialog:', error)
    return null
  }
}

/**
 * Read an image file and convert it to a data URL
 * @param filePath - Path to the image file
 * @returns Data URL of the image
 */
export async function readImageAsDataUrl(filePath: string): Promise<string | null> {
  if (!isTauriEnvironment()) {
    return null
  }

  try {
    const { readFile } = await import('@tauri-apps/plugin-fs')
    
    // Read file as binary
    const contents = await readFile(filePath)
    
    // Detect mime type from extension
    const extension = filePath.split('.').pop()?.toLowerCase()
    let mimeType = 'image/png'
    
    if (extension === 'jpg' || extension === 'jpeg') {
      mimeType = 'image/jpeg'
    } else if (extension === 'gif') {
      mimeType = 'image/gif'
    } else if (extension === 'webp') {
      mimeType = 'image/webp'
    } else if (extension === 'svg') {
      mimeType = 'image/svg+xml'
    } else if (extension === 'bmp') {
      mimeType = 'image/bmp'
    }
    
    // Convert to base64
    const base64 = btoa(String.fromCharCode(...contents))
    
    return `data:${mimeType};base64,${base64}`
  } catch (error) {
    console.error('Failed to read image file:', error)
    return null
  }
}

/**
 * Convert file:// URL to a data URL for display
 * @param fileUrl - file:// URL
 * @returns Data URL or the original URL if conversion fails
 */
export async function convertFileUrlToDataUrl(fileUrl: string): Promise<string> {
  if (!fileUrl.startsWith('file://')) {
    return fileUrl
  }
  
  // Remove file:// prefix to get the path
  const filePath = fileUrl.replace('file://', '')
  
  const dataUrl = await readImageAsDataUrl(filePath)
  return dataUrl || fileUrl
}
