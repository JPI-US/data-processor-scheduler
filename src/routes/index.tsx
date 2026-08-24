import { createFileRoute } from "@tanstack/react-router";
import { FleetPanel } from "@/components/fleet/FleetPanel";
import { TowerFiles } from "@/components/fleet/TowerFiles";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Tower Files — Fleet" },
      {
        name: "description",
        content: "Pick a tower and download its firmware and .env from its Drive folder.",
      },
    ],
  }),
  component: Index,
});

// Pared back on purpose: the nightly report overview (Masthead, verdict strip,
// metric cards, report list) is still in src/components/report + /report/$id and
// can be dropped back in here whenever it's wanted again.
function Index() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <FleetPanel />
      <TowerFiles />
    </div>
  );
}
