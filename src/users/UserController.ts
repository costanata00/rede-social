import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { DuplicateFollowError, SelfFollowError, UserNotFoundError, ValidationError } from '../shared/errors.js';

// Criar usuário agora é responsabilidade só do AuthController#register
// (precisa de senha/hash) — não existe mais um "criar usuário sem senha"
// aqui, de propósito.
export class UserController {
  constructor(private readonly prisma: PrismaClient) { }

  async get(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        _count: { select: { posts: true, followers: true, following: true } },
      },
    });
    if (!user) {
      throw new UserNotFoundError(id);
    }
    return user;
  }

  // Autorrelação N:N em ação: um User segue outro User através da tabela
  // de junção explícita `Follow`.
  async follow(followerId: number, body: unknown) {
    const { targetId } = (body ?? {}) as { targetId?: unknown };
    if (typeof targetId !== 'number' || !Number.isInteger(targetId)) {
      throw new ValidationError('"targetId" é obrigatório e deve ser um número inteiro');
    }
    if (targetId === followerId) {
      throw new SelfFollowError();
    }

    const [follower, target] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: followerId } }),
      this.prisma.user.findUnique({ where: { id: targetId } }),
    ]);
    if (!follower) {
      throw new UserNotFoundError(followerId);
    }
    if (!target) {
      throw new UserNotFoundError(targetId);
    }

    try {
      return await this.prisma.follow.create({
        data: { followerId, followingId: targetId },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new DuplicateFollowError();
      }
      throw err;
    }
  }

  // Feed = posts de quem eu sigo. Mostra um filtro relacional aninhado:
  // "posts cujo autor tem, entre seus seguidores, um Follow onde eu sou o
  // follower" — sem precisar buscar a lista de ids manualmente antes.
  async feed(userId: number, page = 0, limit = 10) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UserNotFoundError(userId);
    }
    // Valida e aplica valores padrão à paginação (página atual e limite por página, máx. 50)
    const currentPage = Number.isInteger(page) && page >= 0 ? page : 0;
    const pageSize = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 50) : 10;
    const where = {
      OR: [
        { author: { followers: { some: { followerId: userId } } } },
        { authorId: userId },
      ],
    };
    const [posts, total] = await Promise.all([
      this.prisma.post.findMany({
        where,
        skip: currentPage * pageSize,
        take: pageSize,
        include: {
          author: true,
          tags: true,
          images: { orderBy: { order: 'asc' } },
          _count: { select: { likes: true, comments: true } },
          likes: { where: { userId }, select: { userId: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.post.count({ where }),
    ]);
    return {
      posts: posts.map(({ likes, ...post }) => ({ ...post, likedByMe: likes.length > 0 })),
      page: currentPage,
      limit: pageSize,
      hasMore: (currentPage + 1) * pageSize < total,
    };
  }


  // Lista para a tela inicial sugerir quem seguir: todo mundo, exceto eu
  // mesmo, marcando quem eu já sigo (`isFollowing`) para a view decidir
  // entre mostrar o botão "Seguir" ou "Já segue".
  async listOthers(currentUserId: number) {
    const users = await this.prisma.user.findMany({
      where: { id: { not: currentUserId } },
      orderBy: { name: 'asc' },
    });
    const following = await this.prisma.follow.findMany({ where: { followerId: currentUserId } });
    const followingIds = new Set(following.map((f) => f.followingId));

    return users.map((user) => ({ ...user, isFollowing: followingIds.has(user.id) }));
  }
}
