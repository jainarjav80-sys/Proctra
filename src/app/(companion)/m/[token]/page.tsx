import type { Metadata } from "next";
import { PhoneCompanion } from "@/components/companion/phone-companion";

export const metadata: Metadata = { title: "Proctra phone camera", robots: { index: false, follow: false } };

/** Zero-install phone camera page opened from the interview QR code. */
export default async function CompanionPage({ params }: PageProps<"/m/[token]">) {
  const { token } = await params;
  return (
    <main className="dark flex flex-1 flex-col bg-arena p-4 text-foreground">
      <PhoneCompanion token={decodeURIComponent(token)} />
    </main>
  );
}
