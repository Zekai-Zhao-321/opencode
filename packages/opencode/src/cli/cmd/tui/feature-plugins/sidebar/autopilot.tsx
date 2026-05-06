import type { AssistantMessage } from "@opencode-ai/sdk/v2"
import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui"
import { createMemo, Show } from "solid-js"
import { TextAttributes } from "@opentui/core"

const id = "internal:sidebar-autopilot"

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return n.toLocaleString()
}

function fmtTime(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function getExperimental(api: TuiPluginApi): Record<string, unknown> {
  return (api.state.config.experimental ?? {}) as Record<string, unknown>
}

function getTokenBudget(api: TuiPluginApi): number {
  return (getExperimental(api).autopilot_token_budget as number) ?? 20_000_000
}

function getTimeoutMinutes(api: TuiPluginApi): number {
  return (getExperimental(api).autopilot_timeout_minutes as number) ?? 480
}

// Sidebar widget — only visible in autopilot sessions
function SidebarView(props: { api: TuiPluginApi; session_id: string }) {
  const theme = () => props.api.theme.current
  const msg = createMemo(() => props.api.state.session.messages(props.session_id))

  const isAutopilot = createMemo(() => {
    const messages = msg()
    const lastUser = messages.findLast((m) => m.role === "user")
    return lastUser?.agent === "autopilot"
  })

  const originIndex = createMemo(() => {
    const messages = msg()
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]
      if (m.role !== "user" || m.agent !== "autopilot") continue
      const parts = props.api.state.part(m.id)
      const synthetic = parts.some((p) => "synthetic" in p && p.synthetic)
      if (!synthetic) return i
    }
    return -1
  })

  const totalTokens = createMemo(() => {
    const idx = originIndex()
    const scope = idx === -1 ? msg() : msg().slice(idx)
    return scope.reduce((sum, m) => {
      if (m.role !== "assistant") return sum
      const am = m as AssistantMessage
      if (am.agent !== "autopilot") return sum
      const t = am.tokens
      return sum + (t.input ?? 0) + (t.output ?? 0) + (t.reasoning ?? 0)
    }, 0)
  })

  const elapsed = createMemo(() => {
    const idx = originIndex()
    if (idx === -1) return 0
    const origin = msg()[idx]
    return Math.floor((Date.now() - origin.time.created) / 60_000)
  })

  const autoContinues = createMemo(() => {
    const idx = originIndex()
    if (idx === -1) return 0
    const messages = msg().slice(idx)
    let count = 0
    for (const m of messages) {
      if (m.role !== "user") continue
      const parts = props.api.state.part(m.id)
      for (const p of parts) {
        if (p.type === "text" && "synthetic" in p && p.synthetic && "text" in p) {
          const text = p.text as string
          if (text.includes("Continue from where you left off") || text.includes("Continuing autonomously")) {
            count++
          }
        }
      }
    }
    return count
  })

  const tokenBudget = createMemo(() => getTokenBudget(props.api))
  const timeoutMinutes = createMemo(() => getTimeoutMinutes(props.api))
  const tokenPct = createMemo(() => Math.min(100, Math.round((totalTokens() / tokenBudget()) * 100)))
  const timePct = createMemo(() => Math.min(100, Math.round((elapsed() / timeoutMinutes()) * 100)))

  return (
    <Show when={isAutopilot()}>
      <box>
        <text fg={theme().text}>
          <b>Autopilot</b>
        </text>
        <text fg={timePct() >= 90 ? theme().warning : theme().textMuted}>
          {"  "}Time {fmtTime(elapsed())} / {fmtTime(timeoutMinutes())}
        </text>
        <text fg={tokenPct() >= 90 ? theme().warning : theme().textMuted}>
          {"  "}Tokens {fmtTokens(totalTokens())} / {fmtTokens(tokenBudget())}
        </text>
        <Show when={autoContinues() > 0}>
          <text fg={theme().textMuted}>{"  "}Continues {autoContinues()}</text>
        </Show>
      </box>
    </Show>
  )
}

// Dialog shown by /autopilot slash command
function DialogAutopilot(props: { api: TuiPluginApi }) {
  const theme = () => props.api.theme.current
  const tokenBudget = createMemo(() => getTokenBudget(props.api))
  const timeoutMinutes = createMemo(() => getTimeoutMinutes(props.api))

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme().text} attributes={TextAttributes.BOLD}>
          Autopilot Settings
        </text>
        <text fg={theme().textMuted}>esc</text>
      </box>
      <box>
        <text fg={theme().text}>
          <b>Token Budget</b>
        </text>
        <text fg={theme().textMuted}>
          {"  "}
          {fmtTokens(tokenBudget())} total tokens ({tokenBudget().toLocaleString()})
        </text>
      </box>
      <box>
        <text fg={theme().text}>
          <b>Time Cap</b>
        </text>
        <text fg={theme().textMuted}>
          {"  "}
          {fmtTime(timeoutMinutes())} ({timeoutMinutes()} minutes)
        </text>
      </box>
      <box>
        <text fg={theme().textMuted}>Configure in .opencode.json {">"} experimental:</text>
        <text fg={theme().textMuted}>
          {"  "}autopilot_token_budget: {tokenBudget().toLocaleString()}
        </text>
        <text fg={theme().textMuted}>
          {"  "}autopilot_timeout_minutes: {timeoutMinutes()}
        </text>
      </box>
    </box>
  )
}

const tui: TuiPlugin = async (api) => {
  // Sidebar slot
  api.slots.register({
    order: 150,
    slots: {
      sidebar_content(_ctx, props) {
        return <SidebarView api={api} session_id={props.session_id} />
      },
    },
  })

  // /autopilot slash command
  api.command.register(() => [
    {
      title: "Autopilot settings",
      value: "autopilot.settings",
      category: "Agent",
      slash: {
        name: "autopilot",
      },
      onSelect: () => {
        api.ui.dialog.replace(() => <DialogAutopilot api={api} />)
      },
    },
  ])
}

const plugin: TuiPluginModule & { id: string } = {
  id,
  tui,
}

export default plugin
