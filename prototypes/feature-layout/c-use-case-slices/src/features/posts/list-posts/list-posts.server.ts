import { database, type Db } from "@/platform/db";
import type { ListPostsInput } from "./list-posts.functions";

export async function listPosts(input: ListPostsInput, db: Db = database) {
  return db.query.posts.findMany({ limit: input.limit, orderBy: (p, { desc }) => desc(p.createdAt) });
}
