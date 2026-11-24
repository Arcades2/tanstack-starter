// PUBLIC smart component.
import { useMutation } from "@tanstack/react-query";
import { PostForm } from "./post-form";
import { publishPostMutationOptions } from "../posts.queries";

export function PostEditor() {
  const publish = useMutation(publishPostMutationOptions());
  return <PostForm onSubmit={(data) => publish.mutate({ data })} />;
}
