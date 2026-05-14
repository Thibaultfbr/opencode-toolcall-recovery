import type { Plugin } from "@opencode-ai/plugin"

type PendingRecovery = {
  command: string
  capturedAt: number
}

export const RecoverFakeBashToolCall: Plugin = async ({ client }) => {
  const pendingBySession = new Map<string, PendingRecovery>()
  const retryCountBySignature = new Map<string, number>()

  const MAX_RETRIES_PER_COMMAND = 2

  function normalizeCommand(command: string): string {
    return command
      .replace(/\r\n/g, "\n")
      .trim()
  }

  function extractFakeBashToolCall(text: string): string | null {
    if (!text.includes("<tool_call>")) return null
    if (!text.includes("<function=bash>")) return null
    if (!text.includes("<parameter=command>")) return null

    const match = text.match(
      /<tool_call>[\s\S]*?<function=bash>[\s\S]*?<parameter=command>\s*([\s\S]*?)\s*<\/parameter>[\s\S]*?<\/function>[\s\S]*?<\/tool_call>/i
    )

    if (!match?.[1]) return null

    const command = normalizeCommand(match[1])
    return command.length > 0 ? command : null
  }

  async function log(level: "info" | "warn", message: string, extra?: Record<string, unknown>) {
    try {
      await client.app.log({
        body: {
          service: "recover-fake-bash-tool-call",
          level,
          message,
          extra,
        },
      })
    } catch {
      // Never block the plugin because logging failed.
    }
  }

  return {
    event: async ({ event }) => {
      /**
       * 1. Watch model message chunks.
       *    The fake tool call can appear inside:
       *    - a "text" part
       *    - a "reasoning" part
       */
      if (event.type === "message.part.updated") {
        const part = event.properties.part

        if (part.type !== "text" && part.type !== "reasoning") {
          return
        }

        const command = extractFakeBashToolCall(part.text)

        if (!command) {
          return
        }

        const sessionID = part.sessionID

        pendingBySession.set(sessionID, {
          command,
          capturedAt: Date.now(),
        })

        await log("warn", "Serialized fake bash tool call detected", {
          sessionID,
          command,
        })

        return
      }

      /**
       * 2. When the session becomes idle, ask the model to retry
       *    using the exact command it should have emitted properly.
       */
      if (event.type === "session.idle") {
        const sessionID = event.properties.sessionID
        const pending = pendingBySession.get(sessionID)

        if (!pending) {
          return
        }

        pendingBySession.delete(sessionID)

        const signature = `${sessionID}:${pending.command}`
        const retryCount = retryCountBySignature.get(signature) ?? 0

        if (retryCount >= MAX_RETRIES_PER_COMMAND) {
          await log("warn", "Automatic retry skipped: retry limit reached", {
            sessionID,
            command: pending.command,
            retryCount,
          })
          return
        }

        retryCountBySignature.set(signature, retryCount + 1)

        const recoveryPrompt = [
          "Your last message contained a bash tool call serialized as plain text instead of a real executable tool call.",
          "Immediately re-emit that call using OpenCode's actual bash tool.",
          "Do not display the command as plain text.",
          "Do not use XML tags or pseudo-tool-call markup.",
          "Execute exactly this command, then continue the task normally:",
          "",
          "```bash",
          pending.command,
          "```",
        ].join("\n")

        await log("info", "Automatic retry triggered with extracted bash command", {
          sessionID,
          command: pending.command,
          retry: retryCount + 1,
        })

        await client.session.prompt({
          path: { id: sessionID },
          body: {
            parts: [
              {
                type: "text",
                text: recoveryPrompt,
              },
            ],
          },
        })
      }
    },
  }
}