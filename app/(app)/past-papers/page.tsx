import { redirect, RedirectType } from 'next/navigation'

export default async function PastPapersPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const searchParams = await (props.searchParams ?? Promise.resolve({}))
  const sp = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams)) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null) {
          sp.append(key, String(item))
        }
      }
    } else {
      sp.set(key, String(value))
    }
  }
  const query = sp.toString()
  redirect(`/logs${query ? `?${query}` : ''}`, RedirectType.replace)
}
