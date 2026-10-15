import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

const PLUGIN = 'prompt-numbers'
const SURFACES = ['terminal', 'desktop'] as const

function engineBeneath(on: On) {
  const clock = mock.clock(on)
  mock.store(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.end', () => ({}) as never)
  on('command.register', () => ({ value: {} }) as never)
  on('command.run', () => ({}))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  // A model step that answers with tools (stop: tool_use) or finishes (end_turn).
  on('turn.step', async function* ($: unknown, e: { turnId: string; index: number; model: string }) {
    const usesTools = e.index === 0 && e.model === 'with-tools'
    yield { kind: 'text', index: 0, text: 'hi' }
    if (e.model === 'cut-short') throw new Error('interrupted')
    if (usesTools) yield { kind: 'tool', index: 1, id: 'tool-1', name: 'Bash' }
    const toolUses = usesTools ? [{ name: 'Bash', input: {} }] : []
    return { turnId: e.turnId, index: e.index, answer: 'hi', toolUses }
  } as never)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine:{e.component}</Text>
  })
  return clock
}

async function start($: Engine) {
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true } as never)
}

function prompt(surface: (typeof SURFACES)[number], requestId: string, text: string) {
  return {
    plugin: PLUGIN, surface, component: 'UserMessage' as const, requestId,
    props: { text, origin: { kind: 'composer' }, isExpanded: false } as never,
  }
}

test('numbers prompts P1, P2… in order and keeps each number', async ($, on) => {
  engineBeneath(on)
  await start($)

  for (const surface of SURFACES) {
    const first = await $.ui.mount(prompt(surface, 'a', 'first question'))
    expect(await first.find({ type: 'Text', text: /^P1$/ })).toBeDefined()
    await first.unmount()

    const second = await $.ui.mount(prompt(surface, 'b', 'second question'))
    expect(await second.find({ type: 'Text', text: /^P2$/ })).toBeDefined()
    expect(await second.find({ type: 'Text', text: /second question/ })).toBeDefined()
    await second.unmount()

    const again = await $.ui.mount(prompt(surface, 'a', 'first question'))
    expect(await again.find({ type: 'Text', text: /^P1$/ })).toBeDefined()
    await again.unmount()
  }
})

test('slash commands and other rows are left alone', async ($, on) => {
  engineBeneath(on)
  await start($)

  const command = await $.ui.mount(prompt('terminal', 'c', '/top'))
  expect(await command.find({ type: 'Text', text: /engine:UserMessage/ })).toBeDefined()
  await command.unmount()

  const note = await $.ui.mount({
    plugin: PLUGIN, surface: 'terminal', component: 'UserMessage', requestId: 'n',
    props: { text: 'task done', origin: { kind: 'task-notification' }, isExpanded: false } as never,
  })
  expect(await note.find({ type: 'Text', text: /engine:UserMessage/ })).toBeDefined()
  await note.unmount()
})

test('/prompt-numbers off draws prompts as usual, and on brings numbers back', async ($, on) => {
  engineBeneath(on)
  await start($)

  const off = await $.command.run({ command: 'prompt-numbers', args: 'off', origin: { kind: 'composer' } } as never)
  expect(off.text).toMatch(/off/)
  await start($)
  const plain = await $.ui.mount(prompt('terminal', 'a', 'hello'))
  expect(await plain.find({ type: 'Text', text: /engine:UserMessage/ })).toBeDefined()
  await plain.unmount()

  await $.command.run({ command: 'prompt-numbers', args: 'on', origin: { kind: 'composer' } } as never)
  const numberedRow = await $.ui.mount(prompt('terminal', 'a', 'hello'))
  expect(await numberedRow.find({ type: 'Text', text: /^P1$/ })).toBeDefined()
  await numberedRow.unmount()
})

async function runStep($: Engine, turnId: string, index: number, model: string) {
  const stream = $.turn.step({ turnId, index, model, messageCount: 1 })
  const kinds: string[] = []
  for await (const chunk of stream) kinds.push(chunk.kind)
  // Held text is passed on in its order once the step shows what it is.
  expect(kinds).toEqual(model === 'with-tools' ? ['text', 'tool'] : ['text'])
}

function reply(surface: (typeof SURFACES)[number], requestId: string) {
  return {
    plugin: PLUGIN, surface, component: 'AssistantMessage' as const, requestId,
    props: { text: 'words', isFirstOfReply: true },
  }
}

test('T bar above the working part, A bar above the final answer, numbered by prompt', async ($, on) => {
  engineBeneath(on)
  await start($)

  const p = await $.ui.mount(prompt('terminal', 'u1', 'question one'))
  await p.unmount()

  await $.turn.start({ text: 'question one', turnId: 't1' })
  await runStep($, 't1', 0, 'with-tools')
  for (const surface of SURFACES) {
    const working = await $.ui.mount(reply(surface, 'm-work'))
    expect(await working.find({ type: 'Text', text: /^T1$/ })).toBeDefined()
    expect(await working.find({ type: 'Markdown' })).toBeDefined()
    await working.unmount()
  }

  await runStep($, 't1', 1, 'final')
  for (const surface of SURFACES) {
    const answer = await $.ui.mount(reply(surface, 'm-answer'))
    expect(await answer.find({ type: 'Text', text: /^A1$/ })).toBeDefined()
    expect(await answer.find({ type: 'Markdown' })).toBeDefined()
    await answer.unmount()
  }
})

