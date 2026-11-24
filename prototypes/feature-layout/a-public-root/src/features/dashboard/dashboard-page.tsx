// Aggregate feature: composes posts through its public root files.
import { PostList } from "@/features/posts/post-list";

export function DashboardPage() {
  return <section><h1>Dashboard</h1><PostList /></section>;
}
