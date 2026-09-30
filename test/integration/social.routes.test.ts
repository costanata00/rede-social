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

async function createPost(agent: Awaited<ReturnType<typeof registerAndLogin>>['agent'], content: string) {
  await agent.post('/posts').type('form').send({ content });
  return prisma.post.findFirstOrThrow({ where: { content } });
}

describe('curtidas em posts', () => {
  it('curte um post e retorna a contagem atualizada', async () => {
    const author = await registerAndLogin(app, prisma, 'autor@exemplo.com');
    const liker = await registerAndLogin(app, prisma, 'curtidor@exemplo.com');
    const post = await createPost(author.agent, 'Post para curtir');

    const response = await liker.agent.post(`/posts/${post.id}/like`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ liked: true, count: 1 });
    await expect(prisma.like.findUnique({
      where: { userId_postId: { userId: liker.userId, postId: post.id } },
    })).resolves.not.toBeNull();
  });

  it('redireciona quem não está logado para curtir', async () => {
    const author = await registerAndLogin(app, prisma, 'autor@exemplo.com');
    const post = await createPost(author.agent, 'Post privado de sessão');

    const response = await request(app).post(`/posts/${post.id}/like`);

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/login');
  });
});

describe('comentários', () => {
  it('cria um comentário com o autor da sessão', async () => {
    const author = await registerAndLogin(app, prisma, 'autor@exemplo.com');
    const commenter = await registerAndLogin(app, prisma, 'comentador@exemplo.com');
    const post = await createPost(author.agent, 'Post para comentar');

    const response = await commenter.agent
      .post(`/posts/${post.id}/comments`)
      .type('form')
      .send({ content: 'Comentário de teste' });

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(`/posts/${post.id}`);
    const comment = await prisma.comment.findFirstOrThrow({ where: { postId: post.id } });
    expect(comment.content).toBe('Comentário de teste');
    expect(comment.authorId).toBe(commenter.userId);
  });

  it('impede apagar comentário de outra pessoa', async () => {
    const postAuthor = await registerAndLogin(app, prisma, 'autor@exemplo.com');
    const commenter = await registerAndLogin(app, prisma, 'comentador@exemplo.com');
    const post = await createPost(postAuthor.agent, 'Post com comentário alheio');
    await commenter.agent
      .post(`/posts/${post.id}/comments`)
      .type('form')
      .send({ content: 'Comentário de Bruno' });
    const comment = await prisma.comment.findFirstOrThrow({ where: { postId: post.id } });

    const response = await postAuthor.agent.post(`/posts/${post.id}/comments/${comment.id}/delete`);

    expect(response.status).toBe(403);
    await expect(prisma.comment.findUnique({ where: { id: comment.id } })).resolves.not.toBeNull();
  });
});

describe('curtidas em comentários', () => {
  it('curte um comentário e retorna a contagem atualizada', async () => {
    const author = await registerAndLogin(app, prisma, 'autor@exemplo.com');
    const commenter = await registerAndLogin(app, prisma, 'comentador@exemplo.com');
    const liker = await registerAndLogin(app, prisma, 'curtidor@exemplo.com');
    const post = await createPost(author.agent, 'Post para curtir comentário');
    await commenter.agent
      .post(`/posts/${post.id}/comments`)
      .type('form')
      .send({ content: 'Comentário curtido' });
    const comment = await prisma.comment.findFirstOrThrow({ where: { postId: post.id } });

    const response = await liker.agent.post(`/posts/${post.id}/comments/${comment.id}/like`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ liked: true, count: 1 });
    await expect(prisma.commentLike.findUnique({
      where: { userId_commentId: { userId: liker.userId, commentId: comment.id } },
    })).resolves.not.toBeNull();
  });

  it('redireciona quem não está logado para curtir comentário', async () => {
    const author = await registerAndLogin(app, prisma, 'autor@exemplo.com');
    const commenter = await registerAndLogin(app, prisma, 'comentador@exemplo.com');
    const post = await createPost(author.agent, 'Post de sessão');
    await commenter.agent
      .post(`/posts/${post.id}/comments`)
      .type('form')
      .send({ content: 'Comentário de sessão' });
    const comment = await prisma.comment.findFirstOrThrow({ where: { postId: post.id } });

    const response = await request(app).post(`/posts/${post.id}/comments/${comment.id}/like`);

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/login');
  });
});