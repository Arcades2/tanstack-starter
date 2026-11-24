// ROOT (public by position, used internally). Schemas live next to the server fns that validate them.
// Forms import the schemas from here too (createServerFn files are client-safe).
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";
import { authMiddleware, requirePermission } from "@/features/auth/auth.middlewares";
import { validate } from "@/lib/validate";
import { listPosts, publishPost } from "./posts.server";

export const listPostsSchema = v.object({ limit: v.optional(v.number(), 20) });
export type ListPostsInput = v.InferOutput<typeof listPostsSchema>;

export const publishPostSchema = v.object({ title: v.pipe(v.string(), v.minLength(1)), body: v.string() });
export type PublishPostInput = v.InferOutput<typeof publishPostSchema>;

export const listPostsFn = createServerFn()
  .middleware([authMiddleware])
  .validator(validate(listPostsSchema))
  .handler(({ data }) => listPosts(data));

export const publishPostFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware, requirePermission({ post: ["create"] })])
  .validator(validate(publishPostSchema))
  .handler(({ data, context }) => publishPost(data, context.session.user.id));
