import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { emailExecutor, discordExecutor, telegramExecutor } from "./notification";
import type { NodeExecutionParams } from "../utils/context";

function createParams(parameters: Record<string, unknown>): NodeExecutionParams {
  return {
    nodeId: "notification-1",
    nodeName: "Notification",
    nodeType: "notification",
    parameters,
    context: {
      trigger: { type: "manual", data: {}, timestamp: new Date() },
      steps: {},
      env: {} as NodeExecutionParams["context"]["env"],
    },
  };
}

describe("emailExecutor", () => {
  describe("validation", () => {
    it("requires to, subject, and body", () => {
      const errors = emailExecutor.validate!({});
      expect(errors).toContain("Recipient (to) is required");
      expect(errors).toContain("Subject is required");
      expect(errors).toContain("Body is required");
    });

    it("requires API key for non-SMTP providers", () => {
      const errors = emailExecutor.validate!({
        to: "test@example.com",
        subject: "Test",
        body: "Test body",
        provider: "resend",
      });
      expect(errors).toContain("API key is required for resend provider");
    });

    it("passes with valid params and API key", () => {
      const errors = emailExecutor.validate!({
        to: "test@example.com",
        subject: "Test",
        body: "Test body",
        provider: "resend",
        apiKey: "test-key",
      });
      expect(errors).toHaveLength(0);
    });

    it("passes for SMTP without API key", () => {
      const errors = emailExecutor.validate!({
        to: "test@example.com",
        subject: "Test",
        body: "Test body",
        provider: "smtp",
      });
      expect(errors).toHaveLength(0);
    });
  });

  describe("execution", () => {
    beforeEach(() => {
      vi.stubGlobal("fetch", vi.fn());
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("returns error for missing required fields", async () => {
      const result = await emailExecutor.execute(createParams({}));
      expect(result.success).toBe(false);
      expect(result.error).toContain("Missing required fields");
    });

    it("returns error for SMTP provider", async () => {
      const result = await emailExecutor.execute(createParams({
        to: "test@example.com",
        subject: "Test",
        body: "Test body",
        provider: "smtp",
      }));
      expect(result.success).toBe(false);
      expect(result.error).toContain("SMTP provider not yet supported");
    });

    it("sends email via Resend", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: "email_123" }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await emailExecutor.execute(createParams({
        to: "test@example.com",
        subject: "Test Subject",
        body: "Test body",
        provider: "resend",
        apiKey: "re_test_key",
      }));

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.sent).toBe(true);
      expect(data.provider).toBe("resend");
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.resend.com/emails",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Authorization": "Bearer re_test_key",
          }),
        })
      );
    });

    it("sends email via SendGrid", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await emailExecutor.execute(createParams({
        to: "test@example.com",
        subject: "Test Subject",
        body: "Test body",
        provider: "sendgrid",
        apiKey: "sg_test_key",
      }));

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.sent).toBe(true);
      expect(data.provider).toBe("sendgrid");
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.sendgrid.com/v3/mail/send",
        expect.objectContaining({
          method: "POST",
        })
      );
    });

    it("handles API errors", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        text: () => Promise.resolve("Invalid API key"),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await emailExecutor.execute(createParams({
        to: "test@example.com",
        subject: "Test",
        body: "Test body",
        provider: "resend",
        apiKey: "invalid",
      }));

      expect(result.success).toBe(false);
      expect(result.error).toContain("Resend API error");
    });
  });
});

