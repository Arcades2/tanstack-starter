import { useMutation } from "@tanstack/react-query";
import { publishPostMutationOptions } from "./publish-post.mutation";
import { PostForm } from "./post-form";

export function PostEditor() {
  const publish = useMutation(publishPostMutationOptions());
  return <PostForm onSubmit={(data) => publish.mutate({ data })} />;
}
