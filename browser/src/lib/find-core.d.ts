export type FindDirection = 'first' | 'next' | 'prev';
export type FindResult = { count: number; index: number };

export function createFinder(getRoot: () => Node | null | undefined): {
  find(text: string, dir?: FindDirection): FindResult;
  clear(): void;
};
