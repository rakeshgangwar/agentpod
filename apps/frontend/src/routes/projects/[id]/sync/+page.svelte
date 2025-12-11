<script lang="ts">
  import { page } from "$app/stores";
  import * as Card from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";

  let projectId = $derived($page.params.id);
</script>

<Card.Root>
  <Card.Header>
    <Card.Title>Sync Settings</Card.Title>
    <Card.Description>
      Configure GitHub synchronization for this project
    </Card.Description>
  </Card.Header>
  <Card.Content class="py-12 text-center">
    <p class="text-muted-foreground">Sync settings coming soon.</p>
    <p class="text-sm text-muted-foreground mt-2">
      This will allow you to sync your project with a GitHub repository.
    </p>
  </Card.Content>
</Card.Root>
