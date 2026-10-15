import { atom, read, update } from 'claude-code'
import type { Register, RenderElement, RenderNode, TurnStepChunk } from 'claude-code'

const isEnabled = atom({ plugin: 'prompt-numbers', key: 'isEnabled' } as const, true)
const savedPromptNumbers = atom({ plugin: 'prompt-numbers', key: 'numbered' } as const, [] as { id: string; number: number }[])

const ENABLED_KEY = 'isEnabled'

const PROMPT = '#1FB5D6'
const WORKING = '#8BC34A'
const ANSWER = '#E6B422'
const LABEL_INK = '#000000'
// Columns the transcript keeps beside a row, so a full-width line never wraps.
const TRANSCRIPT_GUTTER = 4
const TURN_SETTLE_MS = 2000

type Row = { turnId: string; step: number; number: number; isFirstOfTurn: boolean; isFirstOfStep: boolean }
type Elements = { Box: unknown; Text: unknown }
type BoxElement = (props: { flexDirection?: 'row' | 'column'; flexShrink?: number; flexGrow?: number; marginTop?: number; children?: unknown }) => RenderElement
type TextElement = (props: { backgroundColor?: string; color?: string; bold?: boolean; wrap?: 'truncate'; children?: unknown }) => RenderNode

// A section: a full-width line half a character high in `colour` (lower half
// blocks, so it sits on the badge row), then the badge: the label black on
// `colour` between two dithered `colour` cells. The body sits beside it in the
// default colours, wrapped lines kept to its right.
//
//   ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄…
//   🮕P7🮕 body text that wraps
//        onto the next line here
function section(elements: Elements, columns: number | undefined, label: string, colour: string, body: RenderNode): RenderElement {
  const Box = elements.Box as BoxElement
  const Text = elements.Text as TextElement
  const width = Math.max(label.length + 4, (columns ?? 80) - TRANSCRIPT_GUTTER)

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={colour} wrap="truncate">
        {'▄'.repeat(width)}
      </Text>
      <Box flexDirection="row">
        <Box flexShrink={0}>
          <Text color={colour}>🮕</Text>
          <Text backgroundColor={colour} color={LABEL_INK} bold>
            {label}
          </Text>
          <Text color={colour}>🮕</Text>
          <Text> </Text>
        </Box>
        <Box flexDirection="column" flexShrink={1} flexGrow={1}>
          {body}
        </Box>
      </Box>
    </Box>
  )
}

