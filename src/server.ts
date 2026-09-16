import path from 'node:path';
import express, { type Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { UserController } from './users/UserController.js';
import { PostController } from './posts/PostController.js';
import { createRoutes } from './routes.js';
import { createWebRoutes } from './webRoutes.js';
import { createSessionMiddleware } from './auth/session.js';
import { createImageStorage } from './uploads/createImageStorage.js';
import { UPLOAD_DIR } from './uploads/localStorage.js';
import type { ImageStorage } from './uploads/storage.js';
import { errorHandler } from './shared/errorHandler.js';

export function createServer(prisma: PrismaClient, imageStorage: ImageStorage = createImageStorage()): Express {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(import.meta.dirname, 'views'));

  app.use(express.json());
  app.use(express.urlencoded({ extended: true })); // formulários EJS enviam application/x-www-form-urlencoded
  app.use(createSessionMiddleware());

  app.use((req, res, next) => {
    console.log({
      msg: "MIDLEWARE",
      sessao: req.session
    })
    next();
  })

  // Serve os arquivos gravados por `LocalImageStorage` (dev/aula sem AWS).
  // Com S3ImageStorage em uso, esta rota simplesmente não é acessada.
  app.use('/uploads', express.static(UPLOAD_DIR));

  const userController = new UserController(prisma);
  const postController = new PostController(prisma);

  app.use(createWebRoutes(prisma, imageStorage));
  app.use('/api', createRoutes(userController, postController));

  app.use(errorHandler);

  return app;
}
