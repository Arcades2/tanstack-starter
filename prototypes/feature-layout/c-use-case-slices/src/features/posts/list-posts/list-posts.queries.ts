import { queryOptions } from "@tanstack/react-query";
import { postsKeys } from "../posts.keys";
import { type ListPostsInput, listPostsFn } from "./list-posts.functions";

export const postListQueryOptions = (input: ListPostsInput) =>
  queryOptions({ queryKey: [...postsKeys.all, "list", input], queryFn: () => listPostsFn({ data: input }) });
