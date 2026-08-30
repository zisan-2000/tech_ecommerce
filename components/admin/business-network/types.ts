export type BusinessColumn = {
  label: string;
  path: string;
  format?: "text" | "status" | "date" | "money" | "count";
  currencyPath?: string;
};

export type ActionField = {
  name: string;
  label: string;
  type?: "text" | "number" | "date" | "select" | "textarea" | "checkbox";
  required?: boolean;
  options?: string[];
  defaultValue?: string;
};

export type BusinessAction = {
  label: string;
  slug: string;
  permission: string;
  tone?: "default" | "danger";
  fields?: ActionField[];
  body?: Record<string, unknown>;
  method?: "POST" | "PATCH" | "DELETE";
};

export type BusinessResourceConfig = {
  key: string;
  title: string;
  description: string;
  endpoint: string;
  detailBasePath?: string;
  createHref?: string;
  createPermission?: string;
  permission: string;
  columns: BusinessColumn[];
  statuses?: string[];
  detailRoot?: string;
  actions?: BusinessAction[];
  rowActions?: BusinessAction[];
  createForm?: {
    label: string;
    permission: string;
    fields: ActionField[];
  };
  editForm?: {
    label: string;
    permission: string;
    fields: ActionField[];
  };
};
