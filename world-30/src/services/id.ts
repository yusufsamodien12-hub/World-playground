let counter = 0;

export function generateId(): string {
  counter++;
  return `obj_${Date.now()}_${counter}_${Math.random().toString(36).substring(2, 8)}`;
}