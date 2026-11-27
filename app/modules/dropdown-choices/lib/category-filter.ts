import { z } from "zod";

export const ALL_CATEGORIES = "all";

const categoryParamSchema = z
  .string()
  .nullable()
  .transform((slug) => (slug && slug !== ALL_CATEGORIES ? slug : null));

export function parseCategoryParam(param: string | null): string | null {
  return categoryParamSchema.parse(param);
}

export function categoryChoice(category: string | null): string {
  return category ?? ALL_CATEGORIES;
}
