import { getPageSession } from "@/lib/session";
import HomeClient from "./home-client";

export default async function HomePage() {
  const session = await getPageSession();

  return <HomeClient initialUsername={session?.username ?? null} />;
}
