// Lives in list-posts; if publish-post wants a preview card, where does it go? (root? import across slices?)
export function PostCard({ post }: { post: { title: string } }) {
  return <li>{post.title}</li>;
}
