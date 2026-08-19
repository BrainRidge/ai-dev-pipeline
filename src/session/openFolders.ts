import { sep } from 'node:path'

/** A path is covered when it is an open folder or sits anywhere beneath one. */
function isInside(path: string, folder: string): boolean {
  const root = folder.endsWith(sep) ? folder.slice(0, -sep.length) : folder
  return path === root || path.startsWith(root + sep)
}

/**
 * Whether the window already shows every repository the task needs.
 *
 * The generated multi-root workspace exists so Copilot can see repositories
 * that are scattered across unrelated folders. When the developer is already
 * sitting in a window that contains them all, generating one buys nothing and
 * costs a reload — so the offer is skipped.
 *
 * Every repository must be covered, not merely some: a single one outside the
 * open folders is invisible to Copilot, which is the whole problem.
 */
export function allInsideOpenFolders(repoPaths: string[], openFolders: string[]): boolean {
  if (repoPaths.length === 0 || openFolders.length === 0) return false
  return repoPaths.every((path) => openFolders.some((folder) => isInside(path, folder)))
}
