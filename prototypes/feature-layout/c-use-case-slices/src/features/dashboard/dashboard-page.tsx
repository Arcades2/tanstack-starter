// Aggregate feature: imports a slice file directly (depth 2 is public).
import { PostList } from "@/features/posts/list-posts/post-list";

export function DashboardPage() {
  return <section><h1>Dashboard</h1><PostList /></section>;
}
