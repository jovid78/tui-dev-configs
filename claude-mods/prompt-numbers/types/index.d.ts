export type PromptNumbersEntry = { id: string; number: number }

declare module 'claude-code' {
  interface PluginState {
    'prompt-numbers': {
      isEnabled: boolean
      numbered: PromptNumbersEntry[]
    }
  }
}
