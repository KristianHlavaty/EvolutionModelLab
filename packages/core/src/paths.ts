import { isAbsolute, relative, resolve, sep } from "node:path";

import { AppError } from "./errors.js";

export function assertPathWithin(root: string, target: string): string {
  const resolvedRoot = resolve(root);
  const resolvedTarget = resolve(target);
  const relation = relative(resolvedRoot, resolvedTarget);

  if (relation === "") {
    return resolvedTarget;
  }
  if (
    relation.startsWith(`..${sep}`) ||
    relation === ".." ||
    isAbsolute(relation)
  ) {
    throw new AppError(
      "PATH_OUTSIDE_ALLOWED_ROOT",
      "The requested path is outside its allowed root.",
      400,
    );
  }
  return resolvedTarget;
}

export function resolveWithin(root: string, ...segments: string[]): string {
  return assertPathWithin(root, resolve(root, ...segments));
}

export function toRepositoryRelative(
  repositoryRoot: string,
  target: string,
): string {
  const safeTarget = assertPathWithin(repositoryRoot, target);
  return relative(resolve(repositoryRoot), safeTarget).split(sep).join("/");
}

export function fromRepositoryRelative(
  repositoryRoot: string,
  storedPath: string,
): string {
  if (isAbsolute(storedPath)) {
    throw new AppError(
      "INVALID_STORED_PATH",
      "Stored application paths must be relative.",
      500,
    );
  }
  return resolveWithin(repositoryRoot, storedPath);
}
