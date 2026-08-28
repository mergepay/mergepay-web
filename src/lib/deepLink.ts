import { z } from "zod";

export const deepLinkExpenseSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  amount: z.string().regex(/^\d+(\.\d{1,7})?$/, "Invalid amount").optional(),
  asset: z.string().max(12).optional(),
  memo: z.string().max(28).optional(),
  payer: z.string().optional(),
});

export type DeepLinkExpense = z.infer<typeof deepLinkExpenseSchema>;

export function parseExpenseDeepLink(searchParams: URLSearchParams | Record<string, string | string[] | undefined>): DeepLinkExpense | null {
  const getParam = (key: string): string | undefined => {
    if (searchParams instanceof URLSearchParams) {
      return searchParams.get(key) ?? undefined;
    }
    const val = searchParams[key];
    return Array.isArray(val) ? val[0] : val;
  };

  const raw = {
    title: getParam("title") ?? getParam("desc"),
    amount: getParam("amount"),
    asset: getParam("asset") ?? getParam("assetCode"),
    memo: getParam("memo"),
    payer: getParam("payer"),
  };

  const parsed = deepLinkExpenseSchema.safeParse(raw);
  if (!parsed.success) {
    return null;
  }
  return parsed.data;
}

export function buildExpenseShareUrl(baseUrl: string, groupId: string, params?: Partial<DeepLinkExpense>): string {
  const url = new URL(`/groups/${groupId}`, baseUrl);
  if (params?.title) url.searchParams.set("title", params.title);
  if (params?.amount) url.searchParams.set("amount", params.amount);
  if (params?.asset) url.searchParams.set("asset", params.asset);
  if (params?.memo) url.searchParams.set("memo", params.memo);
  return url.toString();
}