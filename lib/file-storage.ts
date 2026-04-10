import { supabase } from './supabase'

// ============================================================================
// CONSTANTS
// ============================================================================

const BUCKET_NAME = 'user_docs'
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB
const LONG_LIVED_URL_EXPIRY_SECONDS = 60 * 60 * 24 * 30 // 30 days

interface UploadFileOptions {
  maxFileSizeBytes?: number
}

// File types that can be previewed inline
export const PREVIEWABLE_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/bmp',
]

export const PREVIEWABLE_PDF_TYPES = ['application/pdf']

export const PREVIEWABLE_TEXT_TYPES = [
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
]

// ============================================================================
// TYPES
// ============================================================================

export interface StorageFile {
  name: string
  id: string | null
  size: number
  type: string // MIME type
  created_at: string
  updated_at: string
  path: string // Full path within user's folder (relative to userId/)
}

export interface StorageFolder {
  name: string
  path: string // Full path within user's folder (relative to userId/)
}

export interface StorageItem {
  kind: 'file' | 'folder'
  name: string
  path: string // Full path relative to userId/
  size?: number
  type?: string
  created_at?: string
  updated_at?: string
}

export interface UploadResult {
  path: string
  file: StorageFile
}

export interface UploadImageResult {
  path: string
  url: string
  file: StorageFile
}

// ============================================================================
// HELPERS
// ============================================================================

async function getUserId(): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  return user.id
}

/** Build the full storage path: <userId>/<relativePath> */
function buildFullPath(userId: string, relativePath: string): string {
  const cleaned = relativePath.replace(/^\/+/, '').replace(/\/+$/, '')
  return cleaned ? `${userId}/${cleaned}` : userId
}

/** Extract the file name from a path */
function getFileName(path: string): string {
  const parts = path.split('/')
  return parts[parts.length - 1] || ''
}

/** Determine MIME type from file name extension (fallback) */
function guessMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  const mimeMap: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    bmp: 'image/bmp',
    pdf: 'application/pdf',
    txt: 'text/plain',
    md: 'text/markdown',
    csv: 'text/csv',
    json: 'application/json',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    zip: 'application/zip',
    rar: 'application/x-rar-compressed',
    mp3: 'audio/mpeg',
    mp4: 'video/mp4',
    wav: 'audio/wav',
  }
  return mimeMap[ext] || 'application/octet-stream'
}

function isImageMimeType(mimeType: string): boolean {
  return mimeType.toLowerCase().startsWith('image/')
}

function sanitizeFileName(fileName: string): string {
  const parts = fileName.split('.')
  const ext = parts.length > 1 ? parts.pop() || '' : ''
  const base = (parts.join('.') || 'image')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-._]+|[-._]+$/g, '')
  const safeBase = base || 'image'
  const safeExt = ext.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
  return safeExt ? `${safeBase}.${safeExt}` : safeBase
}

function buildUniqueFileName(fileName: string): string {
  const safeName = sanitizeFileName(fileName)
  const parts = safeName.split('.')
  const extension = parts.length > 1 ? parts.pop() || '' : ''
  const base = parts.join('.') || 'image'
  const timestamp = Date.now()
  const randomSuffix = Math.random().toString(36).slice(2, 8)
  const uniqueBase = `${base}-${timestamp}-${randomSuffix}`
  return extension ? `${uniqueBase}.${extension}` : uniqueBase
}

/** Check whether a MIME type is previewable as an image */
export function isPreviewableImage(mimeType: string): boolean {
  return PREVIEWABLE_IMAGE_TYPES.includes(mimeType)
}

/** Check whether a MIME type is previewable as a PDF */
export function isPreviewablePdf(mimeType: string): boolean {
  return PREVIEWABLE_PDF_TYPES.includes(mimeType)
}

/** Check whether a MIME type is previewable as text */
export function isPreviewableText(mimeType: string): boolean {
  return PREVIEWABLE_TEXT_TYPES.includes(mimeType)
}

/** Human-readable file size */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  const value = bytes / Math.pow(k, i)
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

/** Get a Lucide icon name hint based on MIME type */
export function getFileIconHint(mimeType: string): 'image' | 'pdf' | 'text' | 'spreadsheet' | 'presentation' | 'audio' | 'video' | 'archive' | 'file' {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType === 'application/pdf') return 'pdf'
  if (mimeType.startsWith('text/') || mimeType === 'application/json') return 'text'
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType === 'text/csv') return 'spreadsheet'
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'presentation'
  if (mimeType.startsWith('audio/')) return 'audio'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('tar') || mimeType.includes('compress')) return 'archive'
  return 'file'
}

