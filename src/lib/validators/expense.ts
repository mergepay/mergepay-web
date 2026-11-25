/**
 * Expense creation and split validation schemas (#714).
 * Enforces valid amounts, participant allocations, and required metadata for react-hook-form.
 */
export {
  expenseFormSchema as expenseCreationSchema,
  expenseFormSchema,
  expenseShareSchema,
  type ExpenseFormValues,
} from "../validations/expense";
