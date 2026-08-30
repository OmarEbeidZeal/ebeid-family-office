export const DEFAULT_CATEGORIES: Array<{
  name: string;
  category_group: "Income" | "Essential" | "Lifestyle" | "Financial" | "Transfer";
  is_essential: boolean;
  colour: string;
}> = [
  { name: "Salary", category_group: "Income", is_essential: false, colour: "#4ADE80" },
  { name: "Dividends", category_group: "Income", is_essential: false, colour: "#4ADE80" },
  { name: "Rent Received", category_group: "Income", is_essential: false, colour: "#4ADE80" },
  { name: "Mortgage", category_group: "Essential", is_essential: true, colour: "#C9A961" },
  { name: "Rent Paid", category_group: "Essential", is_essential: true, colour: "#C9A961" },
  { name: "Council Tax", category_group: "Essential", is_essential: true, colour: "#C9A961" },
  { name: "Utilities", category_group: "Essential", is_essential: true, colour: "#C9A961" },
  { name: "Groceries", category_group: "Essential", is_essential: true, colour: "#C9A961" },
  { name: "Childcare", category_group: "Essential", is_essential: true, colour: "#C9A961" },
  { name: "Nursery", category_group: "Essential", is_essential: true, colour: "#C9A961" },
  { name: "Transport", category_group: "Essential", is_essential: true, colour: "#C9A961" },
  { name: "Health", category_group: "Essential", is_essential: true, colour: "#C9A961" },
  { name: "Insurance", category_group: "Essential", is_essential: true, colour: "#C9A961" },
  { name: "Travel", category_group: "Lifestyle", is_essential: false, colour: "#8AB4F8" },
  { name: "Dining", category_group: "Lifestyle", is_essential: false, colour: "#8AB4F8" },
  { name: "Subscriptions", category_group: "Lifestyle", is_essential: false, colour: "#8AB4F8" },
  { name: "Education", category_group: "Lifestyle", is_essential: false, colour: "#8AB4F8" },
  { name: "Charity / Zakat", category_group: "Lifestyle", is_essential: false, colour: "#8AB4F8" },
  { name: "Family Support", category_group: "Lifestyle", is_essential: false, colour: "#8AB4F8" },
  { name: "Investments", category_group: "Financial", is_essential: false, colour: "#B39DDB" },
  { name: "Tax", category_group: "Financial", is_essential: true, colour: "#B39DDB" },
  { name: "Savings Transfer", category_group: "Transfer", is_essential: false, colour: "#9E9E9E" },
  { name: "Other", category_group: "Lifestyle", is_essential: false, colour: "#9E9E9E" },
];
