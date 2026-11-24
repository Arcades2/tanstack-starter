import { useForm } from "@tanstack/react-form";
import { type PublishPostInput, publishPostSchema } from "./publish-post.functions";

export function PostForm({ onSubmit }: { onSubmit: (data: PublishPostInput) => void }) {
  const form = useForm({ defaultValues: { title: "", body: "" }, validators: { onChange: publishPostSchema }, onSubmit: ({ value }) => onSubmit(value) });
  return <form onSubmit={form.handleSubmit}>{/* fields */}</form>;
}
