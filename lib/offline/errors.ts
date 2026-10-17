export class NoteConflictError extends Error {
  readonly noteId: string
  readonly local: Record<string, unknown> | null
  readonly remote: Record<string, unknown> | null

  constructor(noteId: string, local: Record<string, unknown> | null, remote: Record<string, unknown> | null) {
    super('This note was changed elsewhere. Your local copy has been kept and the conflict was recorded.')
    this.name = 'NoteConflictError'
    this.noteId = noteId
    this.local = local
    this.remote = remote
  }
}

export class NoteSyncError extends Error {
  readonly noteId: string

  constructor(noteId: string, message: string) {
    super(message)
    this.name = 'NoteSyncError'
    this.noteId = noteId
  }
}
