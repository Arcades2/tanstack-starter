import { useSuspenseQuery } from "@tanstack/react-query";
import { postListQueryOptions } from "./list-posts.queries";
import { PostCard } from "./post-card";

export function PostList() {
  const { data } = useSuspenseQuery(postListQueryOptions({ limit: 20 }));
  return <ul>{data.map((post) => <PostCard key={post.id} post={post} />)}</ul>;
}
