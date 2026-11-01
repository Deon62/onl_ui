/** Short random codes and ids for client-side keys (toasts etc.). */
const ALNUM = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export function randomCode(len: number, rnd: () => number = Math.random): string {
  let s = ''
  for (let i = 0; i < len; i++) s += ALNUM[Math.floor(rnd() * ALNUM.length)]
  return s
}

export const uid = (prefix: string) => `${prefix}${Date.now().toString(36).toUpperCase()}${randomCode(4)}`
