export const DATA_SOURCE_FORM_STORAGE_KEY = "mempool-matrix-data-source";

export type DataSourceFormValues = {
  baseUrl: string;
  label: string;
};

type DataSourceStorage = Pick<Storage, "setItem" | "removeItem">;

export function parseDataSourceFormValues(value: string | null): DataSourceFormValues | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (typeof parsed.baseUrl !== "string" || typeof parsed.label !== "string") return null;
    if (!serializeCommittedDataSource({ baseUrl: parsed.baseUrl, label: parsed.label })) return null;
    return {
      baseUrl: parsed.baseUrl,
      label: parsed.label,
    };
  } catch {
    return null;
  }
}

export function serializeDataSourceFormValues(values: DataSourceFormValues): string {
  return JSON.stringify({
    baseUrl: values.baseUrl,
    label: values.label,
  });
}

export function serializeCommittedDataSource(values: DataSourceFormValues): string | null {
  try {
    const url = new URL(values.baseUrl.trim());
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) return null;
    return serializeDataSourceFormValues({
      baseUrl: url.toString().replace(/\/$/, ""),
      label: values.label.trim(),
    });
  } catch {
    return null;
  }
}

export function commitDataSourceToStorage(
  storage: DataSourceStorage,
  values: DataSourceFormValues,
): boolean {
  const serialized = serializeCommittedDataSource(values);
  if (!serialized) {
    storage.removeItem(DATA_SOURCE_FORM_STORAGE_KEY);
    return false;
  }
  storage.setItem(DATA_SOURCE_FORM_STORAGE_KEY, serialized);
  return true;
}
