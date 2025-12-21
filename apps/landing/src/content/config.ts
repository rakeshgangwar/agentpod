import { defineCollection, z } from "astro:content";

const blogCollection = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    slug: z.string().optional(),
    date: z.string(),
    author: z.string(),
    excerpt: z.string(),
    tags: z.array(z.string()),
  }),
});

export const collections = {
  blog: blogCollection,
};
