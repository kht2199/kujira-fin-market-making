
export const desc = (n1: number, n2: number): number => n1 < n2 ? 1 : -1

export const asc = (n1: number, n2: number): number => desc(n2, n1);

export const removeItems = (arr1: Order[], idxs: string[]) => arr1.filter(a => idxs.indexOf(a.idx) === -1)
