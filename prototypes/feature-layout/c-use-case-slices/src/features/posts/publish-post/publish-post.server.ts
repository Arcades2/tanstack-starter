import { database, type Db } from "@/platform/db";
import { posts } from "@/platform/db/schema";
import type { PublishPostInput } from "./publish-post.functions";

export async function publishPost(input: PublishPostInput, authorId: string, db: Db = database) {
  const [post] = await db.insert(posts).values({ ...input, authorId }).returning();
  return post;
}
