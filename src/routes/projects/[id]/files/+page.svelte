<script lang="ts">
  import { page } from "$app/stores";
  import * as Card from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";

  let projectId = $derived($page.params.id);
</script>

<Card.Root>
  <Card.Header>
    <Card.Title>File Browser</Card.Title>
    <Card.Description>
      Browse and view project files
    </Card.Description>
  </Card.Header>
  <Card.Content class="py-12 text-center">
    <p class="text-muted-foreground">File browser coming soon.</p>
    <p class="text-sm text-muted-foreground mt-2">
      This will allow you to browse files in your project and reference them in chat.
    </p>
  </Card.Content>
</Card.Root>
