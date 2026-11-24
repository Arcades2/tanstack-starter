import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";
import { authMiddleware, requirePermission } from "@/features/auth/auth.middlewares";
import { validate } from "@/lib/validate";
import { publishPost } from "./publish-post.server";

export const publishPostSchema = v.object({ title: v.pipe(v.string(), v.minLength(1)), body: v.string() });
export type PublishPostInput = v.InferOutput<typeof publishPostSchema>;

export const publishPostFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware, requirePermission({ post: ["create"] })])
  .validator(validate(publishPostSchema))
  .handler(({ data, context }) => publishPost(data, context.session.user.id));
