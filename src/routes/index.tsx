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

// Pared back to the dispenser on purpose. The nightly-report overview UI that
// used to live here (masthead, verdict strip, metric cards, report list, upload)
// was removed in the same pass — recover it from git history if it's wanted
// again. The single-report view at /report/$id is untouched.
function Index() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <FleetPanel />
      <TowerFiles />
    </div>
  );
}
