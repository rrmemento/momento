import { MomentoApp } from "@/components/MomentoApp";
import { DATA, MONTHS } from "@/lib/demo-data";

// Pour l'instant les données sont celles de démo ; elles viendront de Supabase ensuite.
export default function Home() {
  return <MomentoApp data={DATA} months={MONTHS} />;
}
