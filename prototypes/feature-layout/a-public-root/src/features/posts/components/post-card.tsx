// INTERNAL dumb component.
export function PostCard({ post }: { post: { title: string } }) {
  return <li>{post.title}</li>;
}
