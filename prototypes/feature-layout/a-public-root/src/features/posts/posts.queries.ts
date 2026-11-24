// PUBLIC. Routes preload with these; smart components consume them.
import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { type ListPostsInput, listPostsFn, publishPostFn } from "./functions/posts.functions";

export const postsKeys = { all: ["posts"] as const };

export const postListQueryOptions = (input: ListPostsInput) =>
  queryOptions({ queryKey: [...postsKeys.all, "list", input], queryFn: () => listPostsFn({ data: input }) });

export const publishPostMutationOptions = () =>
  mutationOptions({
    mutationFn: publishPostFn,
    onSettled: (_d, _e, _v, _r, { client }) => client.invalidateQueries({ queryKey: postsKeys.all }),
  });
