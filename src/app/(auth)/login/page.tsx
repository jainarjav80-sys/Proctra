import { redirect } from "next/navigation";

/** Sign-in lives on the landing page; old /login links (and ?next=) still work. */
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const next = (await searchParams).next;
  redirect(typeof next === "string" && next ? `/?next=${encodeURIComponent(next)}` : "/");
}
