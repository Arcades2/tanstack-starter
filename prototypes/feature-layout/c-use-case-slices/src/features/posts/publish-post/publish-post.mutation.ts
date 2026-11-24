import { mutationOptions } from "@tanstack/react-query";
import { postsKeys } from "../posts.keys";
import { publishPostFn } from "./publish-post.functions";

export const publishPostMutationOptions = () =>
  mutationOptions({
    mutationFn: publishPostFn,
    onSettled: (_d, _e, _v, _r, { client }) => client.invalidateQueries({ queryKey: postsKeys.all }),
  });
