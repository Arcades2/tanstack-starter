import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";
import { authMiddleware } from "@/features/auth/auth.middlewares";
import { validate } from "@/lib/validate";
import { listPosts } from "./list-posts.server";

export const listPostsSchema = v.object({ limit: v.optional(v.number(), 20) });
export type ListPostsInput = v.InferOutput<typeof listPostsSchema>;

export const listPostsFn = createServerFn()
  .middleware([authMiddleware])
  .validator(validate(listPostsSchema))
  .handler(({ data }) => listPosts(data));
