import { createFileRoute } from "@tanstack/react-router";
import { PostList } from "@/features/posts/components/post-list";
import { postListQueryOptions } from "@/features/posts/posts.queries";

export const Route = createFileRoute("/_protected/posts/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(postListQueryOptions({ limit: 20 })),
  component: PostList,
});
