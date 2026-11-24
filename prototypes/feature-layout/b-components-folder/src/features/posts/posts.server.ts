// PUBLIC (server-only). Business operations. Other features call these server-side.
import { eq } from "drizzle-orm";
import { database, type Db } from "@/platform/db";
import { posts } from "@/platform/db/schema";
import type { ListPostsInput, PublishPostInput } from "./posts.functions";

export async function listPosts(input: ListPostsInput, db: Db = database) {
  return db.query.posts.findMany({ limit: input.limit, orderBy: (p, { desc }) => desc(p.createdAt) });
}

export async function publishPost(input: PublishPostInput, authorId: string, db: Db = database) {
  const [post] = await db.insert(posts).values({ ...input, authorId }).returning();
  return post;
}

export async function deletePostsByAuthor(authorId: string, db: Db = database) {
  await db.delete(posts).where(eq(posts.authorId, authorId));
}

export async function countPostsByAuthor(authorId: string, db: Db = database) {
  return db.$count(posts, eq(posts.authorId, authorId));
}
