import type { NextFunction, Request, Response } from 'express';
import {
  DuplicateEmailError,
  DuplicateFollowError,
  InvalidCredentialsError,
  PostNotFoundError,
  SelfFollowError,
  TagNotFoundError,
  UserNotFoundError,
  CommentNotFoundError,
  ValidationError,
} from './errors.js';

const STATUS_BY_ERROR = new Map<Function, number>([
  [ValidationError, 400],
  [SelfFollowError, 400],
  [InvalidCredentialsError, 401],
  [UserNotFoundError, 404],
  [PostNotFoundError, 404],
  [TagNotFoundError, 404],
  [CommentNotFoundError, 404],
  [DuplicateFollowError, 409],
  [DuplicateEmailError, 409],
]);

// Os 4 parâmetros são obrigatórios: é assim que o Express reconhece uma
// função como error handler (em vez de um middleware comum).
//
// Este app mistura páginas (EJS, para navegador) e uma API JSON
// (/api/..., para o REST Client) — o mesmo erro de domínio (ex.:
// PostNotFoundError) precisa virar uma página de erro num caso e um JSON
// no outro. `req.accepts` olha o header `Accept` da requisição para decidir.
export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  const status = STATUS_BY_ERROR.get(err.constructor) ?? 500;

  if (req.accepts(['html', 'json']) === 'html') {
    res.status(status).render('error', { status, message: err.message });
    return;
  }
  res.status(status).json({ error: err.message });
}
