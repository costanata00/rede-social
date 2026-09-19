import type { PrismaClient } from '@prisma/client';
import { PostNotFoundError } from '../shared/errors.js';

export class LikeController {
  constructor(private readonly prisma: PrismaClient) {}

  async toggle(userId: number, postId: number): Promise<{ liked: boolean; count: number }> {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) {
      throw new PostNotFoundError(postId);
    }

    const existing = await this.prisma.like.findUnique({
      where: { userId_postId: { userId, postId } },
    });

    if (existing) {
      await this.prisma.like.delete({ where: { userId_postId: { userId, postId } } });
    } else {
      await this.prisma.like.create({ data: { userId, postId } });
    }

    const count = await this.prisma.like.count({ where: { postId } });
    return { liked: !existing, count };
  }
}