describe("discordExecutor", () => {
  describe("validation", () => {
    it("requires webhook URL", () => {
      const errors = discordExecutor.validate!({});
      expect(errors).toContain("Webhook URL is required");
    });

    it("validates Discord webhook URL format", () => {
      const errors = discordExecutor.validate!({ webhookUrl: "https://example.com/hook" });
      expect(errors).toContain("Invalid Discord webhook URL");
    });

    it("requires content or embeds", () => {
      const errors = discordExecutor.validate!({
        webhookUrl: "https://discord.com/api/webhooks/123/abc",
      });
      expect(errors).toContain("Either content or embeds is required");
    });

    it("passes with content", () => {
      const errors = discordExecutor.validate!({
        webhookUrl: "https://discord.com/api/webhooks/123/abc",
        content: "Hello!",
      });
      expect(errors).toHaveLength(0);
    });

    it("passes with embeds", () => {
      const errors = discordExecutor.validate!({
        webhookUrl: "https://discord.com/api/webhooks/123/abc",
        embeds: [{ title: "Test" }],
      });
      expect(errors).toHaveLength(0);
    });
  });

  describe("execution", () => {
    beforeEach(() => {
      vi.stubGlobal("fetch", vi.fn());
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("returns error for missing webhook URL", async () => {
      const result = await discordExecutor.execute(createParams({}));
      expect(result.success).toBe(false);
      expect(result.error).toContain("Webhook URL is required");
    });

    it("sends message to Discord", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await discordExecutor.execute(createParams({
        webhookUrl: "https://discord.com/api/webhooks/123456/abcdef",
        content: "Hello from workflow!",
        username: "AgentPod Bot",
      }));

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.sent).toBe(true);
      expect(data.hasContent).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://discord.com/api/webhooks/123456/abcdef",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("Hello from workflow!"),
        })
      );
    });

    it("sends embeds to Discord", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await discordExecutor.execute(createParams({
        webhookUrl: "https://discord.com/api/webhooks/123456/abcdef",
        embeds: [
          { title: "Test Embed", description: "A test embed", color: 0x00ff00 },
        ],
      }));

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.embedCount).toBe(1);
    });

    it("masks webhook URL in response", async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal("fetch", mockFetch);

      const result = await discordExecutor.execute(createParams({
        webhookUrl: "https://discord.com/api/webhooks/123456/secret-token",
        content: "Test",
      }));

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.webhookUrl).toContain("***");
      expect(data.webhookUrl).not.toContain("secret-token");
    });

    it("handles Discord API errors", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        text: () => Promise.resolve("Invalid webhook"),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await discordExecutor.execute(createParams({
        webhookUrl: "https://discord.com/api/webhooks/123/abc",
        content: "Test",
      }));

      expect(result.success).toBe(false);
      expect(result.error).toContain("Discord webhook error");
    });
  });
});

describe("telegramExecutor", () => {
  describe("validation", () => {
    it("requires botToken, chatId, and text", () => {
      const errors = telegramExecutor.validate!({});
      expect(errors).toContain("Bot token is required");
      expect(errors).toContain("Chat ID is required");
      expect(errors).toContain("Text is required");
    });

    it("passes with valid params", () => {
      const errors = telegramExecutor.validate!({
        botToken: "123456:ABC-DEF",
        chatId: "@channelname",
        text: "Hello!",
      });
      expect(errors).toHaveLength(0);
    });
  });

  describe("execution", () => {
    beforeEach(() => {
      vi.stubGlobal("fetch", vi.fn());
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("returns error for missing required fields", async () => {
      const result = await telegramExecutor.execute(createParams({}));
      expect(result.success).toBe(false);
      expect(result.error).toContain("Missing required fields");
    });

    it("sends message to Telegram", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          ok: true,
          result: { message_id: 42 },
        }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await telegramExecutor.execute(createParams({
        botToken: "123456:ABC-DEF",
        chatId: "987654321",
        text: "Hello from workflow!",
      }));

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.sent).toBe(true);
      expect(data.messageId).toBe(42);
      expect(data.chatId).toBe("987654321");
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.telegram.org/bot123456:ABC-DEF/sendMessage",
        expect.objectContaining({
          method: "POST",
        })
      );
    });

    it("includes parse mode and options", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          ok: true,
          result: { message_id: 1 },
        }),
      });
      vi.stubGlobal("fetch", mockFetch);

      await telegramExecutor.execute(createParams({
        botToken: "123456:ABC-DEF",
        chatId: "987654321",
        text: "<b>Bold</b> text",
        parseMode: "HTML",
        disableNotification: true,
      }));

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.parse_mode).toBe("HTML");
      expect(body.disable_notification).toBe(true);
    });

    it("handles Telegram API errors", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          ok: false,
          description: "Chat not found",
        }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await telegramExecutor.execute(createParams({
        botToken: "123456:ABC-DEF",
        chatId: "invalid",
        text: "Test",
      }));

      expect(result.success).toBe(false);
      expect(result.error).toContain("Chat not found");
    });
  });
});
