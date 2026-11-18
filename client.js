// SPDX-License-Identifier: MIT
window.__ModuleLoader__.load({
  id: 'dsh-read-aloud-edge',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const PKG = 'dsh-read-aloud-edge'
    const SPEEDS = [1, 1.25, 1.5, 2, 2.5, 3, 4]

    const isZh = () => {
      try { return String(navigator.language || '').toLowerCase().startsWith('zh') } catch { return false }
    }

    const listeners = new Set()
    let state = { open: false, status: 'idle', text: '', url: '', speed: 1, error: '' }
    const emit = (patch) => {
      state = { ...state, ...patch }
      for (const listener of [...listeners]) listener()
    }
    const subscribe = (listener) => { listeners.add(listener); return () => listeners.delete(listener) }
    const snapshot = () => state

    function cleanText(value) {
      return String(value)
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/`[^`]*`/g, ' ')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/https?:\/\/\S+/g, ' ')
        .replace(/^#{1,6}\s*/gm, '')
        .replace(/[*_~>#|]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 8000)
    }

    function extractText(button) {
      const selected = (() => {
        try { return window.getSelection()?.toString() ?? '' } catch { return '' }
      })()
      const turn = button?.closest?.('[data-chat-turn]')?.getAttribute('data-chat-turn') ?? null
      const steps = [...document.querySelectorAll('[data-chat-flow-kind="assistant-step"]')]
        .filter((node) => turn === null || node.getAttribute('data-chat-turn') === turn)
      const last = steps[steps.length - 1]
      const domText = last?.innerText ?? ''
      const text = cleanText(domText.length > 0 ? domText : selected)
      return text.length > 0 ? text : cleanText(selected)
    }

    async function playText(text) {
      if (state.url !== '') {
        try { document.querySelector('audio[data-dsh-read-aloud-edge]')?.pause() } catch { /* ignored */ }
      }
      emit({ open: true, status: 'loading', text, url: '', error: '' })
      try {
        const response = await fetch('/dsh-read-aloud-edge/synthesize', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text }),
        })
        const body = await response.json()
        if (body?.ok !== true || typeof body.url !== 'string') throw new Error(body?.error ?? 'synthesis failed')
        emit({ status: 'ready', url: body.url })
      } catch (error) {
        emit({ status: 'error', error: String(error?.message ?? error) })
      }
    }

    function ReadAction({ messageId }) {
      const zh = isZh()
      const onClick = (event) => {
        const text = extractText(event.currentTarget)
        if (text === '') {
          emit({ open: true, status: 'error', error: zh ? '没有可朗读的文本' : 'No text to read', text: '', url: '' })
          return
        }
        void playText(text)
      }
      return h('button', {
        type: 'button',
        title: zh ? '朗读这条回复' : 'Read this reply aloud',
        'aria-label': zh ? '朗读这条回复' : 'Read this reply aloud',
        'data-dsh-read-aloud-edge-action': messageId,
        onClick,
        style: {
          border: 'none', background: 'transparent', padding: 0, cursor: 'pointer',
          color: 'var(--dsw-alias-label-secondary, inherit)', display: 'inline-flex',
          alignItems: 'center', justifyContent: 'center', width: 20, height: 20,
        },
      },
        h('svg', { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true },
          h('path', { d: 'M4 9.5v5h3.2L12 18V6L7.2 9.5H4Z', fill: 'currentColor' }),
          h('path', { d: 'M15.5 8.2a5 5 0 0 1 0 7.6M18 5.8a8 8 0 0 1 0 12.4', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' })))
    }

    function Player() {
      const zh = isZh()
      const [view, setView] = React.useState(snapshot)
      const audioRef = React.useRef(null)
      const [playing, setPlaying] = React.useState(false)
      const [current, setCurrent] = React.useState(0)
      const [duration, setDuration] = React.useState(0)

      React.useEffect(() => subscribe(() => setView(snapshot())), [])

      React.useEffect(() => {
        const audio = audioRef.current
        if (audio === null) return
        audio.playbackRate = view.speed
        audio.preservesPitch = true
      }, [view.speed])

      React.useEffect(() => {
        const audio = audioRef.current
        if (audio === null || view.url === '') return
        setCurrent(0)
        setDuration(0)
        audio.src = view.url
        audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
      }, [view.url])

      const stop = () => {
        const audio = audioRef.current
        if (audio !== null) {
          audio.pause()
          audio.removeAttribute('src')
          audio.load()
        }
        setPlaying(false)
        setCurrent(0)
        emit({ open: false, status: 'idle', url: '', text: '', error: '' })
      }

      const toggle = () => {
        const audio = audioRef.current
        if (audio === null || view.url === '') return
        if (audio.paused) {
          void audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
        } else {
          audio.pause()
          setPlaying(false)
        }
      }

      if (!view.open) return null

      return h('div', {
        role: 'dialog',
        'aria-label': zh ? '朗读' : 'Read aloud',
        style: {
          position: 'fixed', right: 16, bottom: 16, width: 330, zIndex: 70,
          padding: '12px 14px', borderRadius: 10,
          background: 'var(--dsw-alias-bg-l1, #fff)', color: 'var(--dsw-alias-label-primary, inherit)',
          border: '.5px solid var(--dsw-alias-border-l1, rgba(127,127,127,.3))',
          boxShadow: '0 12px 32px rgba(0,0,0,.24)',
        },
      },
        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingBottom: 6 } },
          h('div', { style: { fontSize: 13, fontWeight: 600 } }, zh ? '朗读' : 'Read aloud'),
          h('button', {
            type: 'button', onClick: stop, title: zh ? '关闭' : 'Close',
            style: { border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--dsw-alias-label-secondary, inherit)', fontSize: 13 },
          }, '✕')),
        h('div', {
          style: {
            fontSize: 11, lineHeight: '16px', color: 'var(--dsw-alias-label-tertiary, inherit)',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            paddingBottom: 8,
          },
        }, view.text),
        view.status === 'loading'
          ? h('div', { style: { fontSize: 12, padding: '6px 0' } }, zh ? '正在合成语音…' : 'Synthesizing…')
          : view.status === 'error'
            ? h('div', { style: { fontSize: 12, padding: '6px 0', color: 'var(--dsw-alias-state-error-primary, #ef4444)' } }, view.error)
            : h('div', null,
              h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
                h('button', {
                  type: 'button', onClick: toggle, 'aria-label': playing ? (zh ? '暂停' : 'Pause') : (zh ? '播放' : 'Play'),
                  style: {
                    width: 30, height: 30, borderRadius: '50%', border: 'none', cursor: 'pointer',
                    background: 'var(--dsw-alias-state-success-primary, #22c55e)', color: '#fff', fontSize: 13,
                  },
                }, playing ? '❚❚' : '▶'),
                h('input', {
                  type: 'range', min: 0, max: Math.max(1, duration || 1), step: 0.1, value: current,
                  'aria-label': zh ? '播放进度' : 'Progress',
                  onChange: (event) => {
                    const audio = audioRef.current
                    if (audio !== null) audio.currentTime = Number(event.target.value)
                    setCurrent(Number(event.target.value))
                  },
                  style: { flex: 1, accentColor: 'var(--dsw-alias-state-success-primary, #22c55e)' },
                }),
                h('span', { style: { fontSize: 11, fontVariantNumeric: 'tabular-nums', color: 'var(--dsw-alias-label-tertiary, inherit)' } },
                  Math.round(current) + 's / ' + Math.round(duration || 0) + 's')),
              h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, paddingTop: 8, flexWrap: 'wrap' } },
                h('span', { style: { fontSize: 11, color: 'var(--dsw-alias-label-tertiary, inherit)' } }, zh ? '倍速' : 'Speed'),
                ...SPEEDS.map((speed) => h('button', {
                  key: speed,
                  type: 'button',
                  onClick: () => {
                    emit({ speed })
                    if (audioRef.current !== null) {
                      audioRef.current.playbackRate = speed
                      audioRef.current.preservesPitch = true
                    }
                  },
                  style: {
                    padding: '2px 6px', borderRadius: 4, cursor: 'pointer', fontSize: 11,
                    border: '.5px solid var(--dsw-alias-border-l1, rgba(127,127,127,.3))',
                    background: view.speed === speed ? 'var(--dsw-alias-state-success-primary, #22c55e)' : 'transparent',
                    color: view.speed === speed ? '#fff' : 'var(--dsw-alias-label-secondary, inherit)',
                  },
                }, speed + '×')))),
        h('audio', {
          ref: audioRef,
          'data-dsh-read-aloud-edge': '',
          style: { display: 'none' },
          onTimeUpdate: (event) => setCurrent(event.currentTarget.currentTime),
          onLoadedMetadata: (event) => setDuration(event.currentTarget.duration || 0),
          onEnded: () => setPlaying(false),
          onPlay: () => setPlaying(true),
          onPause: () => setPlaying(false),
        }))
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('conversation.chat.assistant-actions', () => ctx.slots.register({
          name: 'conversation.chat.assistant-actions',
          id: PKG,
          order: 11,
        }, ReadAction))
        ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
          name: 'conversation.input.overlay',
          id: PKG + '-player',
          order: 60,
        }, Player))
      },
    }
  },
})
