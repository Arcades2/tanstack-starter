// PUBLIC smart component.
import { useSuspenseQuery } from "@tanstack/react-query";
import { PostCard } from "./components/post-card";
import { postListQueryOptions } from "./posts.queries";

export function PostList() {
  const { data } = useSuspenseQuery(postListQueryOptions({ limit: 20 }));
  return <ul>{data.map((post) => <PostCard key={post.id} post={post} />)}</ul>;
}