// ============================================================================
// LIST FILES & FOLDERS
// ============================================================================

/**
 * List all items (files and folders) at a given path within the user's storage.
 * @param folderPath - Relative path within the user's storage (e.g. '' for root, 'documents/work')
 */
export async function listItems(folderPath: string = ''): Promise<StorageItem[]> {
  const userId = await getUserId()
  const fullPath = buildFullPath(userId, folderPath)

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .list(fullPath, {
      limit: 1000,
      offset: 0,
      sortBy: { column: 'name', order: 'asc' },
    })

  if (error) throw error
  if (!data) return []

  const items: StorageItem[] = []

  for (const item of data) {
    // Skip the .emptyFolderPlaceholder files used to keep folders alive
    if (item.name === '.emptyFolderPlaceholder') continue

    const itemRelativePath = folderPath
      ? `${folderPath}/${item.name}`
      : item.name

    // Supabase returns folders with id === null and metadata === null
    if (item.id === null) {
      items.push({
        kind: 'folder',
        name: item.name,
        path: itemRelativePath,
      })
    } else {
      const mimeType =
        (item.metadata as Record<string, any>)?.mimetype ||
        guessMimeType(item.name)
      items.push({
        kind: 'file',
        name: item.name,
        path: itemRelativePath,
        size: (item.metadata as Record<string, any>)?.size ?? 0,
        type: mimeType,
        created_at: item.created_at,
        updated_at: item.updated_at ?? item.created_at,
      })
    }
  }

  // Sort: folders first, then files
  items.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return items
}

// ============================================================================
// UPLOAD
// ============================================================================

/**
 * Upload a file to the user's storage.
 * @param file - The File object to upload
 * @param folderPath - Target folder relative to user root (e.g. '' for root, 'documents')
 * @returns Upload result with path and file metadata
 */
export async function uploadFile(
  file: File,
  folderPath: string = '',
  options: UploadFileOptions = {}
): Promise<UploadResult> {
  const maxFileSizeBytes = options.maxFileSizeBytes ?? MAX_FILE_SIZE_BYTES
  if (file.size > maxFileSizeBytes) {
    const sizeLimitMb = Math.round(maxFileSizeBytes / (1024 * 1024))
    throw new Error(`File "${file.name}" exceeds the ${sizeLimitMb} MB size limit (${formatFileSize(file.size)})`)
  }

  const userId = await getUserId()
  const sanitizedFileName = sanitizeFileName(file.name)
  const relativePath = folderPath ? `${folderPath}/${sanitizedFileName}` : sanitizedFileName
  const fullPath = buildFullPath(userId, relativePath)

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(fullPath, file, {
      cacheControl: '3600',
      upsert: true, // Overwrite if exists
    })

  if (error) throw error

  return {
    path: relativePath,
    file: {
      name: sanitizedFileName,
      id: data.id ?? null,
      size: file.size,
      type: file.type || guessMimeType(sanitizedFileName),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      path: relativePath,
    },
  }
}

/**
 * Upload multiple files.
 */
export async function uploadFiles(
  files: File[],
  folderPath: string = '',
  onProgress?: (completed: number, total: number) => void
): Promise<UploadResult[]> {
  const results: UploadResult[] = []
  for (let i = 0; i < files.length; i++) {
    const result = await uploadFile(files[i], folderPath)
    results.push(result)
    onProgress?.(i + 1, files.length)
  }
  return results
}

// ============================================================================
// DOWNLOAD / GET URL
// ============================================================================

/**
 * Get a temporary signed URL for a file (valid for 1 hour).
 * @param relativePath - Path relative to user root (e.g. 'documents/report.pdf')
 */
export async function getFileUrl(relativePath: string): Promise<string> {
  return getFileSignedUrl(relativePath, 3600)
}

/**
 * Get a signed URL for a file.
 */
export async function getFileSignedUrl(relativePath: string, expiresInSeconds: number): Promise<string> {
  const userId = await getUserId()
  const fullPath = buildFullPath(userId, relativePath)

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .createSignedUrl(fullPath, expiresInSeconds)

  if (error) throw error
  return data.signedUrl
}

/**
 * Upload an image file to user storage and return a signed URL.
 */
