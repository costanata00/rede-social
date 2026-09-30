import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { PrismaClient } from '@prisma/client';
import { createServer } from '../../src/server.js';
import { createTestPrismaClient, resetDatabase } from '../helpers/testDb.js';
import { FakeImageStorage } from '../helpers/fakeImageStorage.js';
import { registerAndLogin } from '../helpers/auth.js';

const prisma: PrismaClient = createTestPrismaClient();
const app = createServer(prisma, new FakeImageStorage());

beforeEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /api/users/:id', () => {
  it('retorna 404 para usuário inexistente', async () => {
    const res = await request(app).get('/api/users/999');

    expect(res.status).toBe(404);
  });

  it('retorna o usuário com contagem de posts/seguidores/seguindo', async () => {
    const { userId } = await registerAndLogin(app, prisma, 'ana@exemplo.com', 'Ana');

    const res = await request(app).get(`/api/users/${userId}`);

    expect(res.status).toBe(200);
    expect(res.body._count).toEqual({ posts: 0, followers: 0, following: 0 });
  });
});

describe('POST /follow (autorrelação N:N, follower vem da sessão)', () => {
  it('rejeita quem não está logado', async () => {
    const bruno = await registerAndLogin(app, prisma, 'bruno@exemplo.com', 'Bruno');

    const res = await request(app).post('/follow').type('form').send({ targetId: bruno.userId });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });

  it('permite seguir outro usuário', async () => {
    const bruno = await registerAndLogin(app, prisma, 'bruno@exemplo.com', 'Bruno');
    const ana = await registerAndLogin(app, prisma, 'ana@exemplo.com', 'Ana');

    const res = await ana.agent.post('/follow').type('form').send({ targetId: bruno.userId });

    expect(res.status).toBe(302);
    const follow = await prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: ana.userId, followingId: bruno.userId } },
    });
    expect(follow).not.toBeNull();
  });

  it('rejeita seguir a si mesmo — não é possível forjar outro followerId pelo corpo', async () => {
    const ana = await registerAndLogin(app, prisma, 'ana@exemplo.com', 'Ana');

    const res = await ana.agent.post('/follow').type('form').send({ targetId: ana.userId });

    expect(res.status).toBe(400);
  });

  it('rejeita seguir o mesmo usuário duas vezes', async () => {
    const bruno = await registerAndLogin(app, prisma, 'bruno@exemplo.com', 'Bruno');
    const ana = await registerAndLogin(app, prisma, 'ana@exemplo.com', 'Ana');
    await ana.agent.post('/follow').type('form').send({ targetId: bruno.userId });

    const res = await ana.agent.post('/follow').type('form').send({ targetId: bruno.userId });

    expect(res.status).toBe(409);
  });

  it('rejeita seguir usuário inexistente', async () => {
    const ana = await registerAndLogin(app, prisma, 'ana@exemplo.com', 'Ana');

    const res = await ana.agent.post('/follow').type('form').send({ targetId: 999 });

    expect(res.status).toBe(404);
  });
});

describe('GET /api/users/:id/feed', () => {
  it('retorna apenas posts de quem o usuário segue', async () => {
    const ana = await registerAndLogin(app, prisma, 'ana@exemplo.com', 'Ana');
    const bruno = await registerAndLogin(app, prisma, 'bruno@exemplo.com', 'Bruno');
    const carla = await registerAndLogin(app, prisma, 'carla@exemplo.com', 'Carla');

    await ana.agent.post('/follow').type('form').send({ targetId: bruno.userId });
    await bruno.agent.post('/posts').type('form').send({ content: 'Post do Bruno' });
    await carla.agent.post('/posts').type('form').send({ content: 'Post da Carla' });

    const res = await request(app).get(`/api/users/${ana.userId}/feed`);

    expect(res.status).toBe(200);
    expect(res.body.posts).toHaveLength(1);
    expect(res.body.posts[0].content).toBe('Post do Bruno');
  });
});

describe('GET /api/feed (paginação)', () => {
  it('retorna páginas ordenadas e informa se ainda há posts', async () => {
    const ana = await registerAndLogin(app, prisma, 'ana@exemplo.com', 'Ana');
    const baseDate = new Date('2026-01-01T00:00:00.000Z');
    await Promise.all(['Post antigo', 'Post do meio', 'Post recente'].map((content, index) =>
      prisma.post.create({
        data: {
          content,
          authorId: ana.userId,
          createdAt: new Date(baseDate.getTime() + index * 60_000),
        },
      }),
    ));

    const firstPage = await ana.agent.get('/api/feed?page=0&limit=2');
    const secondPage = await ana.agent.get('/api/feed?page=1&limit=2');

    expect(firstPage.status).toBe(200);
    expect(firstPage.body).toMatchObject({ page: 0, limit: 2, hasMore: true });
    expect(firstPage.body.posts.map((post: { content: string }) => post.content)).toEqual([
      'Post recente',
      'Post do meio',
    ]);
    expect(secondPage.status).toBe(200);
    expect(secondPage.body).toMatchObject({ page: 1, limit: 2, hasMore: false });
    expect(secondPage.body.posts.map((post: { content: string }) => post.content)).toEqual(['Post antigo']);
  });

  it('redireciona para login quem não está autenticado', async () => {
    const response = await request(app).get('/api/feed?page=0&limit=2');

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/login');
  });
});

describe('GET / — feed renderizado + sugestões de quem seguir', () => {
  it('lista outros usuários com isFollowing correto', async () => {
    const ana = await registerAndLogin(app, prisma, 'ana@exemplo.com', 'Ana');
    const bruno = await registerAndLogin(app, prisma, 'bruno@exemplo.com', 'Bruno');
    await ana.agent.post('/follow').type('form').send({ targetId: bruno.userId });

    const res = await ana.agent.get('/');

    expect(res.status).toBe(200);
    expect(res.text).toContain('Bruno');
    expect(res.text).toContain('Já segue');
  });
});
