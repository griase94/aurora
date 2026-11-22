<script lang="ts">
	import { useSession } from "../../../src/lib/session/context.ts";

	const session = useSession();
</script>

<p data-tenant={session.tenantId} data-scenario={session.scenario} data-status={session.load.status}>{session.clock.instant} {session.actor.kind}</p>
