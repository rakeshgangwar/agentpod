import type { NodeExecutor } from "./base";
import { createStepResult, createErrorResult } from "./base";
import type { NodeExecutionParams } from "../utils/context";

type EmailProvider = "smtp" | "sendgrid" | "resend" | "mailgun";

interface EmailParams {
  to: string;
  subject: string;
  body: string;
  from?: string;
  provider?: EmailProvider;
  apiKey?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPassword?: string;
  isHtml?: boolean;
}

interface DiscordParams {
  webhookUrl: string;
  content?: string;
  username?: string;
  avatarUrl?: string;
  embeds?: Array<{
    title?: string;
    description?: string;
    color?: number;
    fields?: Array<{ name: string; value: string; inline?: boolean }>;
    footer?: { text: string };
    timestamp?: string;
  }>;
}

interface TelegramParams {
  botToken: string;
  chatId: string;
  text: string;
  parseMode?: "HTML" | "Markdown" | "MarkdownV2";
  disableNotification?: boolean;
  replyToMessageId?: number;
}

async function sendWithResend(params: EmailParams): Promise<{ id: string }> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: params.from || "onboarding@resend.dev",
      to: params.to.split(",").map(e => e.trim()),
      subject: params.subject,
      [params.isHtml ? "html" : "text"]: params.body,
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Resend API error: ${error}`);
  }
  
  return response.json();
}

async function sendWithSendGrid(params: EmailParams): Promise<void> {
  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{
        to: params.to.split(",").map(e => ({ email: e.trim() })),
      }],
      from: { email: params.from || "noreply@example.com" },
      subject: params.subject,
      content: [{
        type: params.isHtml ? "text/html" : "text/plain",
        value: params.body,
      }],
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`SendGrid API error: ${error}`);
  }
}

async function sendWithMailgun(params: EmailParams): Promise<{ id: string; message: string }> {
  const domain = params.from?.split("@")[1] || "example.com";
  const formData = new FormData();
  formData.append("from", params.from || `noreply@${domain}`);
  formData.append("to", params.to);
  formData.append("subject", params.subject);
  formData.append(params.isHtml ? "html" : "text", params.body);
  
  const response = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${btoa(`api:${params.apiKey}`)}`,
    },
    body: formData,
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Mailgun API error: ${error}`);
  }
  
  return response.json();
}

export const emailExecutor: NodeExecutor = {
  type: "email",
  category: "action",
  
  validate(params: Record<string, unknown>) {
    const errors: string[] = [];
    
    if (!params.to || typeof params.to !== "string") {
      errors.push("Recipient (to) is required");
    }
    if (!params.subject || typeof params.subject !== "string") {
      errors.push("Subject is required");
    }
    if (!params.body || typeof params.body !== "string") {
      errors.push("Body is required");
    }
    
    const provider = params.provider as EmailProvider;
    if (provider && provider !== "smtp") {
      if (!params.apiKey) {
        errors.push(`API key is required for ${provider} provider`);
      }
    }
    
    return errors;
  },
  
  async execute(params: NodeExecutionParams) {
    const p = params.parameters as unknown as Partial<EmailParams>;
    const provider = p.provider ?? "resend";
    
    if (!p.to || !p.subject || !p.body) {
      return createErrorResult("Missing required fields: to, subject, body");
    }
    
    try {
      let result: unknown;
      
      switch (provider) {
        case "resend":
          result = await sendWithResend(p as EmailParams);
          break;
        case "sendgrid":
          await sendWithSendGrid(p as EmailParams);
          result = { success: true };
          break;
        case "mailgun":
          result = await sendWithMailgun(p as EmailParams);
          break;
        case "smtp":
          return createErrorResult("SMTP provider not yet supported in Cloudflare Workers");
        default:
          return createErrorResult(`Unknown email provider: ${provider}`);
      }
      
      return createStepResult({
        sent: true,
        provider,
        to: p.to,
        subject: p.subject,
        result,
        sentAt: new Date().toISOString(),
      });
    } catch (error) {
      return createErrorResult(`Failed to send email: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  },
};

export const discordExecutor: NodeExecutor = {
  type: "discord",
  category: "action",
  
  validate(params: Record<string, unknown>) {
    const errors: string[] = [];
    
    if (!params.webhookUrl || typeof params.webhookUrl !== "string") {
      errors.push("Webhook URL is required");
    } else if (!params.webhookUrl.startsWith("https://discord.com/api/webhooks/")) {
      errors.push("Invalid Discord webhook URL");
    }
    
    if (!params.content && (!params.embeds || (params.embeds as unknown[]).length === 0)) {
      errors.push("Either content or embeds is required");
    }
    
    return errors;
  },
  
  async execute(params: NodeExecutionParams) {
    const p = params.parameters as unknown as Partial<DiscordParams>;
    
    if (!p.webhookUrl) {
      return createErrorResult("Webhook URL is required");
    }
    
    const payload: Record<string, unknown> = {};
    
    if (p.content) payload.content = p.content;
    if (p.username) payload.username = p.username;
    if (p.avatarUrl) payload.avatar_url = p.avatarUrl;
    if (p.embeds && p.embeds.length > 0) payload.embeds = p.embeds;
    
    try {
      const response = await fetch(p.webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        const error = await response.text();
        return createErrorResult(`Discord webhook error: ${error}`);
      }
      
      return createStepResult({
        sent: true,
        webhookUrl: p.webhookUrl.replace(/\/webhooks\/\d+\/[^/]+/, "/webhooks/***"),
        hasContent: !!p.content,
        embedCount: p.embeds?.length ?? 0,
        sentAt: new Date().toISOString(),
      });
    } catch (error) {
      return createErrorResult(`Failed to send Discord message: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  },
};

export const telegramExecutor: NodeExecutor = {
  type: "telegram",
  category: "action",
  
  validate(params: Record<string, unknown>) {
    const errors: string[] = [];
    
    if (!params.botToken || typeof params.botToken !== "string") {
      errors.push("Bot token is required");
    }
    if (!params.chatId || typeof params.chatId !== "string") {
      errors.push("Chat ID is required");
    }
    if (!params.text || typeof params.text !== "string") {
      errors.push("Text is required");
    }
    
    return errors;
  },
  
  async execute(params: NodeExecutionParams) {
    const p = params.parameters as unknown as Partial<TelegramParams>;
    
    if (!p.botToken || !p.chatId || !p.text) {
      return createErrorResult("Missing required fields: botToken, chatId, text");
    }
    
    const payload: Record<string, unknown> = {
      chat_id: p.chatId,
      text: p.text,
    };
    
    if (p.parseMode) payload.parse_mode = p.parseMode;
    if (p.disableNotification) payload.disable_notification = p.disableNotification;
    if (p.replyToMessageId) payload.reply_to_message_id = p.replyToMessageId;
    
    try {
      const response = await fetch(`https://api.telegram.org/bot${p.botToken}/sendMessage`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      
      const result = await response.json() as { ok: boolean; description?: string; result?: { message_id: number } };
      
      if (!result.ok) {
        return createErrorResult(`Telegram API error: ${result.description || "Unknown error"}`);
      }
      
      return createStepResult({
        sent: true,
        chatId: p.chatId,
        messageId: result.result?.message_id,
        textLength: p.text.length,
        sentAt: new Date().toISOString(),
      });
    } catch (error) {
      return createErrorResult(`Failed to send Telegram message: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  },
};