export async function uploadImageFile(file: File, folderPath: string = ''): Promise<UploadImageResult> {
  const inferredType = file.type || guessMimeType(file.name)
  if (!isImageMimeType(inferredType)) {
    throw new Error(`File "${file.name}" is not a supported image type`)
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    throw new Error(`Image "${file.name}" exceeds the 10 MB size limit (${formatFileSize(file.size)})`)
  }

  const uniqueName = buildUniqueFileName(file.name)
  const normalizedFile = new File([file], uniqueName, {
    type: inferredType,
    lastModified: file.lastModified,
  })

  const upload = await uploadFile(normalizedFile, folderPath)
  const url = await getFileSignedUrl(upload.path, LONG_LIVED_URL_EXPIRY_SECONDS)

  return {
    path: upload.path,
    url,
    file: upload.file,
  }
}

/**
 * Download a file as a Blob.
 */
export async function downloadFile(relativePath: string): Promise<Blob> {
  const userId = await getUserId()
  const fullPath = buildFullPath(userId, relativePath)

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .download(fullPath)

  if (error) throw error
  return data
}

/**
 * Trigger a browser download for a file.
 */
export async function triggerDownload(relativePath: string): Promise<void> {
  const blob = await downloadFile(relativePath)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = getFileName(relativePath)
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ============================================================================
// DELETE
// ============================================================================

/**
 * Delete a file.
 */
export async function deleteFile(relativePath: string): Promise<void> {
  const userId = await getUserId()
  const fullPath = buildFullPath(userId, relativePath)

  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .remove([fullPath])

  if (error) throw error
}

/**
 * Delete multiple files.
 */
export async function deleteFiles(relativePaths: string[]): Promise<void> {
  const userId = await getUserId()
  const fullPaths = relativePaths.map((p) => buildFullPath(userId, p))

  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .remove(fullPaths)

  if (error) throw error
}

// ============================================================================
// FOLDER OPERATIONS
// ============================================================================

/**
 * Create a folder by uploading a placeholder file.
 * Supabase Storage doesn't have explicit folder creation - folders exist
 * implicitly when they contain files. We create a hidden placeholder.
 */
export async function createStorageFolder(
  folderPath: string,
  folderName: string
): Promise<string> {
  const userId = await getUserId()
  const newFolderRelativePath = folderPath
    ? `${folderPath}/${folderName}`
    : folderName
  const placeholderPath = buildFullPath(
    userId,
    `${newFolderRelativePath}/.emptyFolderPlaceholder`
  )

  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(placeholderPath, new Blob(['']), {
      cacheControl: '3600',
      upsert: true,
    })

  if (error) throw error
  return newFolderRelativePath
}

/**
 * Delete a folder and all its contents recursively.
 */
export async function deleteStorageFolder(folderPath: string): Promise<void> {
  const userId = await getUserId()
  const fullPath = buildFullPath(userId, folderPath)

  // List all files in the folder recursively
  const allFiles = await listAllFilesRecursive(fullPath)
  if (allFiles.length === 0) return

  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .remove(allFiles)

  if (error) throw error
}

/**
 * List all files in a path recursively (returns full storage paths).
 */
async function listAllFilesRecursive(fullPath: string): Promise<string[]> {
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .list(fullPath, { limit: 1000 })

  if (error) throw error
  if (!data) return []

  const filePaths: string[] = []

  for (const item of data) {
    const itemPath = `${fullPath}/${item.name}`
    if (item.id === null) {
      // It's a folder — recurse
      const nested = await listAllFilesRecursive(itemPath)
      filePaths.push(...nested)
    } else {
      filePaths.push(itemPath)
    }
  }

  return filePaths
}

// ============================================================================
// RENAME / MOVE
// ============================================================================

/**
 * Rename or move a file by copying to new location and deleting the original.
 * Supabase doesn't support rename directly for storage objects.
 */
export async function moveFile(
  oldRelativePath: string,
  newRelativePath: string
): Promise<void> {
  const userId = await getUserId()
  const oldFullPath = buildFullPath(userId, oldRelativePath)
  const newFullPath = buildFullPath(userId, newRelativePath)

  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .move(oldFullPath, newFullPath)

  if (error) throw error
}

/**
 * Rename a file (keeps it in the same folder).
 */
export async function renameFile(
  relativePath: string,
  newName: string
): Promise<string> {
  const parts = relativePath.split('/')
  parts[parts.length - 1] = newName
  const newPath = parts.join('/')
  await moveFile(relativePath, newPath)
  return newPath
}