export const register: Register = on => {
  // Prompt row id -> its P number, handed out the first time a row is drawn, which
  // is the order you sent them. Mirrored to $.state just after the draw (a draw may
  // not write), so a hot reload keeps them.
  const promptNumbers = new Map<string, number>()
  // Where the running turn stands: which prompt caused it and which model step
  // runs. turnId is '' while no turn runs.
  let turn = { turnId: '', step: -1, number: 0 }
  // Rows of Claude's reply (text blocks and tool rows) -> where they fell.
  const rows = new Map<string, Row>()
  // Rows first drawn while no turn ran: earlier turns' rows, drawn again after a
  // reload, a resume or a resize. They never join a later turn.
  const pastRows = new Set<string>()
  const turnsWithRows = new Set<string>()
  const stepsWithRows = new Set<string>()
  // Steps that ended with no tool call: the final answer's.
  const finalSteps = new Set<string>()

  function placeRow(id: string): Row | undefined {
    const known = rows.get(id)
    if (known !== undefined) return known
    if (pastRows.has(id)) return undefined
    if (turn.turnId === '') {
      pastRows.add(id)
      return undefined
    }
    if (promptNumbers.size === 0) return undefined
    // The turn can start before its prompt row is drawn, so its number is taken
    // when its first reply row is placed, by which time the prompt has its P number.
    if (turn.number === 0) turn = { ...turn, number: promptNumbers.size }

    const stepKey = `${turn.turnId}:${turn.step}`
    const row: Row = {
      turnId: turn.turnId,
      step: turn.step,
      number: turn.number,
      isFirstOfTurn: !turnsWithRows.has(turn.turnId),
      isFirstOfStep: !stepsWithRows.has(stepKey),
    }
    turnsWithRows.add(turn.turnId)
    stepsWithRows.add(stepKey)
    rows.set(id, row)

    return row
  }

  on('session.start', async ($, e, next) => {
    const storedEnabled = await $.store.get(ENABLED_KEY)
    await update($, isEnabled, () => storedEnabled !== false)
    for (const entry of await read($, savedPromptNumbers)) promptNumbers.set(entry.id, entry.number)
    await $.command.register({
      name: 'prompt-numbers',
      description: 'Numbered P/T/A sections: /prompt-numbers on, off, or alone for the status',
      argumentHint: 'on|off',
      immediate: true,
    })

    return next(e)
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      promptNumbers.clear()
      rows.clear()
      pastRows.clear()
      turnsWithRows.clear()
      stepsWithRows.clear()
      finalSteps.clear()
      turn = { turnId: '', step: -1, number: 0 }
      await update($, savedPromptNumbers, () => [])
    }

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    turn = { turnId: e.turnId, step: -1, number: 0 }

    return next(e)
  })

  // The turn's last rows can be drawn just after it completes, so it stays open a
  // moment longer before later rows count as past.
  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      const { turnId } = e
      $.clock.after(TURN_SETTLE_MS, () => {
        if (turn.turnId === turnId) turn = { turnId: '', step: -1, number: 0 }
      })
    }

    return next(e)
  })

  // Each model request of the turn is one step. A step that stops without asking
  // for tools is the final answer; the steps before it are the working part.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) return yield* next(e)

    if (e.turnId === turn.turnId) turn = { ...turn, step: e.index }
    const stepKey = `${e.turnId}:${e.index}`
    const stream = next(e)
    // From the step's first text on, chunks wait here until the step shows what it
    // is: a tool call means the working part; reaching its end with none, the final
    // answer. So the answer is marked final before its text is drawn. On the main
    // screen a drawn row goes to scrollback and can't be redrawn later.
    const held: TurnStepChunk[] = []
    let hasTool = false

    let result: Awaited<typeof stream.result>
    try {
      for await (const chunk of stream) {
        if (chunk.kind === 'tool') hasTool = true

        if (!hasTool && (held.length > 0 || chunk.kind === 'text')) {
          held.push(chunk)
          continue
        }
        yield* held.splice(0)
        yield chunk
      }
      result = await stream.result
    } catch (error) {
      // Cut short (Esc, an API error): pass on the text written so far, so it is
      // shown and recorded as it would be without the mod.
      yield* held.splice(0)
      throw error
    }

    if (!hasTool && result.toolUses.length === 0 && !next.signal.aborted) finalSteps.add(stepKey)
    yield* held.splice(0)

    return result
  })

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    if (e.props.origin.kind !== 'composer' || e.props.text.trimStart().startsWith('/')) return next(e)
    if (!(await read($, isEnabled))) return next(e)

    let number = promptNumbers.get(e.requestId)
    if (number === undefined) {
      number = promptNumbers.size + 1
      promptNumbers.set(e.requestId, number)
      const entry = { id: e.requestId, number }
      $.clock.after(0, () => void update($, savedPromptNumbers, list => [...list.filter(one => one.id !== entry.id), entry]))
    }

    const elements = $.ui.resolve(e)
    const { Text } = elements

    return section(elements, e.viewport?.columns, `P${number}`, PROMPT, (
      <Text>{e.props.text}</Text>
    ))
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.props.isSummary || !(await read($, isEnabled))) return next(e)

    const row = placeRow(e.requestId)
    if (row === undefined) return next(e)

    const isAnswer = finalSteps.has(`${row.turnId}:${row.step}`)
    const label = isAnswer && row.isFirstOfStep ? `A${row.number}` : !isAnswer && row.isFirstOfTurn ? `T${row.number}` : undefined
    if (label === undefined) return next(e)

    const elements = $.ui.resolve(e)
    const { Markdown } = elements

    return section(elements, e.viewport?.columns, label, isAnswer ? ANSWER : WORKING, <Markdown text={e.props.text} />)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (!(await read($, isEnabled))) return next(e)

    const row = placeRow(e.requestId)
    if (row === undefined || !row.isFirstOfTurn) return next(e)

    return section($.ui.resolve(e), e.viewport?.columns, `T${row.number}`, WORKING, await next(e))
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    if (!(await read($, isEnabled))) return next(e)

    // A group replaces the rows of the calls it folds in, so it carries the T bar
    // when one of them was the turn's first row.
    const folded = e.props.calls
      .map(call => (call.tool_use_id === undefined ? undefined : rows.get(call.tool_use_id)))
      .find(one => one?.isFirstOfTurn)
    const row = folded ?? placeRow(e.requestId)
    if (row === undefined || !row.isFirstOfTurn) return next(e)

    return section($.ui.resolve(e), e.viewport?.columns, `T${row.number}`, WORKING, await next(e))
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'prompt-numbers' }, async ($, e) => {
    const word = e.args.trim().toLowerCase()

    if (word === 'on' || word === 'off') {
      const value = word === 'on'
      await update($, isEnabled, () => value)
      await $.store.set(ENABLED_KEY, value)

      return { text: value ? 'Numbered sections are on.' : 'Numbered sections are off. Everything draws as usual.' }
    }

    const value = await read($, isEnabled)

    return { text: `Numbered sections are ${value ? 'on' : 'off'}. Use /prompt-numbers on or off.` }
  })
}
