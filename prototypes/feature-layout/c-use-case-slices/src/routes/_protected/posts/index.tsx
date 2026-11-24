import { createFileRoute } from "@tanstack/react-router";
import { postListQueryOptions } from "@/features/posts/list-posts/list-posts.queries";
import { PostList } from "@/features/posts/list-posts/post-list";

export const Route = createFileRoute("/_protected/posts/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(postListQueryOptions({ limit: 20 })),
  component: PostList,
});
