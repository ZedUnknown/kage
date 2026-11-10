export const date = (value: unknown) => value ? new Date(String(value)).toLocaleString() : 'Never';
