// ROOT (server-only). Operations with no UI use case of their own (called by other features).
import { eq } from "drizzle-orm";
import { database, type Db } from "@/platform/db";
import { posts } from "@/platform/db/schema";

export async function deletePostsByAuthor(authorId: string, db: Db = database) {
  await db.delete(posts).where(eq(posts.authorId, authorId));
}
