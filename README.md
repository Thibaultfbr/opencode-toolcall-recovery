# OpenCode Fake Bash Tool Call Recovery

A small OpenCode plugin that automatically recovers malformed Bash tool calls emitted as plain text by some local LLMs.

## Problem

Some local models may accidentally output a fake tool call like this:

```xml
<tool_call>
<function=bash>
<parameter=command>
docker ps
</parameter>
</function>
</tool_call>
```

instead of triggering a real executable OpenCode Bash tool call.

When this happens, OpenCode receives plain text instead of an actual tool invocation, which can interrupt or derail the agent workflow.

## What this plugin does

This plugin:

1. Detects fake serialized Bash tool calls in model output.
2. Extracts the original Bash command.
3. Waits until the OpenCode session becomes idle.
4. Automatically prompts the model to re-emit the command using the real OpenCode Bash tool.
5. Prevents infinite retry loops with a retry limit.

## Installation

### Global installation

Download or copy the plugin file:

```text
toolcall-recovery.ts
```

Then place it inside OpenCode's global plugins directory:

```text
~/.config/opencode/plugins/
```

On macOS, this usually means:

```text
/Users/YOUR_USERNAME/.config/opencode/plugins/
```

Then restart OpenCode.

OpenCode will automatically load the plugin from this folder.  
No additional configuration is required in `opencode.json`.

### Terminal installation example

```bash
mkdir -p ~/.config/opencode/plugins
cp toolcall-recovery.ts ~/.config/opencode/plugins/
```

Then restart OpenCode.

## Example behavior

Without the plugin, a local model may output a fake textual tool call:

```xml
<tool_call>
<function=bash>
<parameter=command>
docker exec ps16_app php -v
</parameter>
</function>
</tool_call>
```

With the plugin enabled, OpenCode automatically sends a corrective prompt to the model so it retries the same command as a real executable Bash tool call.

## Notes

- This plugin currently targets malformed **Bash** tool calls only.
- It is mainly useful with local LLMs that sometimes serialize tool calls as text instead of emitting native tool calls.
- The plugin retries the same extracted command at most 2 times per session and command signature.

## License

MIT
