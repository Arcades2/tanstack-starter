// Cross-feature write in one transaction, no deep import.
import { deletePostsByAuthor } from "@/features/posts/posts.server";
import { database } from "@/platform/db";
import { users } from "@/platform/db/schema";
import { eq } from "drizzle-orm";

export async function deleteAccount(userId: string) {
  await database.transaction(async (tx) => {
    await deletePostsByAuthor(userId, tx);
    await tx.delete(users).where(eq(users.id, userId));
  });
}
