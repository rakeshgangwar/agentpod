export function getSandbox(_env: unknown, _id: string) {
  return {
    writeFile: async (_path: string, _content: string) => {},
    exec: async (_command: string, _options?: { timeout?: number }) => ({
      success: true,
      stdout: '{"__output": null}',
      stderr: "",
    }),
  };
}
