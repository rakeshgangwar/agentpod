export function createOpencode(_sandbox: unknown, _options: unknown) {
  return {
    beta: {
      messages: {
        stream: async function* () {
          yield { type: "text", text: "mock response" };
        },
      },
    },
  };
}
