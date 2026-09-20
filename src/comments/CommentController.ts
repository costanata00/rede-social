import type { PrismaClient } from '@prisma/client';
import { CommentNotFoundError, PostNotFoundError, ValidationError } from '../shared/errors.js';

export class CommentController {
  constructor(private readonly prisma: PrismaClient) {}

  // `authorId` vem da sessão (ver src/webRoutes.ts) — mesma regra já
  // aplicada a posts, follows e curtidas: quem comenta é sempre quem
  // está logado, nunca um valor vindo do corpo da requisição.
  async create(authorId: number, postId: number, body: unknown) {
    const { content } = (body ?? {}) as { content?: unknown };

    if (typeof content !== 'string' || content.trim().length === 0) {
      throw new ValidationError('"content" é obrigatório');
    }

    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) {
      throw new PostNotFoundError(postId);
    }

    return this.prisma.comment.create({
      data: { content, authorId, postId },
      include: { author: true },
    });
  }

  // A checagem "é dono do post?" já aconteceu no middleware
  // `requireOwnPost` (src/auth/middleware.ts) antes desta rota ser
  // chamada — aqui só falta apagar.
  async remove(id: number): Promise<void> {
    await this.prisma.comment.delete({ where: { id } });
  }
  
  async toggleLike(userId: number, commentId: number): Promise<{ liked: boolean; count: number }> {
    const comment = await this.prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment) {
      throw new CommentNotFoundError(commentId);
    }

    const existing = await this.prisma.commentLike.findUnique({
      where: { userId_commentId: { userId, commentId } },
    });

    if (existing) {
      await this.prisma.commentLike.delete({ where: { userId_commentId: { userId, commentId } } });
    } else {
      await this.prisma.commentLike.create({ data: { userId, commentId } });
    }

    const count = await this.prisma.commentLike.count({ where: { commentId } });
    return { liked: !existing, count };
  }
}



