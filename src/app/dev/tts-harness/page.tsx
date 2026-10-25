import { notFound } from "next/navigation";
import { TtsHarness } from "@/components/dev/tts-harness";

/** Dev-only: drives SentenceSpeaker + the TTS engine chain for automated audio tests. */
export default function TtsHarnessPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <TtsHarness />;
}
