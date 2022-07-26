
export const desc = (n1: number, n2: number): number => n1 < n2 ? 1 : -1

export const asc = (n1: number, n2: number): number => desc(n2, n1);

export const removeItemsFromIds = (arr1: Order[], idxs: string[]) => arr1.filter(a => idxs.indexOf(a.idx) === -1)

export const validateRate = (n: number, name: string) => {
  if (n <= 0 || n >= 1) throw new Error(`${name} should between 0 and 1`);
}