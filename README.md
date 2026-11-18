# dsh-read-aloud-edge

Read assistant replies aloud in **DeepSeek Harness (DSH)**, with **1×–4×** playback speed.

> Renamed from `dsh-read-aloud`: that name is already taken on npm by a different plugin. This package is the Edge TTS edition — it synthesizes the reply locally with `edge-tts` and plays it with speed control.

DSH ships speech-to-text (voice input) but no text-to-speech model. This plugin uses the locally installed **edge-tts** (Microsoft Edge online voices) to synthesize the reply, then plays it in a small player with speed control.

## Features

- Speaker button in every assistant reply's action row
- Reads only the reply text, not tool cards or reasoning
- Player with play/pause, progress, and **1× / 1.25× / 1.5× / 2× / 2.5× / 3× / 4×**
- Pitch is preserved when speeding up (`preservesPitch`)
- Audio is cached under `~/.dsh/read-aloud-edge/cache/` by a content hash
- Chinese text uses `zh-CN-XiaoxiaoNeural`; English text uses `en-US-AriaNeural`

## Requirements

- `edge-tts` installed and on one of the known paths, or set `EDGE_TTS_PATH`
- Network access to the Edge TTS service (the reply text is sent to Microsoft's TTS endpoint)

Install:

```bash
pip install edge-tts
# or
uv tool install edge-tts
```

## Install the plugin

```bash
dsh plugin --profile desktop add github:hexiao160705-dev/dsh-read-aloud-edge
```

Or from a checkout:

```bash
dsh plugin --profile desktop add /absolute/path/to/dsh-read-aloud-edge
```

Reload/restart DSH. A speaker icon appears in the action row of each assistant reply.

## Privacy

- The host reads the text from the request, synthesizes it through `edge-tts`, and returns only a cache id + audio URL.
- No API key, account id, or token is read or sent.
- `edge-tts` sends the text to Microsoft's online TTS service; the audio is cached locally. If the reply must not leave the machine, do not use this plugin (a local TTS engine would be needed).
- Cache files stay under `~/.dsh/read-aloud-edge/cache/`; delete that directory to clear them.

## Limitations

- Edge TTS is an online service and may be unavailable or rate-limited.
- Very long replies are truncated to 8,000 characters per synthesis.
- Speed changes use HTML audio playback rate; at 4× the result is fast but pitch-preserved.
- The reply text is located from the rendered chat row; if DSH changes its DOM attributes, the button falls back to the current text selection.

## License

MIT
