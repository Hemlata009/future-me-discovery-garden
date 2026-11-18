import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { StudentHomeView } from "@/components/student-home";
import { TeamShell } from "@/components/team-shell";
import { useIdentity } from "@/lib/use-identity";
import { Button } from "@/components/ui/button";
import { recordStudentActivity } from "@/lib/student-activity.functions";
import { getStudentHome } from "@/lib/student-home.functions";
import { pageHead } from "@/lib/projects";

export const Route = createFileRoute("/_authenticated/me")({
  head: () =>
    pageHead("My FutureMe", "Your FutureMe Family projects, Parent Briefs and next steps."),
  component: MyFutureMe,
});

function MyFutureMe() {
  const fetchHome = useServerFn(getStudentHome);
  const identity = useIdentity();
  const record = useServerFn(recordStudentActivity);
  const query = useQuery({ queryKey: ["student-home"], queryFn: () => fetchHome(), retry: false });
  return (
    <TeamShell>
      {query.isLoading && (
        <div className="gd-skeleton" role="status" aria-label="Loading your page">
          <span />
          <span />
          <span />
          <span />
          <span className="wide" />
        </div>
      )}
      {query.isError && (
        <div className="gd-empty" role="alert">
          <h2>Your page couldn't be loaded</h2>
          <Button variant="soft" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </div>
      )}
      {query.data && (
        <StudentHomeView
          data={query.data}
          email={identity.data?.email ?? null}
          onInvite={(kind) =>
            void record({ data: { events: [{ kind: "invite_created", detail: kind }] } }).catch(
              () => undefined,
            )
          }
        />
      )}
    </TeamShell>
  );
}