test('a turn with no tools gets only the A bar', async ($, on) => {
  engineBeneath(on)
  await start($)

  // The turn starts before its prompt row is drawn, as in a session.
  await $.turn.start({ text: 'quick one', turnId: 't1' })
  const p = await $.ui.mount(prompt('terminal', 'u1', 'quick one'))
  await p.unmount()
  await runStep($, 't1', 0, 'final')

  const answer = await $.ui.mount(reply('terminal', 'm1'))
  expect(await answer.find({ type: 'Text', text: /^A1$/ })).toBeDefined()
  expect(await answer.find({ type: 'Text', text: /T1/ })).toBeUndefined()
  await answer.unmount()
})

test('tool rows get the T section around the engine’s own drawing, once per turn', async ($, on) => {
  engineBeneath(on)
  await start($)

  const p = await $.ui.mount(prompt('terminal', 'u1', 'do a thing'))
  await p.unmount()
  await $.turn.start({ text: 'do a thing', turnId: 't1' })
  await runStep($, 't1', 0, 'with-tools')

  const tool = (requestId: string) => ({
    plugin: PLUGIN, surface: 'terminal' as const, component: 'ToolUse' as const, requestId,
    props: { tool_use_id: requestId, tool: 'Bash', input: { command: 'ls' }, isRunning: false, isErrored: false, isInterrupted: false },
  })
  const first = await $.ui.mount(tool('tool-1'))
  expect(await first.find({ type: 'Text', text: /^T1$/ })).toBeDefined()
  expect(await first.find({ type: 'Text', text: /engine:ToolUse/ })).toBeDefined()
  await first.unmount()

  const second = await $.ui.mount(tool('tool-2'))
  expect(await second.find({ type: 'Text', text: /T1/ })).toBeUndefined()
  await second.unmount()
})

test('a group that folds in the turn’s first tool call keeps the T bar', async ($, on) => {
  engineBeneath(on)
  await start($)

  await $.turn.start({ text: 'do a thing', turnId: 't1' })
  const p = await $.ui.mount(prompt('terminal', 'u1', 'do a thing'))
  await p.unmount()
  await runStep($, 't1', 0, 'with-tools')

  const call = { tool_use_id: 'tool-1', tool: 'Bash', input: { command: 'ls' }, isRunning: false, isErrored: false, isInterrupted: false }
  const row = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'ToolUse', requestId: 'tool-1', props: call })
  expect(await row.find({ type: 'Text', text: /^T1$/ })).toBeDefined()
  await row.unmount()

  const group = await $.ui.mount({
    plugin: PLUGIN, surface: 'terminal', component: 'ToolGroup', requestId: 'group-1',
    props: { calls: [{ tool_use_id: 'tool-1', tool: 'Bash', input: { command: 'ls' }, isRunning: false, isErrored: false, isInterrupted: false }], isActive: false, isExpanded: false },
  })
  expect(await group.find({ type: 'Text', text: /^T1$/ })).toBeDefined()
  await group.unmount()
})

test('text written before a step is cut short is still passed on', async ($, on) => {
  engineBeneath(on)
  await start($)
  await $.turn.start({ text: 'q', turnId: 't1' })

  const kinds: string[] = []
  let failure: unknown
  try {
    for await (const chunk of $.turn.step({ turnId: 't1', index: 0, model: 'cut-short', messageCount: 1 })) kinds.push(chunk.kind)
  } catch (error) {
    failure = error
  }
  expect(kinds).toEqual(['text'])
  expect(failure).toBeDefined()
})

test('rows from earlier turns, drawn again during a new turn, get no bar', async ($, on) => {
  const clock = engineBeneath(on)
  await start($)

  const p1 = await $.ui.mount(prompt('terminal', 'u1', 'first'))
  await p1.unmount()
  // Drawn while no turn runs: a row of an earlier turn, as after a reload or resume.
  const old = await $.ui.mount(reply('terminal', 'old-row'))
  await old.unmount()

  await $.turn.start({ text: 'second', turnId: 't2' })
  const p2 = await $.ui.mount(prompt('terminal', 'u2', 'second'))
  await p2.unmount()
  await runStep($, 't2', 0, 'with-tools')

  const again = await $.ui.mount(reply('terminal', 'old-row'))
  expect(await again.find({ type: 'Text', text: /^T2$/ })).toBeUndefined()
  await again.unmount()
  const fresh = await $.ui.mount(reply('terminal', 'new-row'))
  expect(await fresh.find({ type: 'Text', text: /^T2$/ })).toBeDefined()
  await fresh.unmount()

  // Rows drawn just after the turn completes still belong to it...
  await $.turn.complete({ answer: 'a', durationMs: 1, isAborted: false, turnId: 't2', reason: 'answer' } as never)
  await runStep($, 't2', 1, 'final')
  const answer = await $.ui.mount(reply('terminal', 'answer-row'))
  expect(await answer.find({ type: 'Text', text: /^A2$/ })).toBeDefined()
  await answer.unmount()

  // ...and once it has settled, a newly drawn row joins no turn.
  await clock.advance(2001)
  const later = await $.ui.mount(reply('terminal', 'later-row'))
  expect(await later.find({ type: 'Text', text: /^[TA]2$/ })).toBeUndefined()
  await later.unmount()
})
