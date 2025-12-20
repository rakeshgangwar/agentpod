export interface WorkspaceFile {
  path: string;
  content: ArrayBuffer;
  lastModified: Date;
}

export class WorkspaceStorage {
  constructor(
    private bucket: R2Bucket,
    private sandboxId: string
  ) {}

  private getKey(path: string): string {
    return `workspaces/${this.sandboxId}/${path}`;
  }

  async saveFile(path: string, content: ArrayBuffer | Uint8Array | string): Promise<void> {
    const data = typeof content === "string" ? new TextEncoder().encode(content) : content;
    await this.bucket.put(this.getKey(path), data, {
      customMetadata: {
        lastModified: new Date().toISOString(),
      },
    });
  }

  async loadFile(path: string): Promise<ArrayBuffer | null> {
    const object = await this.bucket.get(this.getKey(path));
    if (!object) return null;
    return object.arrayBuffer();
  }

  async loadFileAsText(path: string): Promise<string | null> {
    const object = await this.bucket.get(this.getKey(path));
    if (!object) return null;
    return object.text();
  }

  async deleteFile(path: string): Promise<void> {
    await this.bucket.delete(this.getKey(path));
  }

  async listFiles(): Promise<string[]> {
    const prefix = `workspaces/${this.sandboxId}/`;
    const objects = await this.bucket.list({ prefix });
    return objects.objects.map(obj => obj.key.replace(prefix, ""));
  }

  async deleteAllFiles(): Promise<void> {
    const files = await this.listFiles();
    for (const file of files) {
      await this.deleteFile(file);
    }
  }

  async getLastModified(): Promise<Date | null> {
    const prefix = `workspaces/${this.sandboxId}/`;
    const objects = await this.bucket.list({ prefix });

    if (objects.objects.length === 0) return null;

    let latest = new Date(0);
    for (const obj of objects.objects) {
      if (obj.uploaded > latest) {
        latest = obj.uploaded;
      }
    }

    return latest;
  }

  async hasWorkspace(): Promise<boolean> {
    const prefix = `workspaces/${this.sandboxId}/`;
    const objects = await this.bucket.list({ prefix, limit: 1 });
    return objects.objects.length > 0;
  }

  async getWorkspaceSize(): Promise<number> {
    const prefix = `workspaces/${this.sandboxId}/`;
    const objects = await this.bucket.list({ prefix });

    let totalSize = 0;
    for (const obj of objects.objects) {
      totalSize += obj.size;
    }

    return totalSize;
  }
}

export function createWorkspaceStorage(bucket: R2Bucket, sandboxId: string): WorkspaceStorage {
  return new WorkspaceStorage(bucket, sandboxId);
}
