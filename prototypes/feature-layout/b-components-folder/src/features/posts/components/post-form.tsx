// Dumb component. Validates with the same schema as the server fn.
import { useForm } from "@tanstack/react-form";
import { type PublishPostInput, publishPostSchema } from "../posts.functions";

export function PostForm({ onSubmit }: { onSubmit: (data: PublishPostInput) => void }) {
  const form = useForm({ defaultValues: { title: "", body: "" }, validators: { onChange: publishPostSchema }, onSubmit: ({ value }) => onSubmit(value) });
  return <form onSubmit={form.handleSubmit}>{/* fields */}</form>;
}
