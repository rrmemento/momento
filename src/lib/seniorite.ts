// Séniorité d'un commercial, et le budget proposé par défaut pour chacune (voir BUDGETS).
export const SENIORITES: readonly string[] = ["M1", "M2", "M3+"];

export const BUDGET_PAR_SENIORITE: Record<string, number> = { M1: 5, M2: 10, "M3+": 15 };
